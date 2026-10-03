import type { Permission } from "./permissions";

export type NavItem = { href: string; label: string; icon: string; any: Permission[] };
export type NavGroup = { label: string; items: NavItem[] };

/** Menu mengikuti permission user (URS-GEN-003) — 15 modul fungsional SRS 4.5 */
export const NAV: NavGroup[] = [
  {
    label: "Utama",
    items: [{ href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", any: ["dashboard.view"] }],
  },
  {
    label: "Front Office",
    items: [
      { href: "/bookings", label: "Booking", icon: "CalendarClock", any: ["booking.view"] },
      { href: "/checkins", label: "Check-In", icon: "ClipboardCheck", any: ["checkin.view"] },
      { href: "/estimates", label: "Estimate", icon: "FileText", any: ["estimate.view"] },
      { href: "/customers", label: "Customer", icon: "Users", any: ["customer.view"] },
      { href: "/vehicles", label: "Kendaraan", icon: "Car", any: ["vehicle.view"] },
    ],
  },
  {
    label: "Workshop",
    items: [
      { href: "/work-orders", label: "Work Order", icon: "Wrench", any: ["workorder.view"] },
      { href: "/workshop-board", label: "Workshop Board", icon: "KanbanSquare", any: ["workorder.view"] },
      { href: "/mechanic", label: "Pekerjaan Saya", icon: "HardHat", any: ["job.execute"] },
      { href: "/qc", label: "Quality Control", icon: "ShieldCheck", any: ["qc.view"] },
      { href: "/part-requests", label: "Permintaan Part", icon: "PackageSearch", any: ["partrequest.view", "inventory.issue"] },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/inventory", label: "Stok Part", icon: "Boxes", any: ["inventory.view"] },
      { href: "/inventory/movements", label: "Mutasi Stok", icon: "ArrowLeftRight", any: ["inventory.view"] },
      { href: "/inventory/receiving", label: "Penerimaan Barang", icon: "PackagePlus", any: ["inventory.receive"] },
      { href: "/inventory/adjustments", label: "Stock Opname", icon: "ClipboardList", any: ["inventory.adjust"] },
      { href: "/inventory/transfers", label: "Transfer Stok", icon: "Truck", any: ["inventory.transfer"] },
      { href: "/purchasing", label: "Purchase Order", icon: "ShoppingCart", any: ["purchase.view"] },
      { href: "/master/parts", label: "Master Part", icon: "Cog", any: ["part.manage", "inventory.view"] },
      { href: "/master/suppliers", label: "Supplier", icon: "Building2", any: ["supplier.manage"] },
    ],
  },
  {
    label: "Kasir",
    items: [
      { href: "/cashier", label: "Kasir", icon: "Wallet", any: ["invoice.create", "payment.receive"] },
      { href: "/cashier/counter-sale", label: "Penjualan Part", icon: "ScanBarcode", any: ["invoice.create"] },
      { href: "/invoices", label: "Invoice", icon: "Receipt", any: ["invoice.view"] },
      { href: "/payments", label: "Pembayaran", icon: "Banknote", any: ["payment.view"] },
    ],
  },
  {
    label: "CRM",
    items: [{ href: "/reminders", label: "Service Reminder", icon: "BellRing", any: ["reminder.view"] }],
  },
  {
    label: "Manajemen",
    items: [
      { href: "/reports", label: "Laporan", icon: "BarChart3", any: ["report.operational.view", "report.sales.view", "report.inventory.view", "report.customer.view", "report.finance.view"] },
      { href: "/audit-logs", label: "Audit Log", icon: "History", any: ["audit.view"] },
    ],
  },
  {
    label: "Settings",
    items: [
      { href: "/settings", label: "Perusahaan", icon: "Settings", any: ["settings.company"] },
      { href: "/settings/branches", label: "Cabang & Gudang", icon: "Store", any: ["settings.branch"] },
      { href: "/settings/users", label: "User", icon: "UserCog", any: ["settings.user"] },
      { href: "/settings/roles", label: "Role & Permission", icon: "KeyRound", any: ["settings.role"] },
      { href: "/master/services", label: "Master Jasa", icon: "Hammer", any: ["service.manage"] },
      { href: "/settings/payment-methods", label: "Metode Bayar", icon: "CreditCard", any: ["settings.master"] },
      { href: "/settings/vehicle-brands", label: "Merk Kendaraan", icon: "Tags", any: ["settings.master"] },
      { href: "/settings/inspection-templates", label: "Template Inspeksi", icon: "ListChecks", any: ["settings.master"] },
    ],
  },
];

export function navFor(permissions: Set<string>) {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => i.any.some((p) => permissions.has(p))) })).filter((g) => g.items.length);
}
