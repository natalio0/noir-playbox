NOIR PLAYBOX — FIREBASE ADMIN VERCEL V1
=========================================

TUJUAN
======
Firebase Admin tidak lagi wajib membaca file JSON service account
yang hanya ada di Mac.

Production/Vercel:
- FIREBASE_ADMIN_PROJECT_ID
- FIREBASE_ADMIN_CLIENT_EMAIL
- FIREBASE_ADMIN_PRIVATE_KEY

Local:
- GOOGLE_APPLICATION_CREDENTIALS tetap didukung sebagai fallback.


INSTALL
=======
Dari root project:

unzip -o ~/Downloads/noir-firebase-admin-vercel-v1.zip -d .

npm run lint
npx tsc --noEmit
npm run build


CARA AMBIL NILAI FIREBASE ADMIN
===============================
Buka file service account JSON LOKAL yang sudah kamu punya.

Mapping:

JSON:
project_id
-> Vercel:
FIREBASE_ADMIN_PROJECT_ID

JSON:
client_email
-> Vercel:
FIREBASE_ADMIN_CLIENT_EMAIL

JSON:
private_key
-> Vercel:
FIREBASE_ADMIN_PRIVATE_KEY


PENTING
=======
JANGAN:
- upload file JSON service account ke GitHub
- upload file JSON ke public folder
- kirim private_key ke chat
- commit .env.local

File JSON lokal tetap harus masuk .gitignore.


PRIVATE KEY DI VERCEL
=====================
Cara paling aman:
copy VALUE private_key lengkap dari service account JSON,
termasuk:

-----BEGIN PRIVATE KEY-----
...
-----END PRIVATE KEY-----

Paste ke value FIREBASE_ADMIN_PRIVATE_KEY di Vercel.

Kode mendukung:
1. multiline asli
2. literal \n

karena backend menjalankan:
privateKeyRaw.replace(/\\n/g, "\n")


ENVIRONMENT VARIABLES VERCEL
============================
Minimal set production:

NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID

FIREBASE_ADMIN_PROJECT_ID
FIREBASE_ADMIN_CLIENT_EMAIL
FIREBASE_ADMIN_PRIVATE_KEY

TUYA_ACCESS_ID
TUYA_ACCESS_SECRET
TUYA_API_BASE_URL

CRON_SECRET


LOCAL DEVELOPMENT
=================
.env.local kamu boleh tetap:

GOOGLE_APPLICATION_CREDENTIALS=/Users/.../service-account.json

Tidak perlu langsung mengubah local setup.


PRIORITAS CREDENTIAL
====================
Backend menggunakan:

1. FIREBASE_ADMIN_* environment variables
2. jika tidak ada -> GOOGLE_APPLICATION_CREDENTIALS

Jadi Vercel tidak bergantung filesystem Mac.


CHECK SEBELUM COMMIT
====================
Pastikan:

git status

TIDAK menampilkan:
*.json service account
.env.local

Setelah itu:

git add .
git commit -m "make Firebase Admin Vercel compatible"
git push


CATATAN
=======
.env.vercel.example sengaja kosong dan aman dicommit.
Jangan pernah isi credential asli di file contoh tersebut.
