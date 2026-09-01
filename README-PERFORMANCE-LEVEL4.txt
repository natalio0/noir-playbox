NOIR PLAYBOX PERFORMANCE OPTIMIZATION — LEVEL 4
================================================

FOKUS
=====
1. Dedupe /api/auth/profile
2. Cache profile singkat di client
3. Admin alerts polling minimal 30 detik
4. Bersihkan log UID production

AUTH PROFILE
============
Sebelumnya setelah login:
- LoginPage fetch /api/auth/profile
- AuthProvider onAuthStateChanged juga fetch /api/auth/profile

Keduanya bisa terjadi hampir bersamaan.

Sekarang keduanya memakai:
lib/auth-profile-client.ts

Fitur:
- satu in-flight request per UID
- cache profile 60 detik
- cache dibersihkan saat logout
- API response tetap no-store di HTTP layer

ADMIN ALERTS
============
Admin alerts tidak perlu polling sangat agresif karena:
- WARNING baru pada 45 menit
- SUSPICIOUS baru pada 60 menit
- watchdog berjalan lewat endpoint terpisah

Interval admin alerts sekarang minimal 30 detik.

INSTALL
=======
Dari root project:

unzip -o ~/Downloads/noir-playbox-performance-level4-v1.zip -d .
rm -rf .next

npm run lint
npx tsc --noEmit
npm run build

Jika semua hijau:

git status --short

git add app/login/page.tsx app/admin/page.tsx app/api/auth/profile/route.ts components/providers/AuthProvider.tsx lib/auth-profile-client.ts
git commit -m "optimize profile auth and admin polling"
git push origin main

VERIFIKASI
==========
Setelah deployment Ready:

1. Logout lalu login ulang.
2. Pastikan login redirect normal.
3. Lihat Vercel logs.

Target:
- /api/auth/profile hanya satu request pada login normal
- tidak ada lagi "VERIFIED UID" pada log
- /api/admin/alerts sekitar setiap 30 detik saat halaman Admin terbuka
- /api/realtime/overview tetap mengikuti polling realtime yang sudah dioptimalkan

TIDAK DIUBAH
============
- billing
- PREPARING
- SHUTDOWN
- watchdog
- Tuya/BARDI control
- role admin / operational
