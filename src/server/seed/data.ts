/** Data master awal untuk bengkel mobil & motor */

export const BRANDS: { name: string; type: "car" | "motorcycle"; models: string[] }[] = [
  { name: "Toyota", type: "car", models: ["Avanza", "Innova", "Rush", "Calya", "Fortuner", "Yaris"] },
  { name: "Daihatsu", type: "car", models: ["Xenia", "Ayla", "Sigra", "Terios", "Gran Max"] },
  { name: "Honda", type: "car", models: ["Brio", "Jazz", "HR-V", "CR-V", "Mobilio"] },
  { name: "Mitsubishi", type: "car", models: ["Xpander", "Pajero Sport", "L300"] },
  { name: "Suzuki", type: "car", models: ["Ertiga", "Carry", "XL7"] },
  { name: "Honda", type: "motorcycle", models: ["Beat", "Vario 125", "Vario 160", "PCX 160", "Scoopy", "Supra X"] },
  { name: "Yamaha", type: "motorcycle", models: ["NMAX", "Aerox", "Mio M3", "Fazzio", "R15"] },
  { name: "Suzuki", type: "motorcycle", models: ["Satria F150", "Nex II"] },
  { name: "Kawasaki", type: "motorcycle", models: ["Ninja 250", "KLX 150"] },
];

export const SERVICES: {
  code: string;
  name: string;
  category: string;
  vehicleType: "car" | "motorcycle" | "all";
  hours: number;
  price: number;
  reminderDays?: number;
  reminderKm?: number;
}[] = [
  { code: "JS-C001", name: "Servis Berkala 10.000 km", category: "Servis Berkala", vehicleType: "car", hours: 1.5, price: 350000, reminderDays: 180, reminderKm: 10000 },
  { code: "JS-C002", name: "Ganti Oli Mesin Mobil", category: "Servis Ringan", vehicleType: "car", hours: 0.5, price: 50000, reminderDays: 120, reminderKm: 5000 },
  { code: "JS-C003", name: "Tune Up Mesin Mobil", category: "Mesin", vehicleType: "car", hours: 2, price: 450000 },
  { code: "JS-C004", name: "Ganti Kampas Rem Depan", category: "Rem", vehicleType: "car", hours: 1, price: 150000 },
  { code: "JS-C005", name: "Spooring & Balancing", category: "Kaki-kaki", vehicleType: "car", hours: 1, price: 250000, reminderDays: 180, reminderKm: 10000 },
  { code: "JS-C006", name: "Servis AC (Cleaning Evaporator)", category: "AC", vehicleType: "car", hours: 2, price: 500000, reminderDays: 365 },
  { code: "JS-C007", name: "Ganti Aki Mobil", category: "Kelistrikan", vehicleType: "car", hours: 0.3, price: 25000 },
  { code: "JS-C008", name: "Flushing Radiator", category: "Pendingin", vehicleType: "car", hours: 1, price: 200000 },
  { code: "JS-M001", name: "Servis Rutin Motor", category: "Servis Berkala", vehicleType: "motorcycle", hours: 1, price: 75000, reminderDays: 60, reminderKm: 2000 },
  { code: "JS-M002", name: "Ganti Oli Motor", category: "Servis Ringan", vehicleType: "motorcycle", hours: 0.25, price: 15000, reminderDays: 60, reminderKm: 2000 },
  { code: "JS-M003", name: "Servis CVT", category: "Transmisi", vehicleType: "motorcycle", hours: 1, price: 60000, reminderDays: 120, reminderKm: 8000 },
  { code: "JS-M004", name: "Ganti Kampas Rem Motor", category: "Rem", vehicleType: "motorcycle", hours: 0.5, price: 30000 },
  { code: "JS-M005", name: "Bongkar Injeksi / Karburator", category: "Mesin", vehicleType: "motorcycle", hours: 1, price: 80000 },
  { code: "JS-A001", name: "Pemeriksaan Umum / Diagnosa", category: "Diagnosa", vehicleType: "all", hours: 0.5, price: 50000 },
];

export const PART_CATEGORIES = ["Oli & Pelumas", "Filter", "Rem", "Kelistrikan", "Pengapian", "Ban", "Transmisi", "Material"];

