import type { DbOrTx } from "@/server/db";
import { auditLogs } from "@/server/db/schema";
import type { AuthContext } from "@/server/auth/context";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "APPROVE"
  | "REJECT"
  | "ISSUE"
  | "RETURN"
  | "RECEIVE"
  | "ADJUST"
  | "TRANSFER"
  | "VOID"
  | "CANCEL"
  | "REFUND"
  | "OVERRIDE"
  | "STATUS"
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOGOUT"
  | "PASSWORD_RESET";

export type AuditEntry = {
  action: AuditAction;
  entity: string;
  entityId?: string | null;
  referenceNumber?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  reason?: string | null;
  branchId?: string | null;
};

/** Audit trail aktivitas kritikal (SRS 4.4) */
export async function writeAudit(tx: DbOrTx, ctx: AuthContext | null, entry: AuditEntry & { companyId?: string; userId?: string | null }) {
  await tx.insert(auditLogs).values({
    companyId: entry.companyId ?? ctx?.companyId ?? null,
    branchId: entry.branchId ?? ctx?.activeBranchId ?? null,
    userId: entry.userId ?? ctx?.userId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    referenceNumber: entry.referenceNumber ?? null,
    oldValue: (entry.oldValue ?? null) as object | null,
    newValue: (entry.newValue ?? null) as object | null,
    reason: entry.reason ?? null,
    ip: ctx?.ip ?? null,
    userAgent: ctx?.userAgent ?? null,
  });
}
