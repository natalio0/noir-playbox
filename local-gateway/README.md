# Noir Playbox Local Gateway v0.1

Starter gateway untuk mengontrol BARDI/Tuya smart plug **langsung lewat LAN**, tanpa memakai Cloud API untuk operasi normal.

## Tujuan fase ini

1. MacBook dipakai sebagai gateway sementara untuk menguji PS01.
2. Pastikan `status / ON / OFF` berhasil lokal.
3. Setelah Xiaomi Pad SE datang, folder yang sama dipindah ke Termux.
4. Baru setelah local control terbukti stabil, gateway dihubungkan ke Firebase/dashboard Noir Playbox.

TinyTuya memang mendukung status dan kontrol perangkat Tuya langsung melalui LAN. Untuk akses lokal dibutuhkan Device ID, IP, protocol version, dan `local_key`. Wizard TinyTuya bisa mengambil local keys dari Tuya IoT project dan menyimpannya ke `devices.json`.

## KEAMANAN

`devices.json` berisi **local_key**. Itu rahasia.

Jangan:
- upload `devices.json` ke GitHub;
- kirim local_key ke chat;
- kirim Access Secret Tuya ke chat;
- commit `config/playboxes.json`.

`.gitignore` project ini sudah mengabaikan file-file tersebut.

## Setup Mac sekarang

```bash
unzip noir-playbox-local-gateway-v0.1.zip
cd noir-playbox-local-gateway-v0.1

./scripts/install-mac.sh
source .venv/bin/activate
```

Pastikan Mac dan smart plug PS01 berada di Wi-Fi/LAN yang sama.

### 1. Scan perangkat lokal

```bash
./scripts/scan.sh
```

Catat **Device ID + IP + Version** PS01. Jangan kirim local key.

Jika discovery via broadcast gagal, bukan berarti local control pasti gagal; router/AP tertentu memblokir UDP broadcast.

### 2. Ambil local_key

```bash
./scripts/wizard.sh
```

Wizard meminta Tuya Access ID, Access Secret, region, dan sample Device ID.

Untuk project Noir Playbox, region adalah:

```text
sg
```

Wizard akan menghasilkan `devices.json`.

### 3. Mapping PS01

```bash
cp config/playboxes.example.json config/playboxes.json
```

Edit **hanya lokal** `config/playboxes.json`:

- `tuyaDeviceId`: Device ID PS01
- `ip`: IP PS01 dari scan, atau sementara `Auto`
- `version`: versi dari scan, misalnya 3.4/3.5
- `switchDps`: mulai dari 1

**Tidak perlu menyalin local_key ke config.** Gateway mengambilnya dari `devices.json`.

### 4. Test

```bash
python gateway.py list
python gateway.py status PS01
python gateway.py on PS01
python gateway.py off PS01
```

Kalau empat command itu berhasil, local Tuya pilot dianggap sukses.

## Local HTTP gateway

Set `listenHost` menjadi `127.0.0.1` untuk test lokal saja.

```bash
python gateway.py serve
```

Health:

```bash
curl http://127.0.0.1:8787/health
```

Status memerlukan `X-Gateway-Token` jika `apiToken` sudah diganti:

```bash
curl   -H "X-Gateway-Token: TOKEN_LOKAL"   http://127.0.0.1:8787/status/PS01
```

Control:

```bash
curl -X POST   -H "X-Gateway-Token: TOKEN_LOKAL"   http://127.0.0.1:8787/control/PS01/on
```

## Saat Xiaomi Pad SE datang

Install Termux dan Termux:Boot dari **sumber yang sama**. Plugin Termux harus memakai signature/source yang sama.

Copy folder gateway ke tablet, lalu:

```bash
./scripts/install-termux.sh
python gateway.py status PS01
```

Setelah local test berhasil:

```bash
./scripts/install-termux-boot.sh
```

Boot script:
- menjalankan `termux-wake-lock`;
- menjalankan gateway otomatis;
- restart gateway 5 detik setelah crash;
- menulis log ke `logs/gateway.log`.

Termux:Boot perlu dibuka sekali setelah instalasi agar boot receiver aktif.

## Yang belum dilakukan di v0.1

Versi ini **sengaja belum mengubah production Noir Playbox**.

Belum ada:
- Firebase command listener;
- heartbeat gateway ke dashboard;
- local-first / Tuya Cloud fallback;
- watchdog → local gateway.

Itu fase berikutnya setelah PS01 terbukti benar-benar dapat ON/OFF lewat LAN. Ini menghindari membongkar production sebelum kita tahu firmware BARDI kamu kompatibel dengan local Tuya.

## Troubleshooting cepat

`914 / ERR_KEY_OR_VER`:
- local_key salah atau protocol version salah;
- ulang wizard / cek version dari scan.

Device tidak ditemukan:
- Mac/tablet dan plug harus satu LAN;
- AP/client isolation harus OFF;
- TinyTuya scan menggunakan UDP 6666/6667/7000 dan local TCP 6668;
- pertimbangkan DHCP reservation untuk IP plug nanti.

Setelah plug di-remove/re-pair:
- local_key bisa berubah;
- jalankan wizard lagi.
