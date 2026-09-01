NOIR PLAYBOX — PERFORMANCE TIMING DIAGNOSTICS V1
================================================

TUJUAN
======
Menemukan sumber latency nyata tanpa menebak: Firebase Auth, Firestore,
device registry, Tuya token, atau Tuya Cloud network.

AMAN
====
Log hanya berisi:
- operation
- status
- totalMs
- nama stage + ms
- action Tuya (ON/STOP/TIMER/ADD_TIME)

Tidak log token, secret, private key, email, UID, payload command, local_key,
atau Tuya device ID.

FORMAT LOG
==========
[NOIR_PERF] {"operation":"api.tuya.control","status":"ok","totalMs":...,"stages":[...],"action":"STOP"}

Contoh Tuya:
[NOIR_PERF] {"operation":"tuya.request","totalMs":950,"stages":[{"name":"accessToken","ms":0.1},{"name":"network","ms":930}],"method":"POST","kind":"commands"}

Contoh Firebase:
[NOIR_PERF] {"operation":"api.sessions.create","totalMs":1400,"stages":[{"name":"auth","ms":250},{"name":"firestoreTransaction","ms":1100}]}

INSTALL
=======
unzip -o ~/Downloads/noir-playbox-performance-timing-diagnostics-v1.zip -d .
rm -rf .next
npm run lint
npx tsc --noEmit
npm run build

Jika hijau:
git add app/api lib/perf-trace.ts lib/tuya-cloud-dynamic.ts
git commit -m "add performance timing diagnostics"
git push origin main

TEST
====
Setelah Vercel Ready lakukan sekali:
SIAPKAN RENTAL -> pilih billing -> ADD TIME -> STOP -> SHUTDOWN MODE -> SELESAI SHUTDOWN

Lalu di Vercel Logs search:
[NOIR_PERF]

Kirim hanya baris [NOIR_PERF]. Tidak perlu kirim token/env/secrets.

MATIKAN DIAGNOSTIC
==================
Setelah diagnosis selesai, set environment variable:
NOIR_PERF_DIAGNOSTICS=false
atau hapus patch diagnostics pada commit berikutnya.
