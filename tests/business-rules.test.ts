import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/server/db";
import { auditLogs, inventory, invoices, partRequestItems, partRequests, users, warehouses, workOrderJobs, workOrders } from "@/server/db/schema";
import { runWorkshopFlow } from "@/server/seed/demo";
import { createCheckin } from "@/server/services/checkins";
import { createEstimate, recordApproval, sendEstimate, updateEstimate } from "@/server/services/estimates";
import { assignMechanic, createWorkOrder, getWorkOrder, jobAction } from "@/server/services/workorders";
import { createAdjustment, createPartRequest, issuePartRequest, returnPartItem } from "@/server/services/inventory";
import { submitQc } from "@/server/services/qc";
import { createWorkOrderInvoice, receivePayment, refundPayment, voidInvoice } from "@/server/services/invoices";
import { handoverVehicle } from "@/server/services/handover";
import { vehicleTimeline } from "@/server/services/vehicles";
import { login } from "@/server/services/auth";
import { DEMO_PASSWORD } from "@/server/seed";
import { actors, as, estimateItemIds, method, newVehicle, partBySku, serviceByCode } from "./helpers";

afterAll(async () => {
  await closeDb();
});

const key = () => crypto.randomUUID();

describe("BR-015 Odometer", () => {
  it("menolak odometer lebih kecil tanpa override, menerima dengan otorisasi + alasan dan tercatat di audit", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa, "car", 50000);
    const base = { customerId: vehicle.customerId, vehicleId: vehicle.id, fuelLevel: 50, complaint: "Cek" };
    await expect(createCheckin(a.sa, { ...base, odometer: 49000 })).rejects.toThrow(/BR-015/);
    await expect(createCheckin(a.manager, { ...base, odometer: 49000 })).rejects.toThrow(/Alasan override/);
    const ci = await createCheckin(a.manager, { ...base, odometer: 49000, odometerOverrideReason: "Odometer diganti baru" });
    expect(ci.odometerOverrideReason).toBe("Odometer diganti baru");
    const log = await db.query.auditLogs.findFirst({ where: and(eq(auditLogs.action, "OVERRIDE"), eq(auditLogs.referenceNumber, ci.checkinNumber)) });
    expect(log?.reason).toBe("Odometer diganti baru");
  });

  it("tidak boleh ada dua check-in aktif untuk kendaraan yang sama", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa);
    const base = { customerId: vehicle.customerId, vehicleId: vehicle.id, fuelLevel: 50, complaint: "Cek", odometer: 10001 };
    await createCheckin(a.sa, base);
    await expect(createCheckin(a.sa, base)).rejects.toThrow(/check-in aktif/);
  });
});

describe("Estimate & approval (URS-EST-002/003, BR-006, BR-010)", () => {
  it("approve sebagian hanya membawa item yang disetujui ke WO; estimate yang sudah diputuskan tidak dapat diubah", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa);
    const ci = await createCheckin(a.sa, { customerId: vehicle.customerId, vehicleId: vehicle.id, odometer: 10500, fuelLevel: 40, complaint: "Rem & AC" });
    const s1 = await serviceByCode("JS-C004");
    const s2 = await serviceByCode("JS-C006");
    const est = await createEstimate(a.sa, {
      checkinId: ci.id,
      items: [
        { itemType: "service", serviceId: s1.id, qty: 1, discount: 10000 },
        { itemType: "service", serviceId: s2.id, qty: 1 },
      ],
    });
    expect(est.discount).toBe(10000);
    expect(est.grandTotal).toBe(Math.round((150000 + 500000 - 10000) * 1.11 * 100) / 100);
    await expect(createWorkOrder(a.sa, { estimateId: est.id })).rejects.toThrow(/disetujui/);
    await expect(
      recordApproval(a.sa, est.id, { decisions: [], customerName: "Budi", channel: "in_person" }),
    ).rejects.toThrow();
    const items = await estimateItemIds(est.id);
    await expect(
      recordApproval(a.sa, est.id, { decisions: items.map((i) => ({ itemId: i.id, decision: "approved" })), customerName: "Budi", channel: "in_person" }),
    ).rejects.toThrow(/Evidence/);
    const res = await recordApproval(a.sa, est.id, {
      decisions: items.map((i) => ({ itemId: i.id, decision: i.serviceId === s1.id ? "approved" : "rejected" })),
      customerName: "Budi",
      channel: "in_person",
      evidenceNote: "Tanda tangan di form estimate",
    });
    expect(res.status).toBe("partially_approved");
    await expect(updateEstimate(a.sa, est.id, { items: [{ itemType: "service", serviceId: s2.id, qty: 1 }] })).rejects.toThrow(/BR-010/);
    const wo = await createWorkOrder(a.sa, { estimateId: est.id });
    const jobs = await db.select().from(workOrderJobs).where(eq(workOrderJobs.workOrderId, wo.id));
    expect(jobs.map((j) => j.serviceId)).toEqual([s1.id]);
  });
});

