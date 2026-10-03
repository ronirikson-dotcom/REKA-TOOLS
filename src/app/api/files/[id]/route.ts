import { api } from "@/server/api";
import { readAttachment } from "@/server/services/attachments";

export const GET = api<{ id: string }>(async (_req, ctx, { id }) => {
  const { meta, data } = await readAttachment(ctx, id);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": meta.mimeType,
      "Content-Disposition": `inline; filename="${encodeURIComponent(meta.fileName)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
});
