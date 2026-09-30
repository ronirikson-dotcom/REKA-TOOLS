# OKABE CORE — Core Accounting Engine (Tahap 1)

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

## Peran

- **Admin**: semua akses, mengatur peran, membuka kembali periode.
- **Akuntan**: kelola akun, jurnal, posting, pembalik, tutup buku.
- **Viewer**: hanya melihat. Pengguna baru yang mendaftar otomatis menjadi Viewer (pengguna pertama menjadi Admin).

## Menjalankan

```bash
cp .env.example .env.local   # isi URL & publishable key Supabase
npm install
npm run dev
```

Database: jalankan `supabase/migrations/*.sql` berurutan, lalu `supabase/seed.sql` untuk CoA standar dan data demo.
