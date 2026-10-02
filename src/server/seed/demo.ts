import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { estimateItems, partRequests, parts, paymentMethods, services, vehicles, workOrderJobs } from "@/server/db/schema";
import { buildContext, type AuthContext } from "@/server/auth/context";
import { createCheckin, createInspection, getInspectionTemplate } from "@/server/services/checkins";
import { createEstimate, recordApproval, sendEstimate } from "@/server/services/estimates";
import { assignMechanic, createWorkOrder, jobAction } from "@/server/services/workorders";
import { createPartRequest, issuePartRequest } from "@/server/services/inventory";
import { submitQc } from "@/server/services/qc";
import { authorizeReceivable, createCounterSale, createWorkOrderInvoice, receivePayment } from "@/server/services/invoices";
import { handoverVehicle } from "@/server/services/handover";
import { createBooking, confirmBooking } from "@/server/services/bookings";
import { addDaysISO, todayISO } from "@/lib/utils";
import type { SeedIds } from "./index";

export type FlowActors = {
  sa: AuthContext;
  supervisor: AuthContext;
  mechanic: AuthContext;
  parts: AuthContext;
  qc: AuthContext;
  cashier: AuthContext;
  manager: AuthContext;
};

export type FlowStage = "estimate_sent" | "in_progress" | "qc" | "invoiced" | "paid" | "handover";

const STAGES: FlowStage[] = ["estimate_sent", "in_progress", "qc", "invoiced", "paid", "handover"];
const reached = (target: FlowStage, stage: FlowStage) => STAGES.indexOf(target) >= STAGES.indexOf(stage);

/** Menjalankan alur bisnis end-to-end melalui service layer (dipakai untuk demo & test) */
export async function runWorkshopFlow(
  a: FlowActors,
  opts: {
    vehicleId: string;
    complaint: string;
    odometerAdd?: number;
    serviceCodes: string[];
    parts?: { sku: string; qty: number }[];
    stopAt: FlowStage;
    payment?: "cash" | "split" | "receivable";
  },
) {
  const v = await db.query.vehicles.findFirst({ where: eq(vehicles.id, opts.vehicleId) });
  if (!v) throw new Error("vehicle not found");
  const checkin = await createCheckin(a.sa, {
    customerId: v.customerId,
    vehicleId: v.id,
    odometer: v.lastOdometer + (opts.odometerAdd ?? 1500),
    fuelLevel: 50,
    complaint: opts.complaint,
    conditionNotes: "Baret halus bumper belakang",
    belongings: "STNK, payung",
  });
  const tpl = await getInspectionTemplate(a.sa, v.vehicleType);
  if (tpl) {
    await createInspection(a.sa, checkin.id, {
      notes: "Inspeksi awal",
      items: tpl.items.map((it, i) => ({ category: it.category, itemName: it.itemName, result: i % 5 === 1 ? "attention" : i % 7 === 2 ? "replace" : "good", notes: null })),
    });
  }
  const svc = await db.select().from(services).where(and(eq(services.companyId, a.sa.companyId), inArray(services.serviceCode, opts.serviceCodes)));
  const prt = opts.parts?.length ? await db.select().from(parts).where(and(eq(parts.companyId, a.sa.companyId), inArray(parts.sku, opts.parts.map((p) => p.sku)))) : [];
  const estimate = await createEstimate(a.sa, {
    checkinId: checkin.id,
    items: [
      ...svc.map((s) => ({ itemType: "service", serviceId: s.id, qty: 1, discount: 0 })),
      ...(opts.parts ?? []).map((p) => {
        const part = prt.find((x) => x.sku === p.sku)!;
        return { itemType: part.itemType, partId: part.id, qty: p.qty, discount: 0 };
      }),
    ],
  });
  await sendEstimate(a.sa, estimate.id);
  if (opts.stopAt === "estimate_sent") return { checkin, estimate };

  const items = await db.select().from(estimateItems).where(eq(estimateItems.estimateId, estimate.id));
  await recordApproval(a.sa, estimate.id, {
    decisions: items.map((i) => ({ itemId: i.id, decision: "approved" })),
    customerName: "Pemilik kendaraan",
    channel: "whatsapp",
    evidenceNote: "Disetujui via WhatsApp",
  });
  const wo = await createWorkOrder(a.sa, { estimateId: estimate.id, priority: "normal", bay: "Bay 1" });
  const jobs = await db.select().from(workOrderJobs).where(eq(workOrderJobs.workOrderId, wo.id));
  for (const j of jobs) await assignMechanic(a.supervisor, wo.id, { jobId: j.id, mechanicId: a.mechanic.userId });
  for (const j of jobs) await jobAction(a.mechanic, j.id, "start");
  if (opts.parts?.length) {
    const pr = await createPartRequest(a.mechanic, wo.id, { items: opts.parts.map((p) => ({ partId: prt.find((x) => x.sku === p.sku)!.id, qty: p.qty })) });
    const full = await db.query.partRequests.findFirst({ where: eq(partRequests.id, pr.id), with: { items: true } });
    await issuePartRequest(a.parts, pr.id, { items: full!.items.map((i) => ({ itemId: i.id, qty: i.qtyRequested })) });
  }
  if (opts.stopAt === "in_progress") return { checkin, estimate, wo };
  for (const j of jobs) await jobAction(a.mechanic, j.id, "complete", "Selesai dikerjakan");
  if (opts.stopAt === "qc") return { checkin, estimate, wo };
  await submitQc(a.qc, wo.id, { result: "pass", notes: "OK", checklist: [{ item: "Test jalan", ok: true }] });
  const invoice = await createWorkOrderInvoice(a.cashier, wo.id, {});
  if (opts.stopAt === "invoiced") return { checkin, estimate, wo, invoice };
  const methods = await db.select().from(paymentMethods).where(eq(paymentMethods.companyId, a.cashier.companyId));
  const cash = methods.find((m) => m.code === "CASH")!;
  const qris = methods.find((m) => m.code === "QRIS")!;
  if (opts.payment === "receivable") {
    await authorizeReceivable(a.manager, invoice.id, { dueDate: addDaysISO(todayISO(), 30), note: "Customer fleet - tempo 30 hari" });
  } else if (opts.payment === "split") {
    const half = Math.round(invoice.grandTotal / 2);
    await receivePayment(a.cashier, invoice.id, {
      idempotencyKey: crypto.randomUUID(),
      lines: [
        { paymentMethodId: cash.id, amount: half, tenderedAmount: half },
        { paymentMethodId: qris.id, amount: invoice.grandTotal - half, referenceNumber: "QR" + Date.now() },
      ],
    });
  } else {
    await receivePayment(a.cashier, invoice.id, {
      idempotencyKey: crypto.randomUUID(),
      lines: [{ paymentMethodId: cash.id, amount: invoice.grandTotal, tenderedAmount: Math.ceil(invoice.grandTotal / 50000) * 50000 }],
    });
  }
  if (opts.stopAt === "paid") return { checkin, estimate, wo, invoice };
  await handoverVehicle(a.cashier, wo.id, { receivedBy: "Pemilik kendaraan", notes: "Kendaraan diterima dalam kondisi baik" });
  return { checkin, estimate, wo, invoice };
}

