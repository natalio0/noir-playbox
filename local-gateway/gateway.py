#!/usr/bin/env python3
"""
Noir Playbox Local Gateway v0.1

Purpose:
- Local LAN control for Tuya/BARDI smart plugs using TinyTuya.
- Same Python code runs on macOS and Android/Termux.
- No Tuya Cloud request is used by normal status/on/off commands.

Secrets:
- TinyTuya devices.json contains local_key values. Never commit/share it.
- config/playboxes.json may contain a local API token. Never commit/share it.
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import threading
import time
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

try:
    import tinytuya
except ImportError:
    print("TinyTuya belum terinstall. Jalankan script install terlebih dahulu.", file=sys.stderr)
    raise

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_CONFIG = BASE_DIR / "config" / "playboxes.json"


class GatewayError(RuntimeError):
    pass


@dataclass
class PlayboxDevice:
    playbox_id: str
    tuya_device_id: str
    local_key: str
    ip: str
    version: float
    switch_dps: int


def load_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text())
    except FileNotFoundError as exc:
        raise GatewayError(f"File tidak ditemukan: {path}") from exc
    except json.JSONDecodeError as exc:
        raise GatewayError(f"JSON tidak valid: {path}: {exc}") from exc


class Gateway:
    def __init__(self, config_path: Path):
        self.config_path = config_path.resolve()
        self.config = load_json(self.config_path)
        devices_path = Path(self.config.get("devicesFile", "../devices.json"))
        if not devices_path.is_absolute():
            devices_path = (self.config_path.parent / devices_path).resolve()
        self.devices_path = devices_path
        self.device_rows = load_json(self.devices_path)
        if not isinstance(self.device_rows, list):
            raise GatewayError("devices.json TinyTuya harus berupa JSON array.")
        self._lock = threading.RLock()

    def _find_tuya_row(self, device_id: str) -> dict[str, Any]:
        for row in self.device_rows:
            if str(row.get("id", "")) == device_id:
                return row
        raise GatewayError(
            f"Device ID {device_id!r} tidak ditemukan di {self.devices_path.name}. "
            "Jalankan TinyTuya wizard lagi atau cek mapping PSxx."
        )

    def resolve(self, playbox_id: str) -> PlayboxDevice:
        playbox_id = playbox_id.upper()
        mapping = (self.config.get("playboxes") or {}).get(playbox_id)
        if not mapping:
            raise GatewayError(f"{playbox_id} tidak ada di config/playboxes.json")

        tuya_device_id = str(mapping.get("tuyaDeviceId") or "").strip()
        if not tuya_device_id:
            raise GatewayError(f"{playbox_id}: tuyaDeviceId belum diisi")

        row = self._find_tuya_row(tuya_device_id)
        local_key = str(row.get("key") or row.get("local_key") or "").strip()
        if not local_key:
            raise GatewayError(
                f"{playbox_id}: local_key tidak ditemukan. Jalankan `python -m tinytuya wizard`."
            )

        ip = str(mapping.get("ip") or row.get("ip") or "Auto").strip()
        raw_version = mapping.get("version")
        if raw_version is None:
            raw_version = row.get("version") or row.get("ver")
        if raw_version is None:
            raise GatewayError(
                f"{playbox_id}: protocol version belum diketahui. "
                "Jalankan `python -m tinytuya scan` lalu isi version di config."
            )

        try:
            version = float(raw_version)
        except (TypeError, ValueError) as exc:
            raise GatewayError(f"{playbox_id}: version tidak valid: {raw_version!r}") from exc

        switch_dps = int(mapping.get("switchDps", 1))
        return PlayboxDevice(
            playbox_id=playbox_id,
            tuya_device_id=tuya_device_id,
            local_key=local_key,
            ip=ip,
            version=version,
            switch_dps=switch_dps,
        )

    @staticmethod
    def _client(d: PlayboxDevice):
        client = tinytuya.OutletDevice(
            dev_id=d.tuya_device_id,
            address=d.ip,
            local_key=d.local_key,
            version=d.version,
        )
        client.set_socketTimeout(3)
        client.set_socketRetryLimit(2)
        return client

    @staticmethod
    def _clean_result(data: Any) -> dict[str, Any]:
        if isinstance(data, dict):
            # TinyTuya errors commonly include Error/Err fields. Keep them for diagnostics.
            return data
        return {"result": data}

    def status(self, playbox_id: str) -> dict[str, Any]:
        d = self.resolve(playbox_id)
        with self._lock:
            started = time.perf_counter()
            data = self._client(d).status()
            elapsed = round((time.perf_counter() - started) * 1000, 1)
        result = self._clean_result(data)
        dps = result.get("dps") if isinstance(result, dict) else None
        switch_value = None
        if isinstance(dps, dict):
            switch_value = dps.get(str(d.switch_dps), dps.get(d.switch_dps))
        return {
            "ok": "Error" not in result and "Err" not in result,
            "playboxId": d.playbox_id,
            "switch": switch_value,
            "latencyMs": elapsed,
            "raw": result,
        }

    def control(self, playbox_id: str, turn_on: bool) -> dict[str, Any]:
        d = self.resolve(playbox_id)
        with self._lock:
            started = time.perf_counter()
            client = self._client(d)
            data = client.set_status(turn_on, d.switch_dps)
            elapsed = round((time.perf_counter() - started) * 1000, 1)
        result = self._clean_result(data)
        return {
            "ok": "Error" not in result and "Err" not in result,
            "playboxId": d.playbox_id,
            "requested": "ON" if turn_on else "OFF",
            "latencyMs": elapsed,
            "raw": result,
        }

    def list_devices(self) -> dict[str, Any]:
        output = []
        for playbox_id in sorted((self.config.get("playboxes") or {}).keys()):
            try:
                d = self.resolve(playbox_id)
                output.append({
                    "playboxId": d.playbox_id,
                    "configured": True,
                    "ip": d.ip,
                    "version": d.version,
                    "switchDps": d.switch_dps,
                })
            except Exception as exc:
                output.append({
                    "playboxId": playbox_id,
                    "configured": False,
                    "error": str(exc),
                })
        return {"gatewayId": self.config.get("gatewayId"), "devices": output}


def print_json(value: Any) -> None:
    print(json.dumps(value, indent=2, ensure_ascii=False))


class Handler(BaseHTTPRequestHandler):
    server_version = "NoirPlayboxGateway/0.1"

    @property
    def gateway(self) -> Gateway:
        return self.server.gateway  # type: ignore[attr-defined]

    def log_message(self, fmt: str, *args: Any) -> None:
        sys.stdout.write(
            f"[HTTP] {self.address_string()} - {fmt % args}\n"
        )
        sys.stdout.flush()

    def _json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        token = str(self.gateway.config.get("apiToken") or "")
        if not token or token == "CHANGE_ME_LONG_RANDOM_TOKEN":
            return self.client_address[0] in {"127.0.0.1", "::1"}
        supplied = self.headers.get("X-Gateway-Token", "")
        return supplied == token

    def do_GET(self) -> None:
        try:
            path = [p for p in urlparse(self.path).path.split("/") if p]
            if path == ["health"]:
                self._json(200, {
                    "ok": True,
                    "gatewayId": self.gateway.config.get("gatewayId"),
                    "time": int(time.time()),
                })
                return

            if not self._authorized():
                self._json(401, {"ok": False, "error": "Unauthorized"})
                return

            if path == ["devices"]:
                self._json(200, self.gateway.list_devices())
                return

            if len(path) == 2 and path[0] == "status":
                self._json(200, self.gateway.status(path[1]))
                return

            self._json(404, {"ok": False, "error": "Not found"})
        except GatewayError as exc:
            self._json(400, {"ok": False, "error": str(exc)})
        except Exception as exc:
            self._json(500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"})

    def do_POST(self) -> None:
        try:
            if not self._authorized():
                self._json(401, {"ok": False, "error": "Unauthorized"})
                return

            path = [p for p in urlparse(self.path).path.split("/") if p]
            if len(path) == 3 and path[0] == "control" and path[2] in {"on", "off"}:
                self._json(200, self.gateway.control(path[1], path[2] == "on"))
                return

            self._json(404, {"ok": False, "error": "Not found"})
        except GatewayError as exc:
            self._json(400, {"ok": False, "error": str(exc)})
        except Exception as exc:
            self._json(500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"})


def serve(gateway: Gateway) -> None:
    host = str(gateway.config.get("listenHost") or "127.0.0.1")
    port = int(gateway.config.get("listenPort") or 8787)
    server = ThreadingHTTPServer((host, port), Handler)
    server.gateway = gateway  # type: ignore[attr-defined]

    stop_event = threading.Event()

    def stop_handler(*_: Any) -> None:
        if not stop_event.is_set():
            stop_event.set()
            threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT, stop_handler)
    signal.signal(signal.SIGTERM, stop_handler)

    print(f"Noir Playbox Gateway ONLINE: http://{host}:{port}")
    print(f"Gateway ID: {gateway.config.get('gatewayId')}")
    sys.stdout.flush()
    server.serve_forever(poll_interval=0.5)
    server.server_close()
    print("Gateway stopped.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Noir Playbox Local Gateway")
    parser.add_argument(
        "--config",
        default=os.environ.get("NOIR_GATEWAY_CONFIG", str(DEFAULT_CONFIG)),
        help="Path ke playboxes.json",
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    status_p = sub.add_parser("status")
    status_p.add_argument("playbox")
    on_p = sub.add_parser("on")
    on_p.add_argument("playbox")
    off_p = sub.add_parser("off")
    off_p.add_argument("playbox")
    sub.add_parser("serve")

    args = parser.parse_args()

    try:
        gateway = Gateway(Path(args.config))
        if args.command == "list":
            print_json(gateway.list_devices())
        elif args.command == "status":
            print_json(gateway.status(args.playbox))
        elif args.command == "on":
            print_json(gateway.control(args.playbox, True))
        elif args.command == "off":
            print_json(gateway.control(args.playbox, False))
        elif args.command == "serve":
            serve(gateway)
        return 0
    except GatewayError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
