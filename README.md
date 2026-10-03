# Workshop Management System — Bengkel Mobil & Motor

Implementasi dari dokumen **BRD | ERD | URS | SRS v1.0 (02 Oktober 2026)**: sistem operasional bengkel end-to-end, dari booking/walk-in sampai serah terima kendaraan, service history, dan reminder. Mendukung multi-cabang, RBAC, dan audit trail.

```
Booking/Walk-in → Check-In → Inspeksi & Diagnosa → Estimate → Approval Customer → Work Order
→ Mekanik + Part → Quality Control → Invoice → Payment → Serah Terima → Service History & Reminder
```

## Isi aplikasi

15 modul fungsional sesuai SRS 4.5:

| Modul | Fitur utama |
|---|---|
| Dashboard | KPI operasional (kendaraan masuk/selesai, WO waiting/in progress/QC/rework, cycle time), sales (hari ini, MTD, rata-rata invoice), gross margin, efisiensi mekanik, customer, low stock |
| Customer | Master retail/corporate/fleet, pencarian nama/HP/WA/no. polisi, histori transaksi, soft delete |
| Kendaraan | Quick search no. polisi/rangka, service timeline (odometer, job, part, invoice), histori kepemilikan |
| Booking | Scheduled → Confirmed → Arrived / Cancelled / No Show, reschedule, konfirmasi via WhatsApp |
| Service Advisor | Check-in (odometer, fuel, kondisi, barang, keluhan, foto), inspeksi checklist mobil/motor (Good/Attention/Replace/Not Checked), estimate jasa + part + material + diskon + PPN, approval penuh/sebagian/reject dengan evidence |
| Work Order | Dibuat dari pekerjaan yang disetujui, prioritas, bay, supervisor, lifecycle status lengkap dengan histori, estimate tambahan |
| Mechanic Board | Tampilan mobile untuk mekanik: Start / Pause / Resume / Complete dengan timer, catatan job |
| Quality Control | Checklist + Pass / Fail / Rework; Fail/Rework mengembalikan job ke mekanik |
| Inventory / Parts | Stok per gudang, permintaan part dari WO, issue penuh/sebagian, retur, mutasi stok, receiving, stock opname, transfer antar gudang/cabang, low stock |
| Purchasing / Supplier | Purchase order (draft → ordered → received), saran reorder dari low stock, receiving dari PO |
| POS / Kasir | Invoice dari pekerjaan aktual, split payment (Tunai/QRIS/Debit/Kartu Kredit/Transfer/E-Wallet), kembalian, otorisasi piutang, refund & void, penjualan part langsung, closing kasir, cetak invoice/receipt |
| Service History | Timeline per kendaraan & histori per customer |
| CRM / Reminder | Reminder otomatis saat serah terima (berbasis tanggal & km per jenis jasa), follow-up status, link WhatsApp |
| Reports | 27 laporan (operasional, sales, inventory, customer, finance), filter tanggal/cabang/teks, export Excel (CSV) & PDF (cetak) |
| Settings | Perusahaan, pajak, penomoran, cabang & gudang, user, role & permission matrix, metode bayar, merk kendaraan, template inspeksi |

Fitur lintas modul: global search, notifikasi in-app (Waiting QC, Waiting Parts, approval tertunda, low stock, job baru), audit log, PWA (bisa di-install di HP/tablet), REST API.

## Business rule (BRD 1.8)

