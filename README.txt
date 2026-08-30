NOIR PLAYBOX — VERCEL HOBBY WATCHDOG V1
=========================================

MASALAH
=======
Vercel Hobby menolak:

*/5 * * * *

karena Hobby hanya mengizinkan cron harian.


SOLUSI
======
Patch ini:
- menghapus cron watchdog dari vercel.json
- TIDAK menghapus endpoint watchdog
- TIDAK mengubah logic auto-OFF
- TIDAK mengubah CRON_SECRET
- membuat project bisa deploy di Hobby


INSTALL
=======
Dari root project:

unzip -o ~/Downloads/noir-vercel-hobby-watchdog-v1.zip -d .

node scripts/remove-vercel-watchdog-cron.mjs

cat vercel.json

npm run lint
npx tsc --noEmit
npm run build


HASIL YANG DIHARAPKAN
=====================
vercel.json tidak lagi punya:

"crons": [
  {
    "path": "/api/system/preparing-watchdog",
    "schedule": "*/5 * * * *"
  }
]


ENDPOINT WATCHDOG TETAP ADA
===========================
GET /api/system/preparing-watchdog

Authorization:
Bearer <CRON_SECRET>


SETELAH ITU
===========
Commit perubahan:

git add .
git commit -m "make watchdog compatible with Vercel Hobby"
git push origin main

Kemudian Vercel akan auto-deploy dari GitHub.

Jika tidak auto deploy:
Vercel Dashboard
-> Project
-> Deployments
-> Redeploy


EXTERNAL SCHEDULER
==================
Nanti scheduler eksternal cukup memanggil:

https://DOMAIN-VERCEL-KAMU.vercel.app/api/system/preparing-watchdog

Method:
GET

Header:
Authorization: Bearer <CRON_SECRET>

Interval:
setiap 5 menit


PENTING
=======
Dengan interval 5 menit:
PREPARING threshold tetap >=60 menit,
jadi shutdown nyata biasanya terjadi sekitar menit 60–65.

Jangan taruh CRON_SECRET di URL/query string.
Gunakan Authorization header.
