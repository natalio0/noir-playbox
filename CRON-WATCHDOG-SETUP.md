# Kagoengan Studio Playbox - Preparing Watchdog

Endpoint:

`https://<domain>/api/system/preparing-watchdog`

## Vercel Cron

`vercel.json` sudah menjalankan endpoint setiap 5 menit. Set environment variable production:

`CRON_SECRET=<secret-random-yang-panjang>`

Vercel Cron akan mengirim `Authorization: Bearer <CRON_SECRET>` secara otomatis.

## External Cronjob

Jika memakai layanan cron eksternal, request tanpa secret akan mendapat HTTP 401 `Unauthorized`.
Tambahkan salah satu header berikut dengan nilai yang sama seperti environment variable `CRON_SECRET`:

- `Authorization: Bearer <CRON_SECRET>`
- `x-cron-secret: <CRON_SECRET>`

Method: `GET`
Schedule yang disarankan: setiap 5 menit.

Jangan menaruh secret di query string URL karena dapat tersimpan di log/history.