| ID | Implementasi |
|---|---|
| BR-001/002/003/004 | `work_orders.vehicle_id` wajib; 1 kendaraan → banyak WO; 1 WO → banyak job; mekanik ditugaskan per job |
| BR-005 | Stok hanya berubah lewat `stockIn/stockOut` (issue WO, penjualan, receiving, transfer, opname); setiap perubahan tercatat di `stock_movements` dengan referensi |
| BR-006 | WO hanya dari estimate yang disetujui; pekerjaan tambahan lewat *estimate tambahan*; part yang terpakai melebihi persetujuan **memblokir invoice** |
| BR-007 | Invoice dihitung dari job yang selesai + part yang benar-benar keluar (dikurangi retur) |
| BR-008 | Serah terima butuh QC Pass + lunas/otorisasi piutang; override hanya oleh role berwenang dengan alasan, tercatat di audit |
| BR-009 | Issue part dalam database transaction dengan row lock; constraint DB `quantity >= 0` |
| BR-010 | Estimate yang sudah diputuskan tidak bisa diubah; ubah harga job butuh permission `workorder.price_override` + alasan, tercatat di audit |
| BR-011 | Semua pembatalan (booking, check-in, estimate, WO, part request, PO, invoice, payment) wajib alasan dan user |
| BR-012/013 | Transaksi menyimpan `company_id` + `branch_id`; scope cabang ditegakkan di service layer (bukan hanya UI) |
| BR-014 | Penomoran atomik per company/cabang/tipe/hari, contoh `WO-JKT-261002-001` (prefix bisa diatur) |
| BR-015 | Odometer lebih kecil dari histori ditolak, kecuali permission `checkin.override_odometer` + alasan |
| BR-016 | Transaksi finansial/stok memakai cancel/void/soft delete, bukan hard delete |

Acceptance criteria AC-001 s/d AC-008 (SRS 4.13) diuji otomatis di `tests/`.

## Tech stack (SRS 4.1)

- **Next.js 16** (App Router, Server Components, Server Actions) + React 19 + TypeScript
- **PostgreSQL 16+** (lokal / Supabase / managed PostgreSQL) via **Drizzle ORM**, semua tabel di schema `wms`
- Tailwind CSS 4, lucide-react
- Auth: session cookie httpOnly + password hash scrypt, lockout 5x gagal (15 menit), reset password
- Vitest untuk integration test terhadap PostgreSQL asli

## Menjalankan secara lokal

Butuh Node.js 20+ dan PostgreSQL 16 (bisa via Docker).

```bash
# 1. Database
docker compose up -d            # atau gunakan PostgreSQL / Supabase sendiri

# 2. Konfigurasi
cp .env.example .env            # sesuaikan DATABASE_URL bila perlu

# 3. Install, migrasi, data demo
npm install
npm run db:setup                # migrasi + seed (perusahaan demo, 2 cabang, master data, transaksi contoh)

# 4. Jalankan
npm run dev                     # http://localhost:3000
```

Perintah lain:

| Perintah | Fungsi |
|---|---|
| `npm run build && npm start` | Build & jalankan mode produksi |
| `npm test` | Integration test (pakai `TEST_DATABASE_URL`, database di-reset setiap run) |
| `npm run typecheck` | Pemeriksaan TypeScript |
| `npm run db:reset` | Hapus semua data lalu migrasi + seed ulang (development saja) |
| `npm run db:seed -- --no-demo` | Seed master data tanpa transaksi contoh |
| `npm run db:generate` | Generate migrasi baru setelah mengubah `src/server/db/schema.ts` |

### Akun demo

Password semua akun: **`Password123`** (ganti sebelum dipakai sungguhan).

| Username | Role | Cabang |
|---|---|---|
| `superadmin` | Super Admin | Semua |
| `owner` | Owner / Management | Semua |
| `manager.jkt`, `manager.bdg` | Branch Manager | Jakarta / Bandung |
| `supervisor.jkt` | Workshop Supervisor | Jakarta |
| `sa.jkt`, `sa.bdg` | Service Advisor | Jakarta / Bandung |
| `mekanik1.jkt`, `mekanik2.jkt`, `mekanik.bdg` | Mechanic | Jakarta / Bandung |
| `qc.jkt` | QC | Jakarta |
| `parts.jkt` | Parts Staff | Jakarta |
| `purchasing` | Purchasing | Jakarta |
| `kasir.jkt`, `kasir.bdg` | Cashier | Jakarta / Bandung |
| `accounting` | Accounting | Semua |
| `cs.jkt` | Customer Service | Jakarta |

