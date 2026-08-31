NOIR PLAYBOX PERFORMANCE OPTIMIZATION V1 — FIX1
================================================

PENTING
=======
ZIP v1 sebelumnya salah packaging dan membuat folder:
noir-playbox-performance-optimization-v1/

di dalam root project. Folder itu harus dihapus karena ikut terbaca TypeScript.

INSTALL FIX1
============
Jalankan dari root project noir-playbox:

rm -rf noir-playbox-performance-optimization-v1
rm -rf .next

unzip -o ~/Downloads/noir-playbox-performance-optimization-v1-fix1.zip -d .

npm run lint
npx tsc --noEmit
npm run build

ZIP FIX1 ini langsung berisi:
app/
components/
hooks/

Jadi file akan menimpa lokasi project yang benar.

FIX TAMBAHAN
============
useSmartPolling.ts sudah diperbaiki agar tidak menulis ref.current saat render,
sehingga kompatibel dengan rule react-hooks/refs pada React 19.

JIKA SEMUA HIJAU
================
git status --short

Pastikan file sensitif seperti env atau service account JSON tidak ikut.

Kemudian:
git add app components hooks
git commit -m "optimize Noir Playbox dashboard performance"
git push origin main
