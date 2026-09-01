NOIR PLAYBOX PERFORMANCE OPTIMIZATION — LEVEL 5
================================================

FOKUS
=====
1. Dashboard utama memakai batch endpoint yang sudah ada:
   /api/realtime/overview

2. Usage Chart Firestore hanya listen 7 hari terakhir.

3. Admin session analytics tidak lagi membaca seluruh collection sessions
   untuk daily / 7-days / 30-days.

4. Analytics polling minimal 60 detik.

5. Daftar cafe pada Analytics tidak di-fetch ulang setiap kali filter berubah.


DASHBOARD UTAMA
===============
Sebelumnya dashboard utama melakukan request per unit:
- /api/tuya/device/PSxx
- /api/sessions/active?deviceId=PSxx

Sekarang dashboard utama reuse:
GET /api/realtime/overview

Jadi untuk 5, 10, atau lebih unit, browser hanya melakukan satu request
overview per polling cycle.


USAGE CHART
===========
Sebelumnya listener Firestore:
collection("sessions")
orderBy("startedAt", "desc")

Itu berarti seluruh session historis bisa ikut terbaca.

Sekarang:
where("startedAt", ">=", sevenDaysAgo)
orderBy("startedAt", "desc")

Chart tetap realtime, tetapi hanya untuk 7 hari yang memang dipakai chart.


ADMIN ANALYTICS
===============
Sebelumnya:
adminDb.collection("sessions").get()

lalu period difilter di memory.

Sekarang Firestore query langsung:
startedAt >= range.start
startedAt <= range.end

dan hanya field yang dibutuhkan yang diambil.

Catatan:
- period "history" memang tetap mencakup histori panjang sesuai fungsi halaman.
- daily / 7-days / 30-days mendapat penghematan terbesar.


INSTALL
=======
Dari root project noir-playbox:

unzip -o ~/Downloads/noir-playbox-performance-level5-v1.zip -d .

rm -rf .next

npm run lint
npx tsc --noEmit
npm run build


JIKA SEMUA HIJAU
================
git status --short

Kemudian:

git add app/page.tsx app/api/admin/session-analytics/route.ts components/admin/AdminAnalyticsPage.tsx

git commit -m "optimize dashboard and firestore reads"

git push origin main


VERIFIKASI SETELAH DEPLOY
=========================
1. Buka dashboard utama "/".
2. Vercel log target:
   GET /api/realtime/overview 200

3. Dashboard utama tidak lagi menghasilkan burst:
   /api/tuya/device/PS01 ... PS05
   /api/sessions/active per unit

4. Buka /analytics/daily atau /analytics/7-days.
5. Pastikan data grafik, revenue, session, dan cafe filter tetap normal.


TIDAK DIUBAH
============
- billing Firebase
- PREPARING lifecycle
- SHUTDOWN lifecycle
- watchdog
- Tuya/BARDI control
- package rental
- role admin / operational
- revenue calculation rules
