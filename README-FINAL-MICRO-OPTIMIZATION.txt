NOIR PLAYBOX — FINAL MICRO OPTIMIZATION V1
============================================

PATCH BASIS
===========
Gunakan setelah:
- Rental Flow V2 + fix1
- Tuya Refresh Dedupe V1

PATCH ini hanya mengubah:
app/realtime/[deviceId]/page.tsx


PERUBAHAN
=========
1. Pause polling Tuya 4 detik setelah aksi.
   Polling reguler tidak boleh bertabrakan dengan command/verification.

2. Satu verification timer.
   Aksi baru mengganti timer lama sehingga tidak membuat GET status bertumpuk.

3. Existing in-flight dedupe tetap dipakai.
   Maksimal satu GET /api/tuya/device/<PS> berjalan pada satu waktu.

4. SHUTDOWN MODE menjadi Firebase-first:
   SHUTDOWN_PENDING
   -> POST /api/shutdown/start
   -> SHUTDOWN_ACTIVE tersimpan
   -> baru POST /api/tuya/control ON

5. Recovery shutdown:
   Jika Firebase sudah SHUTDOWN_ACTIVE tetapi monitor gagal ON,
   state shutdown tidak hilang.
   UI menampilkan tombol "NYALAKAN MONITOR" untuk retry.
   Tidak membuat billing dan tidak membuat PREPARING.

6. SELESAI SHUTDOWN tetap aman:
   monitor STOP lebih dulu,
   lalu audit shutdown ditutup setelah monitor berhasil dimatikan.


TIDAK DIUBAH
============
- harga/paket rental
- billing Firebase sebagai source of truth
- PREPARING anti-fraud
- watchdog
- ADD TIME transaction
- shutdown persistence
- role/cafe access


INSTALL
=======
Dari root project:

unzip -o ~/Downloads/noir-playbox-final-micro-optimization-v1.zip -d .

rm -rf .next

npm run lint
npx tsc --noEmit
npm run build


JIKA SEMUA HIJAU
================
git status --short

Stage hanya file production:

git add 'app/realtime/[deviceId]/page.tsx'

git commit -m "finalize Tuya polling and shutdown flow"
git push origin main


EXPECTED LOG
============
SIAPKAN RENTAL:
POST /api/preparing/start
POST /api/tuya/control
GET  /api/tuya/device/PS01    <- verification tunggal

BILLING:
POST /api/tuya/control
POST /api/sessions
GET  /api/tuya/device/PS01    <- verification tunggal

STOP:
PATCH /api/sessions/.../complete
POST  /api/tuya/control
GET   /api/tuya/device/PS01   <- verification tunggal

SHUTDOWN MODE:
POST /api/shutdown/start       <- harus lebih dulu
POST /api/tuya/control
GET  /api/tuya/device/PS01

Tidak diharapkan:
GET /api/tuya/device/PS01
GET /api/tuya/device/PS01
dengan jarak ratusan milidetik setelah satu aksi.
