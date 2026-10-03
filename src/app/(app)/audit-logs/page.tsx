import { pageContext, params, type SP } from "@/server/page";
import { listAuditLogs, userOptions } from "@/server/services/settings";
import { Badge, EmptyRow, FilterBar, Input, PageHeader, Pagination, Select, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatDateTime } from "@/lib/format";
import type { Tone } from "@/lib/status";

export const metadata = { title: "Audit Log" };

const ACTIONS = ["CREATE", "UPDATE", "DELETE", "APPROVE", "REJECT", "ISSUE", "RETURN", "RECEIVE", "ADJUST", "TRANSFER", "VOID", "CANCEL", "REFUND", "OVERRIDE", "STATUS", "LOGIN", "LOGIN_FAILED", "LOGOUT", "PASSWORD_RESET"];
const TONE: Record<string, Tone> = { VOID: "red", CANCEL: "red", REFUND: "purple", OVERRIDE: "orange", LOGIN_FAILED: "red", APPROVE: "green", DELETE: "red", ISSUE: "indigo" };

function summarize(v: unknown): string {
  if (!v || typeof v !== "object") return "";
  const s = JSON.stringify(v);
  return s.length > 180 ? s.slice(0, 180) + "…" : s;
}

/** Audit trail: actor, timestamp, action, entity, reference, old/new value, IP, reason (SRS 4.4, AC-008) */
export default async function AuditLogsPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("audit.view");
  const p = await params(searchParams);
  const [res, users] = await Promise.all([
    listAuditLogs(ctx, { q: p.q, page: p.page, action: p.get("action"), userId: p.get("userId"), from: p.get("from"), to: p.get("to") }),
    userOptions(ctx),
  ]);
  return (
    <>
      <PageHeader title="Audit Log" subtitle="Aktivitas kritikal dapat ditelusuri ke user dan timestamp" />
      <FilterBar action="/audit-logs" q={p.q} placeholder="No. referensi / entity / alasan">
        <Select name="action" defaultValue={p.get("action") ?? ""} className="sm:w-40">
          <option value="">Semua aksi</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </Select>
        <Select name="userId" defaultValue={p.get("userId") ?? ""} className="sm:w-48">
          <option value="">Semua user</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
        <Input type="date" name="from" defaultValue={p.get("from") ?? ""} className="sm:w-40" />
        <Input type="date" name="to" defaultValue={p.get("to") ?? ""} className="sm:w-40" />
      </FilterBar>
      <Table>
        <THead>
          <tr>
            <Th>Waktu</Th>
            <Th>User</Th>
            <Th>Aksi</Th>
            <Th>Entity</Th>
            <Th>Referensi</Th>
            <Th>Perubahan</Th>
            <Th>Alasan</Th>
            <Th>IP</Th>
          </tr>
        </THead>
        <TBody>
          {res.rows.length === 0 && <EmptyRow colSpan={8} />}
          {res.rows.map((r) => (
            <tr key={r.id} className="align-top">
              <Td className="whitespace-nowrap">{formatDateTime(r.createdAt)}</Td>
              <Td>
                {r.userName ?? "-"}
                {r.branchName && <div className="text-xs text-slate-500">{r.branchName}</div>}
              </Td>
              <Td>
                <Badge tone={TONE[r.action] ?? "gray"}>{r.action}</Badge>
              </Td>
              <Td className="text-xs">{r.entity}</Td>
              <Td className="font-mono text-xs">{r.referenceNumber ?? "-"}</Td>
              <Td className="max-w-md">
                {r.oldValue ? <div className="break-all text-xs text-red-700">− {summarize(r.oldValue)}</div> : null}
                {r.newValue ? <div className="break-all text-xs text-emerald-700">+ {summarize(r.newValue)}</div> : null}
              </Td>
              <Td className="text-xs">{r.reason ?? ""}</Td>
              <Td className="text-xs">{r.ip ?? ""}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
      <Pagination page={res.page} pageSize={res.pageSize} total={res.total} baseHref="/audit-logs" params={{ q: p.q, action: p.get("action"), userId: p.get("userId"), from: p.get("from"), to: p.get("to") }} />
    </>
  );
}
