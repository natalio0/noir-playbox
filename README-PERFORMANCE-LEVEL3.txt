NOIR PLAYBOX PERFORMANCE OPTIMIZATION — LEVEL 3
================================================

TUJUAN
======
Menghilangkan burst request /api/realtime/overview yang muncul terlalu dekat,
misalnya initial fetch + focus/visibility + polling.

PERUBAHAN
=========
1. /realtime memiliki request dedupe:
   - hanya satu overview request boleh berjalan pada satu waktu
   - auto refresh yang datang dalam <3 detik dilewati
   - manual refresh tetap boleh bypass cooldown
   - manual refresh tidak membuat request overlap

2. useSmartPolling:
   - saat hook dipasang, waktu sinkron awal ditandai
   - focus/visibility tepat setelah mount tidak memicu polling kedua
   - polling normal sesuai Settings tetap berjalan
   - tab tersembunyi tetap tidak dipoll

TIDAK DIUBAH
============
- billing Firebase
- active session logic
- PREPARING
- SHUTDOWN
- watchdog
- Tuya/BARDI control
- role admin / operational

INSTALL
=======
Dari root project:

unzip -o ~/Downloads/noir-playbox-performance-level3-v1.zip -d .
rm -rf .next

npm run lint
npx tsc --noEmit
npm run build

Jika semua hijau:

git status --short

git add app/realtime/page.tsx hooks/useSmartPolling.ts
git commit -m "dedupe realtime polling requests"
git push origin main

VERIFIKASI
==========
Setelah deployment Ready:
- buka /realtime
- diamkan 1-2 menit
- lihat Vercel logs

Target:
- /api/realtime/overview tetap 200
- tidak ada dua overview request dalam jarak 1-3 detik akibat focus/mount
- interval normal mengikuti Settings (default 15 detik)