describe("Parts & inventory (BR-005, BR-009, AC-003, URS-INV-006)", () => {
  it("issue sebagian, stok tidak bisa negatif, WO menjadi Waiting Parts saat stok kurang", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa, "motorcycle", 3000);
    const roller = await partBySku("TRS-ROLLER-BEAT");
    const wh = (await db.query.warehouses.findFirst({ where: eq(warehouses.code, "GD-JKT") }))!;
    // Set stok roller = 2
    await createAdjustment(a.manager, { warehouseId: wh.id, adjustmentType: "adjustment", reason: "Set stok test", items: [{ partId: roller.id, countedQty: 2 }] });
    const r = await runWorkshopFlow(a, { vehicleId: vehicle.id, complaint: "CVT", serviceCodes: ["JS-M003"], stopAt: "in_progress" });
    const pr = await createPartRequest(a.mechanic, r.wo!.id, { items: [{ partId: roller.id, qty: 3 }] });
    expect(pr.shortage).toBe(true);
    expect(pr.warnings.length).toBe(1); // tidak ada di estimate yang disetujui
    expect((await db.query.workOrders.findFirst({ where: eq(workOrders.id, r.wo!.id) }))!.status).toBe("waiting_parts");
    const [item] = await db.select().from(partRequestItems).where(eq(partRequestItems.partRequestId, pr.id));
    await expect(issuePartRequest(a.parts, pr.id, { items: [{ itemId: item.id, qty: 3 }] })).rejects.toThrow(/tidak cukup/);
    const res = await issuePartRequest(a.parts, pr.id, { items: [{ itemId: item.id, qty: 2 }] });
    expect(res.status).toBe("partially_issued");
    const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.partId, roller.id), eq(inventory.warehouseId, wh.id)) });
    expect(inv!.quantity).toBe(0);
    // Mekanik tanpa permission tidak dapat issue part
    await expect(issuePartRequest(a.mechanic, pr.id, { items: [{ itemId: item.id, qty: 1 }] })).rejects.toThrow(/inventory.issue/);
  });

  it("concurrency: dua issue bersamaan atas stok terakhir — hanya satu yang berhasil", async () => {
    const a = await actors();
    const aki = await partBySku("ELK-AKI-NS40");
    const wh = (await db.query.warehouses.findFirst({ where: eq(warehouses.code, "GD-JKT") }))!;
    await createAdjustment(a.manager, { warehouseId: wh.id, adjustmentType: "adjustment", reason: "Set stok test", items: [{ partId: aki.id, countedQty: 1 }] });
    const flows = [];
    for (let i = 0; i < 2; i++) {
      const { vehicle } = await newVehicle(a.sa);
      const r = await runWorkshopFlow(a, { vehicleId: vehicle.id, complaint: "Aki", serviceCodes: ["JS-C007"], stopAt: "in_progress" });
      const pr = await createPartRequest(a.mechanic, r.wo!.id, { items: [{ partId: aki.id, qty: 1 }] });
      const [item] = await db.select().from(partRequestItems).where(eq(partRequestItems.partRequestId, pr.id));
      flows.push({ pr, item });
    }
    const results = await Promise.allSettled(flows.map((f) => issuePartRequest(a.parts, f.pr.id, { items: [{ itemId: f.item.id, qty: 1 }] })));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    const inv = await db.query.inventory.findFirst({ where: and(eq(inventory.partId, aki.id), eq(inventory.warehouseId, wh.id)) });
    expect(inv!.quantity).toBe(0);
  });
});

