NOIR PLAYBOX PERFORMANCE OPTIMIZATION — LEVEL 2
================================================

APA YANG BERUBAH
================
Halaman /realtime sebelumnya melakukan:
- GET /api/devices
- GET /api/tuya/device/PS01
- GET /api/sessions/active?deviceId=PS01
- GET /api/tuya/device/PS02
- GET /api/sessions/active?deviceId=PS02
- dst...

Untuk 5 unit, satu refresh browser bisa menghasilkan sekitar 11 request.

LEVEL 2 menggantinya menjadi:
- GET /api/realtime/overview

Browser hanya melakukan 1 request per refresh/polling.

DI SERVER
=========
Endpoint batch:
- verifikasi Firebase token 1x
- membaca daftar device user 1x
- membaca semua session ACTIVE 1x
- mengambil status Tuya semua device secara paralel

Logic billing tetap bersumber dari Firebase session.
Tuya hanya untuk status device.
Watchdog dan lifecycle rental tidak diubah.

INSTALL
=======
Jalankan dari root project noir-playbox:

unzip -o ~/Downloads/noir-playbox-performance-level2-v1.zip -d .

rm -rf .next

npm run lint
npx tsc --noEmit
npm run build

Kalau semua hijau:

git status --short

Kemudian:
git add app README-PERFORMANCE-LEVEL2.txt
git commit -m "batch realtime monitoring requests"
git push origin main

VERIFIKASI DI VERCEL
====================
Setelah deploy Ready, buka /realtime lalu cek Vercel logs.

Target:
GET /api/realtime/overview 200

Tidak lagi ada burst request browser ke:
- /api/tuya/device/PS01 ... PS05
- /api/sessions/active per PS

CATATAN
=======
Endpoint detail /realtime/[deviceId] masih boleh memakai endpoint per-device.
Optimasi Level 2 fokus ke overview /realtime yang menampilkan semua unit.
