# QRIS dan payment_orders

Aplikasi operator saat ini menampilkan QRIS bank statis tanpa nominal pada layar Payment.

QRIS bank statis tidak dapat secara otomatis dihubungkan ke dokumen `payment_orders` hanya karena QR tersebut dipindai. Agar status pembayaran dapat masuk otomatis ke `payment_orders`, provider/acquirer QRIS harus menyediakan API/webhook transaksi yang memiliki reference/order ID.

Backend project ini sudah memiliki alur Midtrans QRIS dinamis di:

- `POST /api/payments/create`
- `POST /api/payments/webhook`
- `GET /api/payments/status/[orderId]`

Alur Midtrans membuat `payment_orders` lebih dulu dan webhook mengubah status menjadi `PAID`. QR dinamis juga membawa nominal transaksi walaupun nominal tidak harus ditampilkan sebagai teks di UI operator.

Jika tetap ingin memakai QRIS bank milik sendiri dan auto-reconcile, integrasikan API/webhook resmi dari bank/acquirer tersebut. Tanpa API/webhook bank, konfirmasi pembayaran harus manual.
