NOIR PLAYBOX — FAST RENTAL OPERATIONS V1
=========================================

TUJUAN
=====
Mempercepat operasi utama di halaman detail PS:
- ON -> PREPARING
- Pilih Billing / START RENTAL
- ADD TIME
- STOP SESSION

Tanpa mengubah harga paket, source of truth billing, watchdog, SHUTDOWN,
atau hak akses admin/operational.


APA YANG DIPERCEPAT
===================

1. ON -> PREPARING
------------------
SEBELUM:
Tuya ON
-> GET active PREPARING
-> POST PREPARING jika belum ada
-> delay 500ms
-> GET Tuya lagi

SEKARANG:
Tuya ON
-> UI optimistic ON
-> POST PREPARING langsung (endpoint sudah idempotent)
-> verifikasi Tuya background

Satu GET PREPARING dan blocking refresh Tuya dihapus.


2. PILIH BILLING / START RENTAL
-------------------------------
SEBELUM:
Tuya TIMER
-> POST session
-> GET active session + packages
-> PATCH PREPARING -> billing
-> delay 500ms
-> GET Tuya

SEKARANG:
Tuya TIMER
-> POST session
   - create session
   - create INITIAL package
   - convert PREPARING dalam transaction yang sama bila ada
   - return object session + package lengkap
-> UI langsung ACTIVE
-> verifikasi Tuya background

Jadi restoreActiveSession dan PATCH PREPARING terpisah dihapus dari jalur START.

Server juga bisa menemukan PREPARING aktif berdasarkan device jika client belum
sempat menerima preparingId. Ini mencegah PREPARING tertinggal saat billing mulai.


3. ADD TIME
-----------
SEBELUM:
Tuya ADD_TIME
-> POST package
-> GET active session + packages
-> GET Tuya
-> common delay + GET Tuya lagi

SEKARANG:
POST package Firebase
-> update session/countdown UI dari response transaction
-> Tuya ADD_TIME
-> verifikasi status background

Tidak ada reload session penuh setelah add time.

Firebase tetap source of truth. Jika sinkron Tuya gagal setelah Firebase berhasil,
UI memberi warning agar operator mengecek device.


4. STOP SESSION
---------------
SEBELUM:
Tuya STOP
-> Firebase COMPLETE
-> query package subcollection saat COMPLETE
-> delay 500ms
-> GET Tuya
-> loading selesai

SEKARANG:
Firebase COMPLETE dahulu
-> UI billing langsung selesai
-> Tuya STOP berjalan background
-> verifikasi Tuya background

Route COMPLETE juga tidak lagi membaca seluruh subcollection packages.
Total menit/harga sudah dijaga transactionally pada session doc oleh ADD TIME.
Jika COMPLETE dan ADD TIME terjadi bersamaan, keduanya menulis session doc yang
sama sehingga Firestore transaction conflict/retry tetap menjaga konsistensi.

Jika STOP BARDI background gagal:
- billing tetap COMPLETED
- operator mendapat warning untuk cek monitor


5. PREPARING START
------------------
PREPARING baru sekarang menggunakan Timestamp.now() dari server dan tidak lagi:
set serverTimestamp -> GET dokumen lagi -> return.

Satu Firestore round-trip dihapus.


EXPECTED REQUEST FLOW
=====================
ON:
POST /api/tuya/control
POST /api/preparing/start

START BILLING:
POST /api/tuya/control
POST /api/sessions

STOP ACTIVE BILLING:
PATCH /api/sessions/:id/complete
(UI selesai)
POST /api/tuya/control  <-- background

ADD TIME:
POST /api/sessions/:id/packages
POST /api/tuya/control

GET Tuya setelah operasi tidak lagi blocking; hanya background verification.


INSTALL
=======
Dari root project noir-playbox:

unzip -o ~/Downloads/noir-playbox-fast-rental-operations-v1.zip -d .

rm -rf .next

npm run lint
npx tsc --noEmit
npm run build


JIKA SEMUA HIJAU
================
git status --short

Stage hanya file patch:

git add \
  'app/realtime/[deviceId]/page.tsx' \
  app/api/sessions/route.ts \
  'app/api/sessions/[sessionId]/complete/route.ts' \
  app/api/preparing/start/route.ts

git commit -m "speed up rental operations"
git push origin main


SMOKE TEST PRODUCTION
=====================
Gunakan PS01 yang aman untuk test.

A. ON
- klik ON
- monitor ON
- PREPARING muncul

B. START BILLING
- pilih paket 1 jam
- session ACTIVE muncul
- PREPARING hilang / converted
- harga dan countdown benar

C. ADD TIME
- tambah paket
- total harga dan menit langsung berubah
- monitor tetap ON

D. STOP
- billing langsung selesai
- history/revenue tetap benar
- BARDI OFF sesaat setelahnya

E. Vercel Logs
Target START BILLING tidak lagi memiliki:
GET /api/sessions/active setelah POST /api/sessions
PATCH /api/preparing/.../activate setelah POST /api/sessions

Target STOP:
PATCH /api/sessions/.../complete muncul sebelum /api/tuya/control.


PENTING
=======
- Billing tetap Firebase source of truth.
- Paket tetap server-authoritative.
- Tidak mengubah watchdog >=60 menit.
- Tidak mengubah SHUTDOWN mode.
- Tidak mengubah role/cafe authorization.
