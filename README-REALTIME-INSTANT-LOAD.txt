NOIR PLAYBOX — REALTIME INSTANT LOAD V1
=========================================

TUJUAN
=====
Menghilangkan false state:

"Tidak ada device
 Akun ini belum memiliki akses ke unit Playbox."

yang sebelumnya muncul sementara saat /api/realtime/overview masih loading.


PERUBAHAN
=========
1. Device discovery cepat lewat /api/devices.
   Endpoint ini tidak menunggu status Tuya.

2. /api/devices dan /api/realtime/overview berjalan paralel.

3. Setelah daftar device diketahui:
   card PS langsung muncul dalam state LOADING/CHECKING.

4. Registry device disimpan di sessionStorage selama 2 menit.
   Saat kembali ke /realtime, card bisa tampil hampir instan.
   Cache dipisahkan berdasarkan Firebase UID.

5. Status ON/OFF/OFFLINE tetap berasal dari /api/realtime/overview.

6. "Tidak ada device" hanya muncul setelah:
   - auth ready
   - device discovery selesai
   - initial overview selesai
   - hasil benar-benar 0 device

7. Jika kedua proses gagal dan tidak ada device yang bisa ditampilkan,
   user mendapat error + tombol "Coba lagi", bukan pesan akses palsu.


TIDAK DIUBAH
============
- billing
- pricing
- active session
- PREPARING
- SHUTDOWN
- watchdog
- Tuya control
- role/access policy


INSTALL
=======
Dari root project:

unzip -o ~/Downloads/noir-playbox-realtime-instant-load-v1.zip -d .

rm -rf .next

npm run lint
npx tsc --noEmit
npm run build


JIKA SEMUA HIJAU
================
git status --short

git add app/realtime/page.tsx

git commit -m "improve realtime initial loading UX"

git push origin main


VERIFIKASI
==========
Setelah Vercel Ready:

1. Logout/login atau buka tab baru.
2. Klik Realtime.

Expected:
- tidak ada false "Tidak ada device"
- pertama kali: skeleton singkat -> card PS -> status
- kunjungan kedua dalam 2 menit: card PS muncul hampir instan
- Vercel tetap melihat /api/realtime/overview 200
- /api/devices hanya diperlukan saat cache registry belum tersedia