describe("Pekerjaan tambahan & invoice (BR-006, BR-007, AC-002)", () => {
  it("part terpakai melebihi persetujuan memblokir invoice; estimate tambahan yang disetujui membuka blokir", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa);
    const filter = await partBySku("FLT-UDR-AVZ");
    const r = await runWorkshopFlow(a, { vehicleId: vehicle.id, complaint: "Servis", serviceCodes: ["JS-C002"], parts: [{ sku: "OLI-TMO-1L", qty: 4 }], stopAt: "in_progress" });
    const woId = r.wo!.id;
    // Mekanik minta filter udara (tidak ada di estimate) dan part keluar
    const pr = await createPartRequest(a.mechanic, woId, { items: [{ partId: filter.id, qty: 1 }] });
    const [item] = await db.select().from(partRequestItems).where(eq(partRequestItems.partRequestId, pr.id));
    await issuePartRequest(a.parts, pr.id, { items: [{ itemId: item.id, qty: 1 }] });
    const jobs = await db.select().from(workOrderJobs).where(eq(workOrderJobs.workOrderId, woId));
    for (const j of jobs) await jobAction(a.mechanic, j.id, "complete");
    await submitQc(a.qc, woId, { result: "pass" });
    await expect(createWorkOrderInvoice(a.cashier, woId, {})).rejects.toThrow(/BR-006/);

    // Estimate tambahan → disetujui customer
    const add = await createEstimate(a.sa, { workOrderId: woId, items: [{ itemType: "part", partId: filter.id, qty: 1 }] });
    await sendEstimate(a.sa, add.id);
    const items = await estimateItemIds(add.id);
    await recordApproval(a.sa, add.id, { decisions: items.map((i) => ({ itemId: i.id, decision: "approved" })), customerName: "Owner", channel: "phone", evidenceNote: "Telepon 10:15" });
    const inv = await createWorkOrderInvoice(a.cashier, woId, {});
    // 50.000 jasa + 4x95.000 oli + 95.000 filter = 525.000 (+PPN 11%)
    expect(inv.subtotal).toBe(525000);
    expect(inv.grandTotal).toBe(582750);
    expect(inv.costTotal).toBeGreaterThan(0);
  });

  it("estimate tambahan berisi jasa menambah job baru ke WO", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa);
    const r = await runWorkshopFlow(a, { vehicleId: vehicle.id, complaint: "Servis", serviceCodes: ["JS-C002"], stopAt: "in_progress" });
    const spooring = await serviceByCode("JS-C005");
    const add = await createEstimate(a.sa, { workOrderId: r.wo!.id, items: [{ itemType: "service", serviceId: spooring.id, qty: 1 }] });
    const items = await estimateItemIds(add.id);
    await recordApproval(a.sa, add.id, { decisions: items.map((i) => ({ itemId: i.id, decision: "approved" })), customerName: "Owner", channel: "whatsapp", evidenceNote: "WA" });
    const jobs = await db.select().from(workOrderJobs).where(eq(workOrderJobs.workOrderId, r.wo!.id));
    expect(jobs.length).toBe(2);
    expect(jobs.find((j) => j.serviceId === spooring.id)?.status).toBe("pending");
  });
});

