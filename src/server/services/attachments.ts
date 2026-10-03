import { and, eq } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { attachments } from "@/server/db/schema";
import type { AuthContext } from "@/server/auth/context";
import { NotFoundError } from "@/server/errors";
import { loadFile, saveFile, type UploadFile } from "@/server/storage";

export async function addAttachments(tx: DbOrTx, ctx: AuthContext, entity: string, entityId: string, files: UploadFile[], caption?: string | null) {
  const out: { id: string }[] = [];
  for (const f of files) {
    if (!f.data.length) continue;
    const storagePath = await saveFile(ctx.companyId, f);
    const [row] = await tx
      .insert(attachments)
      .values({
        companyId: ctx.companyId,
        entity,
        entityId,
        fileName: f.fileName,
        mimeType: f.mimeType,
        size: f.data.length,
        storagePath,
        caption: caption ?? null,
        createdBy: ctx.userId,
      })
      .returning({ id: attachments.id });
    out.push(row);
  }
  return out;
}

export async function listAttachments(ctx: AuthContext, entity: string, entityId: string) {
  return db.query.attachments.findMany({
    where: and(eq(attachments.companyId, ctx.companyId), eq(attachments.entity, entity), eq(attachments.entityId, entityId)),
  });
}

export async function readAttachment(ctx: AuthContext, id: string) {
  const a = await db.query.attachments.findFirst({ where: and(eq(attachments.id, id), eq(attachments.companyId, ctx.companyId)) });
  if (!a) throw new NotFoundError("File");
  return { meta: a, data: await loadFile(a.storagePath) };
}
