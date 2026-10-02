import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { branches, estimateItems, parts, paymentMethods, services, users } from "@/server/db/schema";
import { buildContext, type AuthContext } from "@/server/auth/context";
import { createCustomer } from "@/server/services/customers";
import { createVehicle } from "@/server/services/vehicles";
import type { FlowActors } from "@/server/seed/demo";

export async function userId(username: string) {
  const u = await db.query.users.findFirst({ where: eq(users.username, username) });
  if (!u) throw new Error(`user ${username} not found`);
  return u.id;
}

export async function branchId(code: string) {
  const b = await db.query.branches.findFirst({ where: eq(branches.code, code) });
  return b!.id;
}

export async function as(username: string, branch = "JKT"): Promise<AuthContext> {
  return buildContext(await userId(username), { activeBranchId: await branchId(branch) });
}

export async function actors(): Promise<FlowActors> {
  return {
    sa: await as("sa.jkt"),
    supervisor: await as("supervisor.jkt"),
    mechanic: await as("mekanik1.jkt"),
    parts: await as("parts.jkt"),
    qc: await as("qc.jkt"),
    cashier: await as("kasir.jkt"),
    manager: await as("manager.jkt"),
  };
}

let seq = 0;
export async function newVehicle(sa: AuthContext, type: "car" | "motorcycle" = "car", odometer = 10000) {
  seq++;
  const c = await createCustomer(sa, { name: `Test Customer ${Date.now()}-${seq}`, phone: `0812${String(Date.now()).slice(-6)}${seq}`, customerType: "retail" });
  const plate = `B ${1000 + Math.floor(Math.random() * 8999)} T${String.fromCharCode(65 + (seq % 26))}${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
  const v = await createVehicle(sa, { customerId: c.id, plateNumber: plate, vehicleType: type, lastOdometer: odometer });
  return { customer: c, vehicle: v };
}

export async function serviceByCode(code: string) {
  return (await db.query.services.findFirst({ where: eq(services.serviceCode, code) }))!;
}

export async function partBySku(sku: string) {
  return (await db.query.parts.findFirst({ where: eq(parts.sku, sku) }))!;
}

export async function method(code: string) {
  return (await db.query.paymentMethods.findFirst({ where: eq(paymentMethods.code, code) }))!;
}

export async function estimateItemIds(estimateId: string) {
  return db.select().from(estimateItems).where(and(eq(estimateItems.estimateId, estimateId)));
}
