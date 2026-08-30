import {
  canAccessDevice,
  resolveRegisteredDevice,
} from "@/lib/device-registry";
import { sendTuyaStandardCommands } from "@/lib/tuya-cloud-dynamic";
import { requireUserFromRequest } from "@/lib/require-dashboard-user";

type Action = "ON" | "OFF" | "STOP" | "TIMER" | "ADD_TIME";

export async function POST(request: Request) {
  try {
    const user = await requireUserFromRequest(request);
    const body = await request.json();

    const deviceId = String(body.deviceId ?? "").trim().toUpperCase();
    const action = String(body.action ?? "").toUpperCase() as Action;

    if (!deviceId) {
      return Response.json({ success: false, error: "deviceId wajib diisi" }, { status: 400 });
    }

    if (!["ON", "OFF", "STOP", "TIMER", "ADD_TIME"].includes(action)) {
      return Response.json({ success: false, error: "Action tidak valid" }, { status: 400 });
    }

    const registered = await resolveRegisteredDevice(deviceId);
    if (!registered) {
      return Response.json({ success: false, error: "PlayBox belum terdaftar" }, { status: 404 });
    }
    if (!registered.active) {
      return Response.json({ success: false, error: "PlayBox tidak aktif" }, { status: 403 });
    }
    if (!canAccessDevice(user.profile, registered)) {
      return Response.json({ success: false, error: "Tidak memiliki akses ke device ini" }, { status: 403 });
    }

    const durationMinutes = Math.max(0, Number(body.durationMinutes ?? 0));
    const currentCountdown = Math.max(0, Number(body.currentCountdown ?? 0));

    const commands =
      action === "ON"
        ? [{ code: "switch_1", value: true }]
        : action === "OFF" || action === "STOP"
          ? [
              { code: "countdown_1", value: 0 },
              { code: "switch_1", value: false },
            ]
          : action === "TIMER"
            ? [
                { code: "switch_1", value: true },
                { code: "countdown_1", value: Math.min(86400, Math.round(durationMinutes * 60)) },
              ]
            : [
                { code: "switch_1", value: true },
                {
                  code: "countdown_1",
                  value: Math.min(86400, Math.round(currentCountdown + durationMinutes * 60)),
                },
              ];

    await sendTuyaStandardCommands(registered.tuyaDeviceId, commands);

    return Response.json({
      success: true,
      deviceId: registered.deviceId,
      cafeId: registered.cafeId,
      action,
      commands,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gagal mengontrol Tuya";
    console.error("TUYA STANDARD CONTROL ERROR:", message);
    return Response.json(
      { success: false, error: message === "UNAUTHORIZED" ? "Unauthorized" : message },
      { status: message === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