export const PARTS: {
  sku: string;
  barcode: string;
  name: string;
  category: string;
  type: "part" | "material";
  unit: string;
  brand: string;
  buy: number;
  sell: number;
  min: number;
  openingJkt: number;
  openingBdg: number;
}[] = [
  { sku: "OLI-SHL-HX7-4L", barcode: "8991001000011", name: "Oli Shell Helix HX7 10W-40 4L", category: "Oli & Pelumas", type: "part", unit: "gln", brand: "Shell", buy: 290000, sell: 365000, min: 5, openingJkt: 20, openingBdg: 10 },
  { sku: "OLI-TMO-1L", barcode: "8991001000028", name: "Oli Toyota Motor Oil SN 1L", category: "Oli & Pelumas", type: "part", unit: "ltr", brand: "Toyota", buy: 75000, sell: 95000, min: 10, openingJkt: 40, openingBdg: 20 },
  { sku: "OLI-AHM-MPX2", barcode: "8991001000035", name: "Oli AHM MPX2 0.8L", category: "Oli & Pelumas", type: "part", unit: "btl", brand: "AHM", buy: 42000, sell: 55000, min: 10, openingJkt: 50, openingBdg: 30 },
  { sku: "OLI-YML-GEAR", barcode: "8991001000042", name: "Oli Gardan Yamalube 150ml", category: "Oli & Pelumas", type: "part", unit: "btl", brand: "Yamalube", buy: 15000, sell: 22000, min: 10, openingJkt: 30, openingBdg: 15 },
  { sku: "FLT-OLI-AVZ", barcode: "8991001000059", name: "Filter Oli Avanza/Xenia", category: "Filter", type: "part", unit: "pcs", brand: "Toyota", buy: 38000, sell: 55000, min: 5, openingJkt: 15, openingBdg: 8 },
  { sku: "FLT-UDR-AVZ", barcode: "8991001000066", name: "Filter Udara Avanza/Xenia", category: "Filter", type: "part", unit: "pcs", brand: "Toyota", buy: 65000, sell: 95000, min: 3, openingJkt: 8, openingBdg: 4 },
  { sku: "FLT-UDR-BEAT", barcode: "8991001000073", name: "Filter Udara Honda Beat", category: "Filter", type: "part", unit: "pcs", brand: "AHM", buy: 38000, sell: 55000, min: 5, openingJkt: 12, openingBdg: 6 },
  { sku: "REM-KMP-AVZ-D", barcode: "8991001000080", name: "Kampas Rem Depan Avanza", category: "Rem", type: "part", unit: "set", brand: "Aisin", buy: 210000, sell: 285000, min: 2, openingJkt: 6, openingBdg: 3 },
  { sku: "REM-KMP-BEAT", barcode: "8991001000097", name: "Kampas Rem Depan Beat/Vario", category: "Rem", type: "part", unit: "set", brand: "AHM", buy: 38000, sell: 52000, min: 5, openingJkt: 15, openingBdg: 8 },
  { sku: "REM-MNY-DOT3", barcode: "8991001000103", name: "Minyak Rem DOT 3 300ml", category: "Rem", type: "material", unit: "btl", brand: "Prestone", buy: 25000, sell: 38000, min: 5, openingJkt: 12, openingBdg: 6 },
  { sku: "ELK-AKI-NS40", barcode: "8991001000110", name: "Aki GS Astra NS40ZL", category: "Kelistrikan", type: "part", unit: "pcs", brand: "GS Astra", buy: 680000, sell: 850000, min: 2, openingJkt: 4, openingBdg: 2 },
  { sku: "PGP-BUSI-K16", barcode: "8991001000127", name: "Busi Denso K16R-U", category: "Pengapian", type: "part", unit: "pcs", brand: "Denso", buy: 22000, sell: 32000, min: 8, openingJkt: 32, openingBdg: 16 },
  { sku: "PGP-BUSI-CPR", barcode: "8991001000134", name: "Busi NGK CPR9EA-9 (Motor)", category: "Pengapian", type: "part", unit: "pcs", brand: "NGK", buy: 18000, sell: 27000, min: 10, openingJkt: 25, openingBdg: 12 },
  { sku: "TRS-VBELT-BEAT", barcode: "8991001000141", name: "V-Belt Honda Beat", category: "Transmisi", type: "part", unit: "pcs", brand: "AHM", buy: 95000, sell: 125000, min: 3, openingJkt: 6, openingBdg: 3 },
  { sku: "TRS-ROLLER-BEAT", barcode: "8991001000158", name: "Roller Set Honda Beat", category: "Transmisi", type: "part", unit: "set", brand: "AHM", buy: 45000, sell: 65000, min: 3, openingJkt: 2, openingBdg: 2 },
  { sku: "MAT-CARB-CLN", barcode: "8991001000165", name: "Carburetor/Throttle Cleaner 500ml", category: "Material", type: "material", unit: "klg", brand: "Wurth", buy: 35000, sell: 50000, min: 5, openingJkt: 10, openingBdg: 5 },
  { sku: "MAT-COOLANT-1L", barcode: "8991001000172", name: "Radiator Coolant 1L", category: "Material", type: "material", unit: "btl", brand: "Prestone", buy: 30000, sell: 45000, min: 6, openingJkt: 18, openingBdg: 8 },
  { sku: "BAN-IRC-8090", barcode: "8991001000189", name: "Ban IRC 80/90-14 Tubeless", category: "Ban", type: "part", unit: "pcs", brand: "IRC", buy: 185000, sell: 235000, min: 2, openingJkt: 0, openingBdg: 4 },
];

