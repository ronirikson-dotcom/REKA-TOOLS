import { sql } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { branches, companies, documentSequences } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { jakartaParts } from "@/lib/utils";

export const DOC_TYPES = {
  BKG: "Booking",
  CHK: "Check-In",
  EST: "Estimate",
  WO: "Work Order",
  PR: "Part Request",
  INV: "Invoice",
  PAY: "Payment",
  RCV: "Goods Receipt",
  PO: "Purchase Order",
  ADJ: "Stock Adjustment",
  TRF: "Stock Transfer",
  CUS: "Customer",
} as const;
export type DocType = keyof typeof DOC_TYPES;

export const DEFAULT_NUMBERING: Record<DocType, string> = {
  BKG: "BKG",
  CHK: "CHK",
  EST: "EST",
  WO: "WO",
  PR: "PR",
  INV: "INV",
  PAY: "PAY",
  RCV: "RCV",
  PO: "PO",
  ADJ: "ADJ",
  TRF: "TRF",
  CUS: "CUS",
};

async function increment(tx: DbOrTx, companyId: string, scope: string, docType: string, period: string): Promise<number> {
  const [row] = await tx
    .insert(documentSequences)
    .values({ companyId, scope, docType, period, lastValue: 1 })
    .onConflictDoUpdate({
      target: [documentSequences.companyId, documentSequences.scope, documentSequences.docType, documentSequences.period],
      set: { lastValue: sql`${documentSequences.lastValue} + 1` },
    })
    .returning({ value: documentSequences.lastValue });
  return row.value;
}

/**
 * Nomor transaksi unik per company/cabang (BR-014, SRS 4.8).
 * Format default: {PREFIX}-{KODE CABANG}-{YYMMDD}-{SEQ}, contoh WO-JKT-261002-001.
 */
export async function nextDocNumber(tx: DbOrTx, companyId: string, branchId: string, docType: DocType, date = new Date()) {
  const company = await tx.query.companies.findFirst({ where: eq(companies.id, companyId) });
  const branch = await tx.query.branches.findFirst({ where: eq(branches.id, branchId) });
  const prefix = company?.settings?.numbering?.[docType] || DEFAULT_NUMBERING[docType];
  const padding = company?.settings?.sequencePadding || 3;
  const p = jakartaParts(date);
  const period = `${p.year.slice(2)}${p.month}${p.day}`;
  const seq = await increment(tx, companyId, branchId, docType, period);
  return `${prefix}-${branch?.code ?? "XX"}-${period}-${String(seq).padStart(padding, "0")}`;
}

/** Nomor master level perusahaan, contoh CUS-000001 */
export async function nextMasterCode(tx: DbOrTx, companyId: string, docType: DocType, padding = 6) {
  const company = await tx.query.companies.findFirst({ where: eq(companies.id, companyId) });
  const prefix = company?.settings?.numbering?.[docType] || DEFAULT_NUMBERING[docType];
  const seq = await increment(tx, companyId, "company", docType, "all");
  return `${prefix}-${String(seq).padStart(padding, "0")}`;
}
