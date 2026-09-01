NOIR PLAYBOX — TUYA REFRESH DEDUPE V1
======================================

Tujuan:
- mengurangi GET /api/tuya/device/PS01 yang berdekatan setelah aksi
- tidak mengubah billing, PREPARING, shutdown, watchdog, atau source of truth

Perubahan:
1. Maksimal satu GET status Tuya in-flight per halaman detail.
2. Polling normal skip jika request Tuya baru terjadi <3 detik.
3. Verification setelah command ditunda 1.2 detik agar state smart plug sempat settle.
4. Semua verification memakai satu timer; action baru mengganti timer lama.
5. Initial page load tetap force fetch.
6. UI tetap optimistic; operator tidak menunggu verification GET.

Install:
unzip -o ~/Downloads/noir-playbox-tuya-refresh-dedupe-v1.zip -d .
rm -rf .next
npm run lint
npx tsc --noEmit
npm run build

Jika hijau:
git add 'app/realtime/[deviceId]/page.tsx'
git commit -m "dedupe Tuya status refreshes"
git push origin main

Expected log:
- satu GET Tuya sekitar 1-2 detik setelah action sebagai verification
- tidak ada lagi 2-3 GET Tuya yang berhimpitan dalam 1-2 detik
- polling reguler tetap jalan sesuai Settings