export const SUPPLIERS = [
  { code: "SUP-001", name: "PT Astra Otoparts Distributor", contact: "Budi", phone: "021-5551001" },
  { code: "SUP-002", name: "CV Sinar Jaya Sparepart", contact: "Rina", phone: "021-5551002" },
  { code: "SUP-003", name: "PT Pelumas Nusantara", contact: "Andi", phone: "022-5551003" },
];

export const PAYMENT_METHODS = [
  { code: "CASH", name: "Tunai", type: "cash", ref: false },
  { code: "QRIS", name: "QRIS", type: "qris", ref: true },
  { code: "DEBIT", name: "Kartu Debit", type: "debit", ref: true },
  { code: "CC", name: "Kartu Kredit", type: "credit_card", ref: true },
  { code: "TRF", name: "Transfer Bank", type: "transfer", ref: true },
  { code: "EWALLET", name: "E-Wallet", type: "ewallet", ref: true },
];

export const INSPECTION_TEMPLATES: { vehicleType: "car" | "motorcycle"; name: string; items: [string, string][] }[] = [
  {
    vehicleType: "car",
    name: "Checklist Inspeksi Mobil",
    items: [
      ["Mesin", "Oli mesin (level & kondisi)"],
      ["Mesin", "Air radiator / coolant"],
      ["Mesin", "Filter udara"],
      ["Mesin", "V-belt / fan belt"],
      ["Mesin", "Busi & pengapian"],
      ["Mesin", "Kebocoran oli / cairan"],
      ["Rem", "Kampas rem depan"],
      ["Rem", "Kampas rem belakang"],
      ["Rem", "Minyak rem"],
      ["Kaki-kaki", "Shock absorber"],
      ["Kaki-kaki", "Ball joint & tie rod"],
      ["Kaki-kaki", "Kondisi ban & tekanan angin"],
      ["Kelistrikan", "Aki (tegangan & terminal)"],
      ["Kelistrikan", "Lampu utama, sein & rem"],
      ["Kelistrikan", "Klakson & wiper"],
      ["AC", "Dinginnya AC & filter kabin"],
      ["Transmisi", "Oli transmisi"],
    ],
  },
  {
    vehicleType: "motorcycle",
    name: "Checklist Inspeksi Motor",
    items: [
      ["Mesin", "Oli mesin"],
      ["Mesin", "Busi"],
      ["Mesin", "Filter udara"],
      ["Mesin", "Injeksi / karburator"],
      ["Transmisi", "V-belt / rantai & gir"],
      ["Transmisi", "Roller & kampas ganda (CVT)"],
      ["Transmisi", "Oli gardan"],
      ["Rem", "Kampas rem depan"],
      ["Rem", "Kampas rem belakang"],
      ["Rem", "Minyak rem"],
      ["Kaki-kaki", "Ban depan & belakang"],
      ["Kaki-kaki", "Shock absorber"],
      ["Kelistrikan", "Aki"],
      ["Kelistrikan", "Lampu & klakson"],
    ],
  },
];