Coba alur lengkap: login `sa.jkt` → Booking hari ini → *Kendaraan datang → Check-in* → Inspeksi → Buat estimate → Tandai terkirim → Simpan keputusan customer → Buat Work Order; lalu `supervisor.jkt` menugaskan mekanik, `mekanik1.jkt` Start + minta part, `parts.jkt` mengeluarkan part, `mekanik1.jkt` Complete, `qc.jkt` PASS, dan `kasir.jkt` menerbitkan invoice, menerima pembayaran, dan menyerahkan kendaraan.

## Struktur kode

```
src/
  app/(auth)/            login, lupa & reset password
  app/(app)/             halaman modul (dashboard, customers, checkins, work-orders, ...)
  app/api/               REST API + endpoint lookup untuk form
  components/            komponen UI (server) & client/ (form interaktif)
  lib/                   permission catalog, format, status, nav, WhatsApp template
  server/db/schema.ts    skema database (ERD + kolom audit)
  server/services/       business logic per modul (dipakai UI, API, seed & test)
  server/actions/        server actions (UI → service)
  server/auth/           password, session, context & scope cabang
  server/seed/           data master & transaksi demo
drizzle/                 file migrasi SQL
supabase/                SQL khusus Supabase (hardening schema wms, bucket Storage)
tests/                   integration test alur & business rule
```

Semua aturan bisnis berada di `src/server/services/`, sehingga UI, REST API, dan test memakai logika yang sama.

## REST API (SRS 4.9)

Autentikasi: cookie session (web) atau `Authorization: Bearer <token>` dari `POST /api/auth/login` (`{ "identifier", "password" }`). Request berbasis cookie yang mengubah data wajib dari origin yang sama.

| Method | Endpoint | Fungsi |
|---|---|---|
| GET / POST | `/api/customers` | List/search, create customer |
| GET / POST | `/api/vehicles` | List/search, create kendaraan |
| GET / POST | `/api/checkins` | List, create check-in |
| GET / POST | `/api/estimates` | List, create estimate |
| GET / POST | `/api/work-orders` | List, create WO dari estimate |
| GET / PATCH | `/api/work-orders/:id` | Detail; `action`: `update`, `assign`, `job`, `waiting_parts`, `resume_parts`, `cancel` |
| GET / POST | `/api/part-requests` | List, create permintaan part |
| POST | `/api/quality-controls` | Submit QC |
| GET / POST | `/api/invoices` | List, create invoice WO / penjualan langsung |
| GET / POST | `/api/payments` | List, terima pembayaran (header `Idempotency-Key` didukung) |
| GET | `/api/reports/:key/export` | Export laporan CSV |

Respons sukses `{ "data": ... }`, error `{ "error": { "code", "message" } }` dengan status 401/403/404/422.

## Koneksi ke Supabase

Semua tabel aplikasi berada di schema PostgreSQL **`wms`** (bukan `public`), jadi bisa berbagi project Supabase dengan aplikasi lain tanpa bentrok. Schema `wms` tidak dibuka ke Data API: RLS aktif di semua tabel tanpa policy dan hak akses `anon` / `authenticated` dicabut (`supabase/hardening.sql`). Aplikasi terhubung langsung ke PostgreSQL sebagai role `postgres`, sehingga tidak terpengaruh.

Status saat ini: project Supabase **Konsolidasi-Grup** (region Singapore) sudah berisi schema `wms` (migrasi `0000_init` tercatat di `wms.__drizzle_migrations`), hardening, data demo yang sama dengan `npm run db:setup` (tanpa audit log & notifikasi), dan bucket Storage privat `wms-files` untuk foto/evidence. Akun demo di atas bisa langsung dipakai.

Menghubungkan aplikasi:

1. Supabase Dashboard → project → tombol **Connect** → salin connection string **Transaction pooler** (port `6543`). Direct connection (`db.<ref>.supabase.co`) hanya IPv6, jadi tidak bisa dari Vercel.
2. Isi di `.env` (lokal) atau Environment Variables Vercel:
   ```
   DATABASE_URL=postgresql://postgres.<project-ref>:<PASSWORD-DB>@<host-pooler>:6543/postgres?sslmode=require
   DB_PREPARE=false
   ```
   `DB_PREPARE` biarkan `false` untuk transaction pooler (tidak mendukung prepared statement); `true` hanya bila memakai session pooler / direct connection. Password database ada di Project Settings → Database (bisa di-reset di sana).
