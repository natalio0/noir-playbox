NOIR PLAYBOX — BACKEND PERFORMANCE V2
=====================================

TUJUAN
======
Mengurangi latency operasi rental yang sebelumnya banyak melakukan query
Firestore serial sekitar 250ms per query.

BASIS PATCH
===========
Patch ini dibuat di atas kondisi terbaru:
- Rental Flow V2 + fix1
- Realtime/Tuya dedupe + action race fix
- Performance Timing Diagnostics V1

PERUBAHAN UTAMA
===============
1. device_runtime/{deviceId}
   Menyimpan pointer state operasional per PlayBox:
   - preparingId
   - activeSessionId
   - session total/current billing
   - shutdownId + shutdownStatus
   - last completed session metadata

   Collection lama TIDAK dihapus:
   - sessions
   - preparing_sessions
   - shutdown_sessions
   - audit_logs

   Collection lama tetap menjadi history/audit permanen.
   device_runtime hanya mempercepat lookup + menjadi concurrency lock.

2. Session CREATE fast path
   Sebelumnya perlu query:
   device -> active session -> active shutdown -> pending shutdown -> preparing.

   Setelah runtime tersedia:
   hanya read device_runtime/PSxx di dalam transaction.

3. ADD TIME fast path
   Client mengirim deviceId.
   Transaction membaca runtime saja, lalu atomically update:
   - package
   - session totals
   - runtime totals

   ADD TIME vs STOP tetap race-safe karena keduanya lock runtime yang sama.

4. COMPLETE rental fast path
   Client mengirim deviceId.
   Tidak perlu read session + shutdown pada jalur normal.
   Runtime menyediakan:
   - cafe access
   - active session id
   - startedAt
   - totalMinutes
   - totalPrice

   Transaction atomically:
   - session => COMPLETED
   - shutdown => SHUTDOWN_PENDING
   - runtime => clear active session + pending shutdown

5. PREPARING fast path
   PREPARING start membaca runtime satu kali dan menulis preparing + runtime
   dalam transaction yang sama.

6. SHUTDOWN start fast path
   SHUTDOWN_PENDING -> SHUTDOWN_ACTIVE menggunakan runtime read + satu
   transaction commit. Audit log ikut transaction yang sama.

7. Fast restore GET
   /api/sessions/active
   /api/preparing/active
   /api/shutdown/active
   menggunakan runtime bila tersedia dan fallback ke query lama bila belum.

8. Auth cache 30 detik
   Token yang SUDAH berhasil diverifikasi disimpan sebagai SHA-256 key,
   bukan raw token. Cache maksimal 30 detik dan tidak melewati expiry token.
   Tujuannya mengurangi verify + users/{uid} read berulang pada warm function.

9. Device registry cache 30 detik
   resolveRegisteredDevice sekarang punya single-device cache juga.
   invalidateRegisteredDeviceCache membersihkan list + single cache.

10. Backward compatible
    Bila runtime belum ada, write route penting tetap bisa membaca state lama.
    Setelah operasi sukses runtime otomatis terisi.

MIGRASI OPSIONAL TAPI DIREKOMENDASIKAN
======================================
Supaya operasi PERTAMA setelah deploy juga cepat, pre-create runtime untuk
semua device saat tidak ada operator yang sedang menekan tombol rental:

npx tsx scripts/migrate-device-runtime.ts

Expected contoh:
PS01: runtime dibuat
PS02: runtime dibuat
...
Selesai. created=5, skipped=0

Script TIDAK menimpa runtime yang sudah ada.
Jika script gagal karena local Firebase Admin credential tidak tersedia,
boleh skip. API akan self-heal otomatis pada penggunaan pertama.

CEK LOKASI FIRESTORE
====================
Jalankan:

npx tsx scripts/firestore-location.ts

Kirim hanya output seperti:
Firestore location: asia-southeast1

JANGAN kirim .env, private key, token, atau credential.
Setelah lokasi diketahui, region Vercel baru dipilih secara tepat.

INSTALL
=======
Dari root project:

unzip -o ~/Downloads/noir-playbox-backend-performance-v2.zip -d .

rm -rf .next
npm run lint
npx tsc --noEmit
npm run build

JIKA SEMUA HIJAU
================
git status --short

Stage production files + helper/scripts saja (README opsional):

git add \
  'app/api/admin/cafes/[cafeId]/devices/route.ts' \
  'app/api/preparing/[preparingId]/activate/route.ts' \
  'app/api/preparing/[preparingId]/end/route.ts' \
  app/api/preparing/active/route.ts \
  app/api/preparing/start/route.ts \
  'app/api/sessions/[sessionId]/complete/route.ts' \
  'app/api/sessions/[sessionId]/packages/route.ts' \
  app/api/sessions/active/route.ts \
  app/api/sessions/route.ts \
  'app/api/shutdown/[shutdownId]/complete/route.ts' \
  app/api/shutdown/active/route.ts \
  app/api/shutdown/start/route.ts \
  'app/realtime/[deviceId]/page.tsx' \
  lib/device-registry.ts \
  lib/device-runtime.ts \
  lib/preparing-watchdog.ts \
  lib/require-dashboard-user.ts \
  scripts/migrate-device-runtime.ts \
  scripts/firestore-location.ts

git commit -m "optimize rental backend runtime state"
git push origin main

SMOKE TEST SETELAH VERCEL READY
===============================
1. buka PS01
2. SIAPKAN RENTAL
3. pilih billing
4. ADD TIME sekali
5. STOP
6. refresh sebelum shutdown -> pending harus tetap ada
7. SHUTDOWN MODE
8. SELESAI SHUTDOWN

EXPECTED PERF LOG SETELAH RUNTIME SUDAH ADA
===========================================
api.sessions.create:
- tx.runtimeRead
- TIDAK ada tx.legacyActiveSession / legacyShutdown / legacyPreparing
- runtimeHydrated:false

api.sessions.addPackage:
- tx.runtimeRead
- fastPath:true
- TIDAK ada tx.legacySessionRead

api.sessions.complete:
- tx.runtimeRead
- fastPath:true
- TIDAK ada tx.legacySessionRead / tx.legacyShutdownRead

api.shutdown.start:
- tx.runtimeRead
- runtimeHydrated:false
- TIDAK ada tx.legacy* pada operasi normal

CATATAN
=======
- Billing authority tetap Firebase sessions.
- device_runtime bukan pengganti history.
- PREPARING anti-fraud tetap aktif.
- Shutdown persistence tetap aktif.
- Tuya/BARDI control flow tidak diubah oleh patch backend ini.
- Tidak ada secret yang dicetak oleh script/diagnostics.
