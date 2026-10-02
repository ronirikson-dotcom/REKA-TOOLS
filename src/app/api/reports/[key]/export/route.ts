import { api, query } from "@/server/api";
import { runReport, toCsv } from "@/server/services/reports";

/** Export laporan ke CSV (dapat dibuka di Excel) — URS-REP-003 */
export const GET = api<{ key: string }>(async (req, ctx, { key }) => {
  const q = query(req);
  const { meta, rows } = await runReport(ctx, key, { from: q.get("from") ?? "", to: q.get("to") ?? "", branchId: q.get("branchId"), q: q.q });
  const csv = toCsv(meta.columns, rows);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${key}_${q.get("from") ?? ""}_${q.get("to") ?? ""}.csv"`,
    },
  });
});