/** Geser tanggal transaksi demo ke masa lalu agar dashboard & laporan berisi tren */
async function backdate(woId: string, days: number) {
  const interval = sql.raw(`interval '${days} days'`);
  await db.execute(sql`update wms.vehicle_checkins set arrival_time = arrival_time - ${interval}, created_at = created_at - ${interval} where id = (select checkin_id from wms.work_orders where id = ${woId})`);
  await db.execute(sql`update wms.work_orders set created_at = created_at - ${interval}, started_at = started_at - ${interval}, completed_at = completed_at - ${interval}, handover_at = handover_at - ${interval} where id = ${woId}`);
  await db.execute(sql`update wms.work_order_jobs set completed_at = completed_at - ${interval}, started_at = started_at - ${interval} where work_order_id = ${woId}`);
  await db.execute(sql`update wms.invoices set invoice_date = invoice_date - ${interval} where work_order_id = ${woId}`);
  await db.execute(sql`update wms.payments set payment_date = payment_date - ${interval} where invoice_id in (select id from wms.invoices where work_order_id = ${woId})`);
  await db.execute(sql`update wms.estimates set created_at = created_at - ${interval} where checkin_id = (select checkin_id from wms.work_orders where id = ${woId})`);
  await db.execute(sql`update wms.stock_movements set transaction_date = transaction_date - ${interval} where reference_id in (select id from wms.part_requests where work_order_id = ${woId})`);
  // Simulasi durasi kerja mekanik yang realistis
  await db.execute(sql`update wms.work_order_mechanics m set duration_minutes = greatest(m.duration_minutes, round(j.standard_hour * 60 * (0.8 + random() * 0.5))) from wms.work_order_jobs j where j.id = m.job_id and m.work_order_id = ${woId}`);
  await db.execute(sql`update wms.work_order_jobs set actual_minutes = (select coalesce(sum(duration_minutes),0) from wms.work_order_mechanics m where m.job_id = work_order_jobs.id) where work_order_id = ${woId}`);
}

