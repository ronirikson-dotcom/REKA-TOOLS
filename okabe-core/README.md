# OKABE CORE — Core Accounting Engine & Smart POS

Implementasi tahap pertama BRD OKABE CORE: mesin akuntansi inti yang nantinya menerima jurnal otomatis dari modul
Purchase, Sales, Smart POS, Inventory, dan Asset.

**Stack:** Next.js 16 (App Router) · Supabase (PostgreSQL, Auth/JWT, RLS) · Tailwind CSS · Vercel

## Cakupan BRD

| Kode | Kebutuhan | Implementasi |
| --- | --- | --- |
| ACC-01 | CoA hierarkis | Tabel `accounts` parent–child (header vs akun transaksi), validasi tipe sama dengan induk, anti-siklus |
| ACC-02 | Tutup buku bulanan | `fiscal_periods` + `close_period()` berurutan, ditolak jika masih ada draft; `reopen_period()` khusus admin dengan alasan |
| ACC-03 | Laporan real-time | Neraca Saldo, Laba/Rugi, Neraca, Arus Kas (metode langsung), Buku Besar, dengan drill-down ke jurnal dan dokumen sumber |
| Aturan | Zero-sum | Trigger menolak posting jika Debit ≠ Kredit, kurang dari 2 baris, atau total nol |
| Aturan | Immutability | Jurnal Posted tidak dapat diubah/dihapus; koreksi hanya lewat `reverse_journal()` |
| Aturan | Period lock | Insert/update/delete jurnal pada periode Closed ditolak di level database |
| NFR-02 | Keamanan API | Supabase Auth (JWT) + Row Level Security; penulisan jurnal hanya via fungsi RPC |
| NFR-04 | Audit trail | `audit_log` permanen (tidak bisa diubah/dihapus): pengguna, waktu, IP, data lama/baru |

Titik integrasi untuk modul berikutnya: `create_auto_journal(source_type, source_ref, date, description, lines)`,
yang membentuk dan memposting jurnal berdasarkan kode akun.

## Tahap 2 — Smart POS

| Kode | Kebutuhan | Implementasi |
| --- | --- | --- |
| POS-01 | Offline-sync | Katalog & promo disimpan di IndexedDB, service worker menyimpan halaman kasir; transaksi masuk antrean lokal dan disinkronkan berurutan. `pos_submit_sale` idempoten per `client_uuid` |
| POS-02 | Otorisasi OTP | Void, retur, dan diskon manual wajib OTP manajer. Kode di-hash di skema privat (tidak bisa dibaca kasir), dikirim via WhatsApp (Fonnte) / Email (Resend) memakai pg_net, atau ke menu **OTP Manajer** bila provider belum diatur |
| POS-03 | Checker display | `/pos/checker`: Disiapkan → Siap → Selesai, diperbarui tiap 5 detik |
| POS-04 | Integrasi CRM | Cari pelanggan dari nomor HP: profil, histori, poin, favorit, rekomendasi upselling (dibeli bersama & favorit) |
| POS-05 | Promo engine | Aturan JSON: Buy X Get Y, bundling, happy hour, diskon volume bertingkat. Mesin promo ada di database (`pos_price_cart`) dan dicerminkan di `src/lib/pos/pricing.ts` untuk offline; `scripts/pricing-parity.mts` menguji keduanya identik |

Jurnal otomatis per transaksi: Kas/Bank (D), Diskon (D), HPP (D) / Penjualan (K), Persediaan (K). Void membuat jurnal
pembalik; retur, penerimaan stok, dan selisih kas tutup shift juga dijurnal otomatis. Stok memakai HPP rata-rata tertimbang
dan selalu sama dengan saldo akun Persediaan.

## Peran

- **Admin**: semua akses, mengatur peran, pengaturan POS, membuka kembali periode.
- **Manajer**: menyetujui OTP, kelola produk & promo, bisa berjualan.
- **Akuntan**: kelola akun, jurnal, posting, pembalik, tutup buku.
- **Kasir**: layar kasir, pelanggan, checker display.
- **Viewer**: hanya melihat. Pengguna baru yang mendaftar otomatis menjadi Viewer (pengguna pertama menjadi Admin).

## Menjalankan

```bash
cp .env.example .env.local   # isi URL & publishable key Supabase
npm install
npm run dev
```

Database: jalankan `supabase/migrations/*.sql` berurutan, lalu `supabase/seed.sql` untuk CoA standar dan data demo.
