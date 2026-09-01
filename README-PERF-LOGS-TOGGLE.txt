NOIR PLAYBOX — PERFORMANCE LOGS TOGGLE V1
========================================

File production yang berubah:
- lib/perf-trace.ts

Perubahan:
- [NOIR_PERF] sekarang DEFAULT OFF.
- Log hanya aktif ketika environment variable:
    NOIR_PERF_LOGS=true
- Nilai selain literal "true" (termasuk undefined, false, 1, yes)
  membuat performance log tidak dicetak.
- Pengukuran internal tetap aman; hanya console output yang dimatikan.
- Tidak mengubah billing, Firebase runtime state, PREPARING, Tuya,
  watchdog, ADD TIME, STOP, atau SHUTDOWN.

INSTALL
=======
unzip -o ~/Downloads/noir-playbox-perf-logs-toggle-v1.zip -d .

rm -rf .next
npm run lint
npx tsc --noEmit
npm run build

STAGE
=====
git add lib/perf-trace.ts

git commit -m "gate performance logs behind env flag"
git push origin main

FINAL ADD TIME VALIDATION
=========================
Sebelum mematikan diagnostics secara permanen, validasi ADD TIME satu kali
pada deployment yang sekarang (logger lama masih aktif):

1. Hard refresh browser.
2. SIAPKAN RENTAL
3. Pilih paket
4. ADD TIME satu kali
5. Cari log:
   operation = api.sessions.addPackage

Target:
- tx.runtimeRead muncul
- fastPath:true

SETELAH VALIDASI
================
Deploy patch ini TANPA NOIR_PERF_LOGS:
- [NOIR_PERF] otomatis OFF.

Jika suatu hari perlu diagnostics lagi:
- Tambah environment variable di Vercel:
    NOIR_PERF_LOGS=true
- Redeploy.
- Setelah selesai debugging, hapus env tersebut atau set false dan redeploy.

SECURITY
========
Perf logger tetap tidak mencetak token, secret, private key, email,
UID, local_key, atau Tuya device ID.
