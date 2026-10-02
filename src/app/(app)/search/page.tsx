import Link from "next/link";
import { pageContext, params, type SP } from "@/server/page";
import { globalSearch } from "@/server/services/search";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Pencarian" };

/** Global search: customer, HP, nomor polisi, rangka, WO, invoice, SKU, barcode (SRS 4.8) */
export default async function SearchPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext();
  const p = await params(searchParams);
  const hits = await globalSearch(ctx, p.q);
  const types = [...new Set(hits.map((h) => h.type))];
  return (
    <div className="max-w-4xl">
      <PageHeader title="Pencarian" subtitle={p.q ? `Hasil untuk "${p.q}" — ${hits.length} ditemukan` : "Ketik minimal 2 karakter di kotak pencarian atas"} />
      {p.q && hits.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">Tidak ada hasil. Coba nomor polisi tanpa spasi, nomor HP, no. WO / invoice, SKU atau barcode.</p>
        </Card>
      )}
      <div className="space-y-4">
        {types.map((t) => (
          <Card key={t} title={t} bodyClassName="p-0">
            <ul className="divide-y divide-slate-100">
              {hits
                .filter((h) => h.type === t)
                .map((h) => (
                  <li key={h.id}>
                    <Link href={h.href} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50">
                      <span>
                        <span className="font-medium text-brand-700">{h.title}</span>
                        <span className="block text-xs text-slate-500">{h.subtitle}</span>
                      </span>
                      <Badge>{h.type}</Badge>
                    </Link>
                  </li>
                ))}
            </ul>
          </Card>
        ))}
      </div>
    </div>
  );
}
