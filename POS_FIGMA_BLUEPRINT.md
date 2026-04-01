# POS System Blueprint (Figma-First)

Dokumen ini menerjemahkan kebutuhan Anda menjadi blueprint implementasi yang siap dipakai di Figma (design), lalu diturunkan ke engineering.

## 1) Setup Figma (Wajib)

### File Structure
- `00-Cover`
- `01-Foundations`
- `02-Components`
- `03-POS`
- `04-Backoffice`
- `05-Prototype`

### Frame Size
- POS (touchscreen): **1440 x 900**
- Backoffice: **1440 x 1024**

### Grid System (konsisten di semua frame)
- **12 columns**
- Margin: **24 px**
- Gutter: **16 px**
- Column type: **Stretch**

### Typography (saran praktis)
- Font: Inter / SF Pro / Roboto (pilih 1)
- Scale:
  - H1: 32/40
  - H2: 24/32
  - H3: 20/28
  - Body L: 16/24
  - Body M: 14/20
  - Caption: 12/16

---

## 2) Component System (Mini Design System)

## Color Tokens
- `color.primary = #2F80ED`
- `color.success = #27AE60`
- `color.warning = #F2C94C`
- `color.danger = #EB5757`

### Entity Tag Colors (contoh)
- `entity.a = #56CCF2`
- `entity.b = #BB6BD9`
- `entity.c = #F2994A`
- `entity.d = #6FCF97`

## Spacing Tokens
- 4, 8, 12, 16, 20, 24, 32, 40

## Radius Tokens
- Small: 8
- Medium: 12
- Large: 16

## Required Reusable Components
Gunakan naming berikut:
- `[Component] Button/Primary`
- `[Component] Button/Secondary`
- `[Component] Button/Danger`
- `[Component] Input/Default`
- `[Component] Card/Panel`
- `[Component] Table/Row`
- `[Component] Badge/Entity`
- `[Component] PaymentMethod/Button`
- `[Component] QR/Container`
- `[Component] Card/Item`

### Variants yang disarankan
- **Button**: default / hover / pressed / disabled
- **Input**: default / focus / error / disabled
- **Payment button**: idle / selected / disabled
- **Badge entity**: entity-A / entity-B / entity-C / entity-D
- **QR container**: loading / generated / paid / expired

---

## 3) Frame 1 — POS Sales Screen

**Naming:** `[Frame] POS/Sales`

### Layout
- Top bar: Search bar full width
- Main body split 8:4 (left:right)
  - Left: Item list
  - Right: Summary panel
- Bottom action bar:
  - kiri: HOLD, VOID
  - kanan: CHECKOUT (primary)

### Item Card Content
- Item name
- Qty stepper (`- 1 +`)
- Price
- `🔥` entity badge

### Summary Panel Content
- Group subtotal per entity (collapsible)
- Discount
- Tax
- Point
- Grand total (highlight)

### Interaction
- Klik item → popup edit qty
- Klik entity group → expand/collapse detail

---

## 4) Frame 2 — Entity Breakdown (Modal)

**Naming:** `[Frame] POS/Entity-Breakdown-Modal`

### Struktur
- Section per entity:
  - Entity name
  - item list
  - subtotal
  - discount
  - tax
- Grand total (sticky bottom)
- Button: Close

### Catatan UX
- Modal width 720–840 px
- Background dim 40%

---

## 5) Frame 3 — Discount & Loyalty

**Naming:** `[Frame] POS/Discount-Loyalty`

### Sections
1. Apply Discount
   - toggle `%` dan `nominal`
2. Member
   - input member ID
3. Point Redeem
   - available point
   - input redeem amount
4. CTA: APPLY

### Validation
- Tidak boleh melebihi subtotal / point tersedia
- Tampilkan inline error di input

---

## 6) Frame 4 — Payment Screen (Critical)

**Naming:** `[Frame] POS/Payment`

### Header summary
- Total
- Remaining

### Payment methods
- Cash
- Card
- QRIS `🔥`

### Selected payment detail
- Dynamic panel tergantung metode

### QR Sub-frame
**State 1: Loading**
- Text: Generating QR...

**State 2: QR Generated**
- QR code
- Exp timer (01:30)
- Status: WAITING

**State 3: Paid**
- Status: PAID ✅
- Button: Complete Transaction

### Real-time behavior
- QR auto refresh via websocket/polling
- Payment status update tanpa reload

---

## 7) Frame 5 — Receipt Preview

**Naming:** `[Frame] POS/Receipt-Preview`

### Layout
- Store name/header
- Section per entity + item list
- Totals:
  - TOTAL
  - DISCOUNT
  - POINT
  - TAX
- Payment method
- Actions: PRINT, CLOSE

---

## 8) Frame 6 — Cashier Session

**Naming:** `[Frame] POS/Cashier-Session`

### Content
- Opening cash
- Sales today
- Breakdown payment (Cash / QR / Card)
- Expected vs Actual input
- Variance
- Button: Close Shift

### Rule
- Variance otomatis dihitung real-time

---

## 9) Frame 7 — Settlement Screen (Backoffice)

**Naming:** `[Frame] Backoffice/Settlement`

### Content
- Date filter
- Table:
  - TRX ID
  - METHOD
  - AMOUNT
  - STATUS
  - MATCH
- CTA: RECONCILE

### Visual status
- `PAID` hijau
- `PENDING` kuning
- `FAILED` merah

---

## 10) Frame 8 — Dashboard (Backoffice)

**Naming:** `[Frame] Backoffice/Dashboard`

### Widgets
- KPI cards: Sales today, Cash, QR, Card
- Sales by Entity (chart)
- Top items
- Outstanding vendor payable

---

## 11) User Flow untuk Prototype

### POS flow
- Sales Screen → Checkout → Payment → Receipt

### QR flow
- Payment → QR Loading → Waiting → Paid → Complete

### Prototype wiring (Figma)
- On click item card → Open overlay (edit qty)
- On click checkout → Navigate to payment
- On QR paid state → Navigate to receipt
- On close receipt → Navigate to Sales

---

## 12) Interaction Rules (Important)

- Qty edit via popup, bukan inline bebas
- Entity detail pakai accordion
- Countdown QR berjalan real-time
- Status payment di-update live tanpa reload

---

## 13) Layer Naming Best Practice

Gunakan penamaan konsisten:
- `[Frame] POS/Sales`
- `[Component] Button/Primary`
- `[Component] Card/Item`
- `[Component] Badge/Entity`

Saran tambahan:
- Prefix section: `Sec/`, group: `Grp/`, text: `Txt/`, icon: `Icn/`
- Contoh: `Sec/Summary`, `Grp/Entity-A`, `Txt/Grand-Total`

---

## Handoff ke Engineering (Opsional tapi direkomendasikan)

### Data model minimal
- `CartItem`: id, name, entity, qty, price
- `EntitySummary`: entity, subtotal, discount, tax
- `Payment`: method, amount, status, reference
- `Session`: openingCash, closingCash, variance

### API minimal
- `POST /cart/items`
- `PATCH /cart/items/:id`
- `POST /checkout`
- `POST /payments`
- `GET /payments/:id/status`
- `GET /settlement?date=`

### Event real-time
- `payment.qr.generated`
- `payment.updated`
- `payment.paid`
- `session.closed`