export const USERS: { username: string; name: string; role: string; branch: "JKT" | "BDG" | null }[] = [
  { username: "superadmin", name: "Super Admin", role: "Super Admin", branch: "JKT" },
  { username: "owner", name: "Pemilik Bengkel", role: "Owner / Management", branch: "JKT" },
  { username: "manager.jkt", name: "Hendra (Kepala Cabang JKT)", role: "Branch Manager", branch: "JKT" },
  { username: "supervisor.jkt", name: "Agus (Supervisor JKT)", role: "Workshop Supervisor", branch: "JKT" },
  { username: "sa.jkt", name: "Sari (Service Advisor JKT)", role: "Service Advisor", branch: "JKT" },
  { username: "mekanik1.jkt", name: "Joko (Mekanik)", role: "Mechanic", branch: "JKT" },
  { username: "mekanik2.jkt", name: "Bayu (Mekanik)", role: "Mechanic", branch: "JKT" },
  { username: "qc.jkt", name: "Dedi (QC JKT)", role: "QC", branch: "JKT" },
  { username: "parts.jkt", name: "Wawan (Parts JKT)", role: "Parts Staff", branch: "JKT" },
  { username: "purchasing", name: "Lina (Purchasing)", role: "Purchasing", branch: "JKT" },
  { username: "kasir.jkt", name: "Maya (Kasir JKT)", role: "Cashier", branch: "JKT" },
  { username: "accounting", name: "Tono (Accounting)", role: "Accounting", branch: "JKT" },
  { username: "cs.jkt", name: "Putri (Customer Service)", role: "Customer Service", branch: "JKT" },
  { username: "manager.bdg", name: "Asep (Kepala Cabang BDG)", role: "Branch Manager", branch: "BDG" },
  { username: "sa.bdg", name: "Neng (Service Advisor BDG)", role: "Service Advisor", branch: "BDG" },
  { username: "mekanik.bdg", name: "Ujang (Mekanik BDG)", role: "Mechanic", branch: "BDG" },
  { username: "kasir.bdg", name: "Euis (Kasir BDG)", role: "Cashier", branch: "BDG" },
];

export const CUSTOMERS: {
  name: string;
  phone: string;
  type: "retail" | "corporate" | "fleet";
  companyName?: string;
  vehicles: { plate: string; type: "car" | "motorcycle"; brand: string; model: string; year: number; color: string; chassis: string; odo: number }[];
}[] = [
  {
    name: "Budi Santoso",
    phone: "081234567801",
    type: "retail",
    vehicles: [{ plate: "B 1234 ABC", type: "car", brand: "Toyota", model: "Avanza", year: 2019, color: "Silver", chassis: "MHKM1BA3JKK000001", odo: 45200 }],
  },
  {
    name: "Siti Rahmawati",
    phone: "081234567802",
    type: "retail",
    vehicles: [{ plate: "B 3456 XYZ", type: "motorcycle", brand: "Honda", model: "Beat", year: 2021, color: "Hitam", chassis: "MH1JM8110MK000002", odo: 18350 }],
  },
  {
    name: "PT Logistik Cepat",
    phone: "02155512345",
    type: "fleet",
    companyName: "PT Logistik Cepat Indonesia",
    vehicles: [
      { plate: "B 9001 LCI", type: "car", brand: "Daihatsu", model: "Gran Max", year: 2020, color: "Putih", chassis: "MHKV1BA2JLK000003", odo: 98000 },
      { plate: "B 9002 LCI", type: "car", brand: "Mitsubishi", model: "L300", year: 2021, color: "Putih", chassis: "MHMLB0S3LMK000004", odo: 76500 },
    ],
  },
  {
    name: "Andi Wijaya",
    phone: "081234567804",
    type: "retail",
    vehicles: [{ plate: "D 4567 BDG", type: "car", brand: "Honda", model: "Brio", year: 2022, color: "Merah", chassis: "MHRDD1850NJ000005", odo: 21000 }],
  },
  {
    name: "Rina Kartika",
    phone: "081234567805",
    type: "retail",
    vehicles: [{ plate: "B 6789 RKA", type: "motorcycle", brand: "Yamaha", model: "NMAX", year: 2023, color: "Biru", chassis: "MH3SG3190PK000006", odo: 9800 }],
  },
  {
    name: "CV Maju Bersama",
    phone: "02155567890",
    type: "corporate",
    companyName: "CV Maju Bersama",
    vehicles: [{ plate: "B 2468 MJB", type: "car", brand: "Toyota", model: "Innova", year: 2018, color: "Abu-abu", chassis: "MHFJW8EM5J0000007", odo: 132000 }],
  },
];
