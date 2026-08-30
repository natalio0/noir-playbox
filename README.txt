NOIR PLAYBOX
PREPARING WATCHDOG — VERCEL PRODUCTION V1
==========================================

STATUS SEBELUM PATCH
====================
Local end-to-end sudah terbukti:

PS01 ON
-> PREPARING ACTIVE
-> startedAt dibuat 61 menit lalu
-> watchdog
-> checked=1
-> autoShutdown=1
-> failed=0
-> switch_1=false
-> PREPARING NONE

Patch ini TIDAK mengubah logic auto-shutdown yang sudah lolos test.


YANG DITAMBAHKAN
================
1. Production hardening:
   app/api/system/preparing-watchdog/route.ts

2. Safe vercel.json merger:
   scripts/install-vercel-watchdog-cron.mjs

3. Secret generator:
   scripts/generate-cron-secret.mjs

4. Reference config:
   vercel.watchdog.example.json


INSTALL
=======
Dari root project noir-playbox:

unzip -o ~/Downloads/noir-watchdog-vercel-production-v1.zip -d .

node scripts/install-vercel-watchdog-cron.mjs

npm run lint
npx tsc --noEmit
npm run build


CEK VERCEL.JSON
===============
cat vercel.json

Harus mengandung:

{
  "path": "/api/system/preparing-watchdog",
  "schedule": "*/5 * * * *"
}

Installer MERGE config:
- tidak menghapus property vercel.json lain
- tidak menghapus cron lain
- jika watchdog cron sudah ada, hanya mengganti jadwal/path entry tersebut


PRODUCTION SECRET
=================
JANGAN pakai secret lama yang pernah dipakai saat debugging/chat.

Generate secret BARU:

node scripts/generate-cron-secret.mjs

Copy hasilnya.

Di Vercel:
Project
-> Settings
-> Environment Variables
-> Add

Name:
CRON_SECRET

Value:
<secret baru>

Environment:
Production

Simpan lalu REDEPLOY.


KENAPA CRON_SECRET?
===================
Endpoint:
GET /api/system/preparing-watchdog

memerlukan:

Authorization: Bearer <CRON_SECRET>

Endpoint fail-closed:
- CRON_SECRET/WATCHDOG_SECRET tidak ada -> 503
- bearer salah/tidak ada -> 401
- secret tidak pernah ditulis ke log

Perbandingan secret memakai timingSafeEqual.


JADWAL
======
*/5 * * * *

= setiap 5 menit.

Threshold bisnis tetap:
PREPARING >=60 menit

Karena cron scan setiap 5 menit, praktik production:
auto-OFF terjadi sekitar menit 60–65.

Itu normal dan sesuai desain scheduler periodik.


PENTING: VERCEL PLAN
====================
Jadwal 5 menit membutuhkan Vercel plan yang mengizinkan cron lebih dari sekali sehari.

Jika deploy menolak cron dengan pesan bahwa Hobby hanya boleh daily,
jangan ubah watchdog logic.

Pilihan:
1. upgrade plan Vercel yang mendukung frequency ini, atau
2. gunakan external scheduler untuk hit endpoint yang sama.


PRODUCTION HARDENING
====================
Route sekarang:
- Node.js runtime eksplisit
- force dynamic
- no cache
- maxDuration=60
- GET + POST terlindungi bearer secret
- fail closed jika secret tidak ada
- timing-safe secret comparison
- runId per eksekusi
- durationMs logging
- tidak log Authorization/token
- tidak mengirim stack trace ke client


SEBELUM DEPLOY
==============
Jalankan:

npm run lint
npx tsc --noEmit
npm run build

Semua harus PASS.


SETELAH DEPLOY
==============
1. Pastikan CRON_SECRET Production sudah ada.
2. Redeploy.
3. Cek Cron Jobs di Vercel.
4. Path harus:
   /api/system/preparing-watchdog
5. Schedule:
   */5 * * * *

Untuk smoke test manual production, jangan menaruh CRON_SECRET di chat/log.


CATATAN SECURITY
================
Endpoint development:
- /api/dev/test-preparing
- /api/dev/test-preparing/age

sudah dirancang menolak NODE_ENV=production.

Halaman:
- /admin/watchdog-test

adalah tooling development/admin dan tidak diperlukan sebagai scheduler.


ROLLBACK
========
Jika perlu rollback cron saja:

hapus entry:
{
  "path": "/api/system/preparing-watchdog",
  "schedule": "*/5 * * * *"
}

dari vercel.json lalu redeploy.

Logic preparing-watchdog tetap tidak perlu diubah.
