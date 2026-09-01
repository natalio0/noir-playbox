NOIR PLAYBOX — RENTAL FLOW V2
FAST PREPARING + NO 409 + PERSISTENT SHUTDOWN
============================================================

PATCH INI MENGGANTIKAN
=====================
- noir-playbox-realtime-instant-load-v1
- noir-playbox-fast-rental-operations-v1

Gunakan patch V2 ini saja di atas project yang sudah mendapat FINAL AUDIT.


1. REALTIME INITIAL LOAD
========================
- Tidak lagi menampilkan false "Tidak ada device" saat data masih loading.
- Device discovery cepat via /api/devices.
- Registry cache browser 2 menit.
- /api/realtime/overview tetap menjadi sumber status realtime.


2. ON -> PREPARING LEBIH CEPAT DAN FAIL-SAFE
=============================================
SEBELUM:
Tuya ON
-> tunggu
-> POST PREPARING
-> baru UI PREPARING

SEKARANG:
Klik SIAPKAN RENTAL
-> UI langsung PREPARING (optimistic, package masih disabled)
-> Tuya ON + POST PREPARING berjalan PARALEL
-> keduanya sukses -> PREPARING resmi aktif

Safety:
- Tuya sukses tapi PREPARING gagal -> BARDI STOP rollback.
- PREPARING sukses tapi Tuya gagal -> PREPARING ditutup tanpa billing.

Tujuan: tidak ada monitor ON tanpa audit PREPARING.


3. BILLING TIDAK LAGI PATCH PREPARING / ACTIVATE
=================================================
POST /api/sessions sekarang transactionally:
- validasi device/cafe/access
- cek tidak ada ACTIVE billing
- cek Shutdown Mode tidak ACTIVE
- create billing session
- create INITIAL package
- cari/convert PREPARING pada transaction yang sama
- return object session lengkap

Jadi log normal TIDAK lagi membutuhkan:
PATCH /api/preparing/{id}/activate

409 PREPARING activate dari flow lama harus hilang.


4. STOP RENTAL = FIREBASE FIRST
================================
STOP:
PATCH session complete
-> Firebase COMPLETED
-> SHUTDOWN_PENDING langsung dibuat
-> UI billing langsung selesai
-> BARDI STOP berjalan background

Billing tetap Firebase source of truth.


5. SHUTDOWN PERSISTENT
======================
Setelah rental selesai dibuat record:
SHUTDOWN_PENDING

Status ini tersimpan di Firebase sehingga:
- refresh tidak hilang
- pindah halaman tidak hilang
- logout/login tidak hilang
- tidak perlu membuat sesi rental baru hanya untuk shutdown PS4

Flow:
ACTIVE RENTAL
-> COMPLETED
-> SHUTDOWN_PENDING
-> klik SHUTDOWN MODE
-> monitor ON tanpa billing / PREPARING
-> SHUTDOWN_ACTIVE
-> matikan PS4 normal
-> SELESAI SHUTDOWN
-> monitor OFF
-> SHUTDOWN_COMPLETED

Jika customer berikutnya langsung memakai PS4:
SHUTDOWN_PENDING tetap dipertahankan selama PREPARING.
Saat billing baru benar-benar sukses, pending lama otomatis menjadi:
SHUTDOWN_SKIPPED_REUSED

Jadi bila persiapan rental dibatalkan sebelum billing, pending shutdown lama
masih bisa muncul kembali.


6. DETAIL PAGE INITIAL LOAD
===========================
Restore ACTIVE session dan status Tuya sekarang berjalan paralel.
Tidak lagi menunggu session selesai dulu baru GET Tuya.


FILES
=====
app/realtime/page.tsx
app/realtime/[deviceId]/page.tsx
app/api/preparing/start/route.ts
app/api/sessions/route.ts
app/api/sessions/[sessionId]/complete/route.ts
app/api/shutdown/active/route.ts
app/api/shutdown/start/route.ts
app/api/shutdown/[shutdownId]/complete/route.ts
lib/preparing.ts


INSTALL
=======
Dari root noir-playbox:

unzip -o ~/Downloads/noir-playbox-rental-flow-v2.zip -d .

rm -rf .next

npm run lint
npx tsc --noEmit
npm run build

JANGAN COMMIT bila salah satu gagal.


STAGE JIKA SEMUA HIJAU
======================
git add \
  app/realtime/page.tsx \
  'app/realtime/[deviceId]/page.tsx' \
  app/api/preparing/start/route.ts \
  app/api/sessions/route.ts \
  'app/api/sessions/[sessionId]/complete/route.ts' \
  app/api/shutdown/active/route.ts \
  app/api/shutdown/start/route.ts \
  'app/api/shutdown/[shutdownId]/complete/route.ts' \
  lib/preparing.ts

git commit -m "fix and speed up rental lifecycle"
git push origin main


SMOKE TEST SETELAH VERCEL READY
===============================
1. Buka /realtime -> tidak ada false "Tidak ada device".
2. Buka PS01.
3. Klik SIAPKAN RENTAL.
   Expected: PREPARING langsung terlihat dan tidak ada GET preparing/active
   sebagai prasyarat klik.
4. Pilih paket.
   Expected: /api/sessions 200 dan TIDAK ADA PATCH preparing/.../activate.
5. Add Time satu kali.
6. STOP rental.
   Expected: session complete 200 dan card SHUTDOWN_PENDING muncul.
7. REFRESH halaman.
   Expected: card shutdown masih ada.
8. Klik SHUTDOWN MODE.
   Expected: monitor ON, tidak ada billing, tidak ada PREPARING baru.
9. Matikan PS4 secara normal, klik SELESAI SHUTDOWN.
   Expected: monitor OFF, card shutdown hilang.
10. Test rental kedua langsung setelah rental selesai:
   klik SIAPKAN RENTAL BERIKUTNYA -> PREPARING -> pilih paket.
   Pending lama otomatis ditutup sebagai reuse setelah billing berhasil.


VALIDASI CHATGPT SEBELUM ZIP
============================
- TypeScript/TSX syntax scan: 89 files, 0 syntax errors.
- Local @/ import resolution: 0 missing.
- Full npm lint/typecheck/build tidak dapat dijalankan di environment pembuat
  patch karena node_modules lengkap tidak tersedia. Jalankan tiga command
  validasi di Mac sebelum commit.