describe("QC (AC-004) & mekanik", () => {
  it("QC Rework mengembalikan job ke mekanik dan tercatat di histori", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa, "motorcycle");
    const r = await runWorkshopFlow(a, { vehicleId: vehicle.id, complaint: "Servis", serviceCodes: ["JS-M001", "JS-M004"], stopAt: "qc" });
    const woId = r.wo!.id;
    await expect(submitQc(a.qc, woId, { result: "rework" })).rejects.toThrow(/Catatan koreksi/);
    const jobs = await db.select().from(workOrderJobs).where(eq(workOrderJobs.workOrderId, woId));
    await submitQc(a.qc, woId, { result: "rework", notes: "Rem belakang masih bunyi", reworkJobIds: [jobs[1].id] });
    let wo = await getWorkOrder(a.supervisor, woId);
    expect(wo.status).toBe("rework");
    const reworked = wo.jobs.find((j) => j.id === jobs[1].id)!;
    expect(reworked.status).toBe("pending");
    expect(reworked.reworkCount).toBe(1);
    expect(wo.statusHistory.some((h) => h.toStatus === "rework" && h.note?.includes("Rem belakang"))).toBe(true);
    // Invoice belum bisa dibuat sebelum QC pass
    await expect(createWorkOrderInvoice(a.cashier, woId, {})).rejects.toThrow(/QC/);
    await jobAction(a.mechanic, jobs[1].id, "start");
    await jobAction(a.mechanic, jobs[1].id, "pause");
    await jobAction(a.mechanic, jobs[1].id, "resume");
    await jobAction(a.mechanic, jobs[1].id, "complete");
    wo = await getWorkOrder(a.supervisor, woId);
    expect(wo.status).toBe("qc");
    await submitQc(a.qc, woId, { result: "pass" });
    expect((await getWorkOrder(a.supervisor, woId)).status).toBe("completed");
  });

  it("mekanik lain tidak dapat mengerjakan job yang bukan miliknya", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa);
    const ci = await createCheckin(a.sa, { customerId: vehicle.customerId, vehicleId: vehicle.id, odometer: 10200, fuelLevel: 50, complaint: "Tune up" });
    const s = await serviceByCode("JS-C003");
    const est = await createEstimate(a.sa, { checkinId: ci.id, items: [{ itemType: "service", serviceId: s.id, qty: 1 }] });
    const items = await estimateItemIds(est.id);
    await recordApproval(a.sa, est.id, { decisions: items.map((i) => ({ itemId: i.id, decision: "approved" })), customerName: "X", channel: "in_person", evidenceNote: "ttd" });
    const wo = await createWorkOrder(a.sa, { estimateId: est.id });
    const [job] = await db.select().from(workOrderJobs).where(eq(workOrderJobs.workOrderId, wo.id));
    await expect(jobAction(a.mechanic, job.id, "start")).rejects.toThrow(/belum ditugaskan/);
    await assignMechanic(a.supervisor, wo.id, { jobId: job.id, mechanicId: a.mechanic.userId });
    const other = await as("mekanik2.jkt");
    await expect(jobAction(other, job.id, "start")).rejects.toThrow(/mekanik lain/);
    await jobAction(a.mechanic, job.id, "start");
    await expect(jobAction(a.mechanic, job.id, "start")).rejects.toThrow();
  });
});