export async function seedDemoTransactions(ids: SeedIds) {
  const ctx = (u: string, branch: string) => buildContext(ids.userIds[u], { activeBranchId: branch });
  const a: FlowActors = {
    sa: await ctx("sa.jkt", ids.jkt),
    supervisor: await ctx("supervisor.jkt", ids.jkt),
    mechanic: await ctx("mekanik1.jkt", ids.jkt),
    parts: await ctx("parts.jkt", ids.jkt),
    qc: await ctx("qc.jkt", ids.jkt),
    cashier: await ctx("kasir.jkt", ids.jkt),
    manager: await ctx("manager.jkt", ids.jkt),
  };
  const mech2 = await ctx("mekanik2.jkt", ids.jkt);
  const v = ids.vehicleIds;

  // Transaksi historis (sudah diserahkan & lunas)
  const history: [string, string[], { sku: string; qty: number }[], number, "cash" | "split" | "receivable"][] = [
    ["B 1234 ABC", ["JS-C001"], [{ sku: "OLI-TMO-1L", qty: 4 }, { sku: "FLT-OLI-AVZ", qty: 1 }], 12, "cash"],
    ["B 3456 XYZ", ["JS-M001", "JS-M003"], [{ sku: "OLI-AHM-MPX2", qty: 1 }, { sku: "OLI-YML-GEAR", qty: 1 }], 10, "split"],
    ["B 9001 LCI", ["JS-C004"], [{ sku: "REM-KMP-AVZ-D", qty: 1 }, { sku: "REM-MNY-DOT3", qty: 1 }], 8, "receivable"],
    ["B 6789 RKA", ["JS-M002"], [{ sku: "OLI-AHM-MPX2", qty: 1 }], 6, "cash"],
    ["B 9002 LCI", ["JS-C002", "JS-C005"], [{ sku: "OLI-SHL-HX7-4L", qty: 1 }], 4, "split"],
    ["B 2468 MJB", ["JS-C003"], [{ sku: "PGP-BUSI-K16", qty: 4 }, { sku: "MAT-CARB-CLN", qty: 1 }], 2, "cash"],
  ];
  for (const [plate, svc, prt, days, pay] of history) {
    const r = await runWorkshopFlow({ ...a, mechanic: days % 4 === 0 ? mech2 : a.mechanic }, {
      vehicleId: v[plate],
      complaint: "Servis rutin",
      serviceCodes: svc,
      parts: prt,
      stopAt: pay === "receivable" ? "paid" : "handover",
      payment: pay,
    });
    if (pay === "receivable") await handoverVehicle(a.manager, r.wo!.id, { receivedBy: "Driver PT Logistik", notes: "Tempo 30 hari" });
    await backdate(r.wo!.id, days);
  }

  // Transaksi berjalan hari ini
  await runWorkshopFlow(a, { vehicleId: v["B 1234 ABC"], complaint: "Rem berdecit saat pengereman", serviceCodes: ["JS-C004"], parts: [{ sku: "REM-KMP-AVZ-D", qty: 1 }], stopAt: "in_progress" });
  await runWorkshopFlow({ ...a, mechanic: mech2 }, { vehicleId: v["B 3456 XYZ"], complaint: "CVT bergetar", serviceCodes: ["JS-M003"], parts: [{ sku: "TRS-VBELT-BEAT", qty: 1 }], stopAt: "qc" });
  await runWorkshopFlow(a, { vehicleId: v["B 6789 RKA"], complaint: "Ganti oli", serviceCodes: ["JS-M002"], parts: [{ sku: "OLI-AHM-MPX2", qty: 1 }], stopAt: "invoiced" });
  await runWorkshopFlow(a, { vehicleId: v["B 2468 MJB"], complaint: "AC kurang dingin", serviceCodes: ["JS-C006", "JS-A001"], stopAt: "estimate_sent" });

  // Booking hari ini & besok
  const vehicleRows = await db.select().from(vehicles).where(inArray(vehicles.id, [v["B 9001 LCI"], v["B 9002 LCI"]]));
  const b1 = await createBooking(a.sa, { customerId: vehicleRows[0].customerId, vehicleId: vehicleRows[0].id, bookingDate: todayISO(), bookingTime: "14:00", complaint: "Servis berkala armada", source: "whatsapp" });
  await confirmBooking(a.sa, b1.id);
  await createBooking(a.sa, { customerId: vehicleRows[1].customerId, vehicleId: vehicleRows[1].id, bookingDate: addDaysISO(todayISO(), 1), bookingTime: "09:00", complaint: "Ganti oli & spooring", source: "phone" });

  // Penjualan part langsung (counter)
  const oil = await db.query.parts.findFirst({ where: eq(parts.sku, "OLI-AHM-MPX2") });
  const counter = await createCounterSale(a.cashier, { items: [{ partId: oil!.id, qty: 2, discount: 0 }], notes: "Penjualan counter" });
  const cash = await db.query.paymentMethods.findFirst({ where: and(eq(paymentMethods.companyId, ids.companyId), eq(paymentMethods.code, "CASH")) });
  await receivePayment(a.cashier, counter.id, { idempotencyKey: crypto.randomUUID(), lines: [{ paymentMethodId: cash!.id, amount: counter.grandTotal, tenderedAmount: 150000 }] });

  // Cabang Bandung
  const saBdg = await ctx("sa.bdg", ids.bdg);
  const bdgVehicle = await db.query.vehicles.findFirst({ where: eq(vehicles.id, v["D 4567 BDG"]) });
  await createCheckin(saBdg, { customerId: bdgVehicle!.customerId, vehicleId: bdgVehicle!.id, odometer: bdgVehicle!.lastOdometer + 2300, fuelLevel: 75, complaint: "Mesin brebet saat pagi hari" });
}
