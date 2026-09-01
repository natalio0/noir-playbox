NOIR PLAYBOX — LOCAL GATEWAY PILOT V1
====================================

TUJUAN
------
Menguji integrasi existing Next.js Noir Playbox -> local TinyTuya gateway
di Mac TANPA mengubah production rental flow.

Yang ditambahkan:
- /local-gateway
- /api/dev/local-gateway
- ./local-gateway (Python/TinyTuya service)

PENTING
-------
Route /api/dev/local-gateway otomatis 404 ketika NODE_ENV=production.
Jadi pilot ini tidak menjadi jalur kontrol production secara tidak sengaja.

Tidak mengubah:
- Firebase billing
- PREPARING
- sessions
- shutdown
- watchdog
- Tuya Cloud API routes
- API Saver

LANGKAH 1 — APPLY KE PROJECT LOKAL
---------------------------------
Dari root project Noir Playbox:

unzip -o ~/Downloads/noir-playbox-local-pilot-v1.zip -d .

JANGAN commit/push patch pilot ini dulu.

LANGKAH 2 — INSTALL GATEWAY
---------------------------
cd local-gateway
./scripts/install-mac.sh
source .venv/bin/activate

Pastikan Mac dan BARDI PS01 berada pada LAN/Wi-Fi yang sama.

Scan:

./scripts/scan.sh

Ambil local_key dengan wizard:

./scripts/wizard.sh

Region Tuya Noir Playbox:
sg

JANGAN kirim Access Secret/local_key/devices.json ke chat/GitHub.

LANGKAH 3 — CONFIG PS01
-----------------------
Jika config belum ada:

cp config/playboxes.example.json config/playboxes.json

Isi lokal:
- tuyaDeviceId
- ip
- version
- switchDps (mulai dari 1)
- apiToken: buat token random lokal

Token random bisa dibuat:

openssl rand -hex 32

Value token ini dipakai di:
local-gateway/config/playboxes.json -> apiToken

dan .env.local project:
NOIR_LOCAL_GATEWAY_TOKEN=<TOKEN_YANG_SAMA>

Tambahkan juga:

NOIR_LOCAL_GATEWAY_URL=http://127.0.0.1:8787

LANGKAH 4 — TEST TINYTUYA LANGSUNG
----------------------------------
Masih di folder local-gateway:

python gateway.py status PS01
python gateway.py on PS01
python gateway.py off PS01

Jika berhasil, jalankan server:

./scripts/run-gateway.sh

Biarkan Terminal ini terbuka.

LANGKAH 5 — TEST DARI NEXT.JS
-----------------------------
Buka Terminal kedua:

cd /Users/hazel/Documents/noir-playbox
npm run dev

Buka:
http://localhost:3000/local-gateway

Test:
STATUS
ON
OFF

Target:
Transport: LOCAL_TINYTUYA
Result: SUCCESS
Latency: local LAN latency

Tuya Developer Cloud API tidak dipanggil oleh tiga action pilot ini.

VALIDASI CLOUD API
------------------
Saat menekan STATUS/ON/OFF pada /local-gateway:
- jangan buka flow rental production
- lihat Tuya Cloud Usage sesudah beberapa test
- pilot local ini sendiri tidak memanggil /api/tuya/control atau
  /api/tuya/device/* di Noir Playbox.

FASE BERIKUTNYA (BELUM DI V1)
-----------------------------
Setelah PS01 stabil:
1. Firebase command queue
2. gateway heartbeat
3. local-first transport
4. Tuya Cloud fallback jika gateway offline
5. watchdog local command
6. pindah service ke Termux Pad SE

Kita baru kerjakan fase itu setelah local ON/OFF benar-benar terbukti.