describe("Kasir: payment, refund, void (AC-005, AC-006, URS-CAS-004)", () => {
  it("split payment, overpayment ditolak, idempotency mencegah duplicate payment, refund wajib permission", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa);
    const r = await runWorkshopFlow(a, { vehicleId: vehicle.id, complaint: "Oli", serviceCodes: ["JS-C002"], parts: [{ sku: "OLI-TMO-1L", qty: 4 }], stopAt: "invoiced" });
    const inv = r.invoice!;
    const cash = await method("CASH");
    const qris = await method("QRIS");
    await expect(receivePayment(a.cashier, inv.id, { idempotencyKey: key(), lines: [{ paymentMethodId: cash.id, amount: inv.grandTotal + 1 }] })).rejects.toThrow(/AC-006/);
    await expect(receivePayment(a.cashier, inv.id, { idempotencyKey: key(), lines: [{ paymentMethodId: qris.id, amount: 1000 }] })).rejects.toThrow(/referensi/);
    const k = key();
    const p1 = await receivePayment(a.cashier, inv.id, { idempotencyKey: k, lines: [{ paymentMethodId: cash.id, amount: 100000, tenderedAmount: 100000 }] });
    expect(p1.paymentStatus).toBe("partial");
    const dup = await receivePayment(a.cashier, inv.id, { idempotencyKey: k, lines: [{ paymentMethodId: cash.id, amount: 100000, tenderedAmount: 100000 }] });
    expect(dup.duplicate).toBe(true);
    expect(dup.paidAmount).toBe(100000);
    const rest = inv.grandTotal - 100000;
    const p2 = await receivePayment(a.cashier, inv.id, {
      idempotencyKey: key(),
      lines: [
        { paymentMethodId: cash.id, amount: 50000, tenderedAmount: 100000 },
        { paymentMethodId: qris.id, amount: rest - 50000, referenceNumber: "QR-123" },
      ],
    });
    expect(p2.paymentStatus).toBe("paid");
    expect(p2.payments![0].changeAmount).toBe(50000);
    await expect(receivePayment(a.cashier, inv.id, { idempotencyKey: key(), lines: [{ paymentMethodId: cash.id, amount: 1 }] })).rejects.toThrow(/lunas/);

    // Void invoice ditolak bila ada pembayaran; refund butuh permission + alasan
    await expect(voidInvoice(a.manager, inv.id, { reason: "salah" })).rejects.toThrow(/pembayaran/);
    await expect(refundPayment(a.cashier, inv.id, { paymentMethodId: cash.id, amount: 1000, reason: "Lebih bayar" })).rejects.toThrow(/payment.refund/);
    await expect(refundPayment(a.manager, inv.id, { paymentMethodId: cash.id, amount: inv.grandTotal + 1, reason: "x refund" })).rejects.toThrow(/melebihi/);
    const ref = await refundPayment(a.manager, inv.id, { paymentMethodId: cash.id, amount: inv.grandTotal, reason: "Customer komplain, batal" });
    expect(ref.paymentStatus).toBe("refunded");
    const refundLog = await db.query.auditLogs.findFirst({ where: and(eq(auditLogs.action, "REFUND"), eq(auditLogs.userId, a.manager.userId)) });
    expect(refundLog?.reason).toBe("Customer komplain, batal");
  });
});

describe("Serah terima (BR-008)", () => {
  it("handover butuh QC Pass + lunas/otorisasi piutang; override hanya user berwenang dengan alasan", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa);
    const r = await runWorkshopFlow(a, { vehicleId: vehicle.id, complaint: "Servis", serviceCodes: ["JS-C002"], stopAt: "invoiced" });
    const woId = r.wo!.id;
    await expect(handoverVehicle(a.cashier, woId, { receivedBy: "Budi" })).rejects.toThrow(/belum terpenuhi/);
    await expect(handoverVehicle(a.cashier, woId, { receivedBy: "Budi", overrideReason: "Langganan" })).rejects.toThrow(/handover.override/);
    const res = await handoverVehicle(a.manager, woId, { receivedBy: "Budi", overrideReason: "Customer korporat, bayar besok via transfer" });
    expect(res.override).toBe(true);
    const wo = await db.query.workOrders.findFirst({ where: eq(workOrders.id, woId) });
    expect(wo!.handoverOverrideReason).toContain("korporat");
    const log = await db.query.auditLogs.findFirst({ where: and(eq(auditLogs.entity, "vehicle_handover"), eq(auditLogs.entityId, woId)) });
    expect(log?.action).toBe("OVERRIDE");
    // Invoice tidak bisa di-void setelah handover
    await expect(voidInvoice(a.manager, r.invoice!.id, { reason: "test void" })).rejects.toThrow(/diserahkan/);
  });
});

