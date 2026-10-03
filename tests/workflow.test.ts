import { afterAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { closeDb, db } from "@/server/db";
import { auditLogs, bookings, inventory, invoices, serviceReminders, stockMovements, vehicleCheckins, vehicles, warehouses, workOrders, workOrderStatusHistory } from "@/server/db/schema";
import { runWorkshopFlow } from "@/server/seed/demo";
import { getWorkOrder, listMyJobs } from "@/server/services/workorders";
import { vehicleTimeline } from "@/server/services/vehicles";
import { getDashboard } from "@/server/services/dashboard";
import { availableReports, runReport } from "@/server/services/reports";
import { globalSearch } from "@/server/services/search";
import { createBooking, confirmBooking, cancelBooking } from "@/server/services/bookings";
import { createCheckin } from "@/server/services/checkins";
import { actors, as, newVehicle, partBySku } from "./helpers";
import { addDaysISO, todayISO } from "@/lib/utils";

afterAll(async () => {
  await closeDb();
});

describe("Alur end-to-end (BRD 1.4 Workflow Operasional)", () => {
  it("Booking → Check-in → Inspeksi → Estimate → Approval → WO → Mekanik+Part → QC → Invoice → Payment → Handover → Reminder", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa, "car", 40000);
    const oil = await partBySku("OLI-TMO-1L");
    const whId = (await db.query.warehouses.findFirst({ where: eq(warehouses.code, "GD-JKT") }))!.id;
    const before = (await db.query.inventory.findFirst({ where: and(eq(inventory.partId, oil.id), eq(inventory.warehouseId, whId)) }))!.quantity;

    // Booking dan konversi ke check-in
    const booking = await createBooking(a.sa, {
      customerId: vehicle.customerId,
      vehicleId: vehicle.id,
      bookingDate: todayISO(),
      bookingTime: "10:00",
      complaint: "Servis 10.000",
      source: "whatsapp",
    });
    expect(booking.bookingNumber).toMatch(/^BKG-JKT-\d{6}-\d{3}$/);
    await confirmBooking(a.sa, booking.id);

    const result = await runWorkshopFlow(a, {
      vehicleId: vehicle.id,
      complaint: "Servis 10.000",
      serviceCodes: ["JS-C001"],
      parts: [{ sku: "OLI-TMO-1L", qty: 4 }],
      stopAt: "handover",
      payment: "split",
    });
    const wo = (await db.query.workOrders.findFirst({ where: eq(workOrders.id, result.wo!.id) }))!;
    expect(wo.woNumber).toMatch(/^WO-JKT-\d{6}-\d{3}$/);
    expect(wo.status).toBe("completed");
    expect(wo.handoverAt).not.toBeNull();

    // Status lifecycle terekam
    const history = await db.select().from(workOrderStatusHistory).where(eq(workOrderStatusHistory.workOrderId, wo.id));
    const statuses = history.map((h) => h.toStatus);
    for (const s of ["waiting", "assigned", "in_progress", "qc", "completed"]) expect(statuses).toContain(s);

    // Invoice lunas via split payment (AC-005)
    const inv = (await db.query.invoices.findFirst({ where: eq(invoices.workOrderId, wo.id) }))!;
    expect(inv.paymentStatus).toBe("paid");
    expect(inv.paidAmount).toBe(inv.grandTotal);
    expect(inv.invoiceNumber).toMatch(/^INV-JKT-\d{6}-\d{3}$/);
    // 350.000 jasa + 4 x 95.000 oli = 730.000, PPN 11% = 80.300
    expect(inv.subtotal).toBe(730000);
    expect(inv.tax).toBe(80300);
    expect(inv.grandTotal).toBe(810300);

    // Stok berkurang & mutasi mereferensikan WO (AC-003)
    const after = (await db.query.inventory.findFirst({ where: and(eq(inventory.partId, oil.id), eq(inventory.warehouseId, whId)) }))!.quantity;
    expect(after).toBe(before - 4);
    const mv = await db.select().from(stockMovements).where(and(eq(stockMovements.partId, oil.id), eq(stockMovements.transactionType, "issue")));
    expect(mv.some((m) => m.referenceNumber?.includes(wo.woNumber))).toBe(true);

    // Check-in ditutup, odometer kendaraan terupdate
    const ci = (await db.query.vehicleCheckins.findFirst({ where: eq(vehicleCheckins.id, wo.checkinId) }))!;
    expect(ci.status).toBe("completed");
    const v = (await db.query.vehicles.findFirst({ where: eq(vehicles.id, vehicle.id) }))!;
    expect(v.lastOdometer).toBe(41500);

    // Service reminder berbasis tanggal & odometer (URS-CRM-001)
    const rem = await db.select().from(serviceReminders).where(eq(serviceReminders.vehicleId, vehicle.id));
    expect(rem.length).toBeGreaterThan(0);
    expect(rem[0].dueDate).toBe(addDaysISO(todayISO(), 180));
    expect(rem[0].dueOdometer).toBe(41500 + 10000);

    // Vehicle timeline menampilkan pekerjaan, part & invoice (URS-VEH-003/005)
    const timeline = await vehicleTimeline(a.sa, vehicle.id);
    expect(timeline[0].jobs.length).toBe(1);
    expect(timeline[0].parts[0].qty).toBe(4);
    expect(timeline[0].invoice?.paymentStatus).toBe("paid");

    // Audit trail aktivitas kritikal (AC-008)
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.referenceNumber, wo.woNumber));
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.every((l) => l.userId && l.createdAt)).toBe(true);
  });

  it("booking dapat dibatalkan dengan alasan (BR-011) dan dikonversi menjadi check-in", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa);
    const b1 = await createBooking(a.sa, { customerId: vehicle.customerId, vehicleId: vehicle.id, bookingDate: todayISO(), bookingTime: "09:00" });
    await expect(cancelBooking(a.sa, b1.id, { reason: "" })).rejects.toThrow();
    await cancelBooking(a.sa, b1.id, { reason: "Customer berhalangan" });
    const b2 = await createBooking(a.sa, { customerId: vehicle.customerId, vehicleId: vehicle.id, bookingDate: todayISO(), bookingTime: "11:00" });
    const ci = await createCheckin(a.sa, { bookingId: b2.id, customerId: vehicle.customerId, vehicleId: vehicle.id, odometer: 10100, fuelLevel: 50, complaint: "Tes" });
    const booking = await db.query.bookings.findFirst({ where: eq(bookings.id, b2.id) });
    expect(booking!.status).toBe("arrived");
    expect(booking!.checkinId).toBe(ci.id);
  });

  it("mechanic view hanya menampilkan job yang ditugaskan (URS-WO-004)", async () => {
    const a = await actors();
    const { vehicle } = await newVehicle(a.sa, "motorcycle", 5000);
    const r = await runWorkshopFlow(a, { vehicleId: vehicle.id, complaint: "Servis", serviceCodes: ["JS-M001"], stopAt: "in_progress" });
    const mine = await listMyJobs(a.mechanic);
    expect(mine.some((j) => j.woId === r.wo!.id)).toBe(true);
    const other = await as("mekanik2.jkt");
    const theirs = await listMyJobs(other);
    expect(theirs.some((j) => j.woId === r.wo!.id)).toBe(false);
    await expect(getWorkOrder(other, r.wo!.id)).rejects.toThrow(/tidak ditugaskan/);
  });

  it("dashboard, global search dan seluruh laporan dapat dijalankan", async () => {
    const owner = await buildOwner();
    const dash = await getDashboard(owner);
    expect(dash.trend.length).toBe(14);
    expect(dash.sales.sales_mtd).toBeGreaterThan(0);
    const hits = await globalSearch(owner, "WO-JKT");
    expect(hits.some((h) => h.type === "Work Order")).toBe(true);
    const admin = await as("superadmin");
    const reports = availableReports(admin);
    expect(reports.length).toBeGreaterThanOrEqual(25);
    for (const r of reports) {
      const res = await runReport(admin, r.key, { from: addDaysISO(todayISO(), -30), to: todayISO() });
      expect(Array.isArray(res.rows)).toBe(true);
    }
  });
});

async function buildOwner() {
  const { buildContext } = await import("@/server/auth/context");
  const { userId } = await import("./helpers");
  return buildContext(await userId("owner"), { activeBranchId: null });
}