3. `npm run db:migrate` aman dijalankan: migrasi yang sudah tercatat dilewati. **Jangan** jalankan `npm run db:reset` / `npm test` ke database Supabase — keduanya menghapus schema `wms`.

Project Supabase baru: `npm run db:migrate` → `psql "$DATABASE_URL" -f supabase/hardening.sql` dan `-f supabase/storage.sql` (atau tempel di SQL Editor) → `npm run db:seed -- --no-demo` untuk master data saja, atau `npm run db:seed` untuk data demo. Jalankan ulang `supabase/hardening.sql` setiap ada migrasi yang menambah tabel.

## Deploy ke Vercel

Repo ini siap di-import langsung ke Vercel (framework Next.js terdeteksi otomatis; build/install command default). `vercel.json` menempatkan fungsi server di region **Singapore (`sin1`)**, dekat database Supabase.

1. Vercel → **Add New → Project** → import repo GitHub ini (branch `main`).
2. Sebelum klik Deploy, isi **Environment Variables**:

   | Variabel | Nilai | Wajib |
   |---|---|---|
   | `DATABASE_URL` | Connection string **Transaction pooler** Supabase (lihat bagian di atas) | Ya |
   | `DB_PREPARE` | `false` | Ya |
   | `SUPABASE_URL` | `https://<project-ref>.supabase.co` (Project Settings → API) | Ya, untuk upload foto |
   | `SUPABASE_SECRET_KEY` | Secret key `sb_secret_...` (Project Settings → API Keys). Key `service_role` lama juga bisa, dengan nama `SUPABASE_SERVICE_ROLE_KEY` | Ya, untuk upload foto |
   | `SUPABASE_STORAGE_BUCKET` | `wms-files` (default, boleh tidak diisi) | Tidak |
   | `APP_URL` | URL produksi, mis. `https://wms.domainanda.com` (default: domain produksi Vercel) | Tidak |

   Secret key hanya dipakai di server dan tidak pernah dikirim ke browser — jangan beri prefix `NEXT_PUBLIC_`.
3. Deploy, lalu login dengan akun demo. Setiap push ke `main` otomatis deploy ulang; branch lain mendapat preview deployment (memakai database yang sama bila env-nya juga diset untuk Preview).

Catatan:
- Foto check-in & evidence disimpan di bucket privat Supabase Storage dan hanya bisa dibuka lewat aplikasi (`/api/files/:id`, wajib login). Tanpa `SUPABASE_URL` + `SUPABASE_SECRET_KEY`, aplikasi menyimpan file di folder `STORAGE_DIR` — cocok untuk development, tidak untuk Vercel (filesystem read-only; upload akan ditolak dengan pesan jelas).
- Body request Vercel maksimal 4,5 MB. Foto otomatis dikecilkan di browser (maks 1600 px, JPEG) sebelum dikirim; total lampiran per simpan dibatasi 4 MB.
- Server Node biasa juga bisa: `npm run build && npm start` dengan env yang sama.
- Backup otomatis harian + PITR mengikuti fasilitas Supabase / database managed (SRS 4.12).

## Batasan saat ini & tahap berikutnya

- **Email reset password**: link reset ditampilkan di layar pada mode development dan dicatat di log server; pengiriman email (SMTP/provider) belum dihubungkan.
- **WhatsApp**: menggunakan link click-to-chat (`wa.me`) dengan template pesan; integrasi WhatsApp Business API termasuk Phase 3/5.
- **Row Level Security**: isolasi data per perusahaan/cabang ditegakkan di service layer. Di Supabase, RLS di schema `wms` dipakai untuk menutup akses Data API (deny-all); policy RLS per cabang/user belum dibuat karena aplikasi tidak memakai Supabase Auth.
- **Excel**: export berupa CSV (UTF-8 BOM, langsung terbuka di Excel). PDF lewat fitur cetak browser.
- Di luar scope MVP (BRD 1.10): payroll, general ledger penuh, payment gateway, integrasi accounting, telematics/OBD, aplikasi mobile native.
