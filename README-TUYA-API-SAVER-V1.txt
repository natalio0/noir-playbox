NOIR PLAYBOX — TUYA CLOUD API SAVER V1
======================================

TUJUAN
======
Menekan CLOUD_API_FOREIGN tanpa mengubah lifecycle rental. Xiaomi/Pad operator
tetap hanya menjadi device operator; tidak perlu Termux/local gateway.

DEFAULT BARU
============
Tuya API Saver: ON

- /realtime overview polling: 15 menit
- /realtime/PSxx detail polling: 10 menit
- tab hidden: tetap tidak polling (existing smart polling)
- initial page load: tetap cek status
- manual refresh: tetap langsung
- verification setelah ON/OFF/TIMER/STOP: tetap langsung seperti sekarang
- Firebase billing/countdown: tidak berubah
- watchdog: tidak berubah

Patch sengaja TIDAK mengubah server Tuya route/cache supaya tidak menambah risiko
status stale setelah operator melakukan action. Penghematan utama datang dari
memotong passive polling 10/15/30 detik menjadi interval menit.

ESTIMASI PASSIVE MONITORING (5 DEVICE)
======================================
Jika overview dibiarkan terbuka 24/7:
15 menit => 4 poll/jam x 24 x 30 x 5 = 14,400 Tuya status reads/bulan.

Jika satu tab detail juga dibiarkan terbuka 24/7:
10 menit => 6 poll/jam x 24 x 30 = 4,320 reads/bulan.

Gabungan passive monitoring ~= 18,720 reads/bulan + request action/operator.
Biasanya lebih rendah karena tab hidden tidak polling dan operator umumnya hanya
membuka satu halaman aktif.

Sebagai pembanding, overview 15 detik untuk 5 device bila terbuka 24/7 secara
teoretis dapat mencapai 864,000 status reads/bulan.

INSTALL
=======
unzip -o ~/Downloads/noir-playbox-tuya-api-saver-v1.zip -d .
rm -rf .next
npm run lint
npx tsc --noEmit
npm run build

STAGE
=====
git add \
  app/settings/page.tsx \
  app/realtime/page.tsx \
  'app/realtime/[deviceId]/page.tsx' \
  hooks/useDashboardPreferences.ts \
  lib/tuya-api-saver.ts

git commit -m "add Tuya cloud API saver mode"
git push origin main

SETTINGS
========
Settings > Dashboard Preferences > Tuya API Saver

ON  = recommended untuk production.
OFF = kembali mengikuti Refresh Interval lama (10/15/30 detik), jauh lebih boros.

VALIDASI
========
1. Existing browser yang belum pernah punya field tuyaApiSaver otomatis dianggap ON.
2. Test SIAPKAN RENTAL -> billing -> ADD TIME -> STOP -> SHUTDOWN.
3. Semua action harus tetap responsif seperti sebelum patch.
4. Di Vercel, /api/realtime/overview tidak lagi muncul setiap 10/15/30 detik.
5. Tombol Refresh tetap dapat dipakai saat operator ingin status terbaru sekarang.
