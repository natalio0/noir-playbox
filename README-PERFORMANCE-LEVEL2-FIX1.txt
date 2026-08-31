NOIR PLAYBOX PERFORMANCE LEVEL 2 — FIX1

Memperbaiki TypeScript:
registered.tuyaDeviceId bertipe string | null.

Sekarang device tanpa tuyaDeviceId:
- tidak memanggil Tuya API
- dikembalikan sebagai OFFLINE
- memberi error 'Tuya device belum dikonfigurasi'

Install:

unzip -o ~/Downloads/noir-playbox-performance-level2-fix1.zip -d .
rm -rf .next
npm run lint
npx tsc --noEmit
npm run build