describe("Multi-cabang & akses (BR-012, BR-013, AC-001)", () => {
  it("user cabang Bandung tidak dapat melihat WO/histori cabang Jakarta", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa);
    const r = await runWorkshopFlow(a, { vehicleId: vehicle.id, complaint: "Servis", serviceCodes: ["JS-C002"], stopAt: "in_progress" });
    const saBdg = await as("sa.bdg", "BDG");
    await expect(getWorkOrder(saBdg, r.wo!.id)).rejects.toThrow(/cabang/);
    // Master kendaraan bisa dilihat (company-level) tapi histori JKT tidak muncul
    const timeline = await vehicleTimeline(saBdg, vehicle.id);
    expect(timeline.length).toBe(0);
    const ownTimeline = await vehicleTimeline(a.sa, vehicle.id);
    expect(ownTimeline.length).toBe(1);
    // User single-branch tidak bisa berpindah ke cabang lain
    const forced = await (await import("@/server/auth/context")).buildContext(saBdg.userId, { activeBranchId: a.sa.activeBranchId });
    expect(forced.activeBranchId).toBe(saBdg.activeBranchId);
  });

  it("transaksi wajib memiliki cabang aktif; Owner pada mode 'semua cabang' harus memilih cabang", async () => {
    const owner = await (await import("@/server/auth/context")).buildContext((await db.query.users.findFirst({ where: eq(users.username, "owner") }))!.id, { activeBranchId: null });
    expect(owner.activeBranchId).toBeNull();
    expect(owner.branchIds.length).toBe(2);
    const { createBooking } = await import("@/server/services/bookings");
    await expect(createBooking(owner, {})).rejects.toThrow();
  });
});

describe("Autentikasi (URS-GEN-001, SRS 4.3)", () => {
  it("login dengan username/email, lockout setelah 5x gagal", async () => {
    const ok = await login("kasir.bdg", DEMO_PASSWORD, { ip: "127.0.0.1" });
    expect(ok.token.length).toBeGreaterThan(20);
    const ok2 = await login("kasir.bdg@reka-auto.test", DEMO_PASSWORD, {});
    expect(ok2.userId).toBe(ok.userId);
    for (let i = 0; i < 5; i++) await expect(login("mekanik.bdg", "salah", {})).rejects.toThrow(/salah/);
    await expect(login("mekanik.bdg", DEMO_PASSWORD, {})).rejects.toThrow(/terkunci/);
    const logs = await db.select().from(auditLogs).where(and(eq(auditLogs.action, "LOGIN_FAILED"), eq(auditLogs.userId, (await db.query.users.findFirst({ where: eq(users.username, "mekanik.bdg") }))!.id)));
    expect(logs.length).toBe(5);
  });
});

describe("Retur part", () => {
  it("retur part mengembalikan stok dan mengurangi pemakaian yang ditagihkan", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa);
    const busi = await partBySku("PGP-BUSI-K16");
    const wh = (await db.query.warehouses.findFirst({ where: eq(warehouses.code, "GD-JKT") }))!;
    const r = await runWorkshopFlow(a, { vehicleId: vehicle.id, complaint: "Tune up", serviceCodes: ["JS-C003"], parts: [{ sku: "PGP-BUSI-K16", qty: 4 }], stopAt: "in_progress" });
    const before = (await db.query.inventory.findFirst({ where: and(eq(inventory.partId, busi.id), eq(inventory.warehouseId, wh.id)) }))!.quantity;
    const [pr] = await db.select().from(partRequests).where(eq(partRequests.workOrderId, r.wo!.id));
    const [item] = await db.select().from(partRequestItems).where(eq(partRequestItems.partRequestId, pr.id));
    await expect(returnPartItem(a.parts, item.id, { qty: 5, reason: "kelebihan" })).rejects.toThrow(/melebihi/);
    await returnPartItem(a.parts, item.id, { qty: 1, reason: "Hanya 3 silinder" });
    const after = (await db.query.inventory.findFirst({ where: and(eq(inventory.partId, busi.id), eq(inventory.warehouseId, wh.id)) }))!.quantity;
    expect(after).toBe(before + 1);
    const jobs = await db.select().from(workOrderJobs).where(eq(workOrderJobs.workOrderId, r.wo!.id));
    for (const j of jobs) await jobAction(a.mechanic, j.id, "complete");
    await submitQc(a.qc, r.wo!.id, { result: "pass" });
    const inv = await createWorkOrderInvoice(a.cashier, r.wo!.id, {});
    const full = await db.query.invoices.findFirst({ where: eq(invoices.id, inv.id), with: { items: true } });
    expect(full!.items.find((i) => i.itemId === busi.id)!.qty).toBe(3);
  });
});
