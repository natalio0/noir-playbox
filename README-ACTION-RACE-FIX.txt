NOIR PLAYBOX — TUYA ACTION RACE FIX V1
=====================================

Basis:
- Rental Flow V2 + fix1
- Tuya Refresh Dedupe V1
- Final Micro Optimization V1

Tujuan:
Menutup race terakhir ketika polling GET /api/tuya/device/PS01 sudah mulai
beberapa milidetik sebelum operator menekan STOP/ON/BILLING/SHUTDOWN.

Perubahan:
- action window dimulai sinkron sebelum request pertama
- polling dipause 4 detik
- verification timer lama dibatalkan
- GET status Tuya yang sudah in-flight di-abort saat action dimulai
- AbortError tidak ditampilkan sebagai error UI
- lifecycle/billing/PREPARING/shutdown tidak diubah

Install:
unzip -o ~/Downloads/noir-playbox-tuya-action-race-fix-v1.zip -d .
rm -rf .next
npm run lint
npx tsc --noEmit
npm run build

Jika hijau:
git add 'app/realtime/[deviceId]/page.tsx'
git commit -m "prevent Tuya polling during device actions"
git push origin main

Expected:
PATCH /api/sessions/.../complete
POST  /api/tuya/control
GET   /api/tuya/device/PS01  <- satu verification setelah command

Tidak diharapkan:
PATCH complete
GET Tuya
POST STOP
