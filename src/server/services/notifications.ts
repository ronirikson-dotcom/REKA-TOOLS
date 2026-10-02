import { and, desc, eq, inArray, isNull, or, sql, notExists } from "drizzle-orm";
import type { DbOrTx } from "@/server/db";
import { db } from "@/server/db";
import { notificationReads, notifications } from "@/server/db/schema";
import type { AuthContext } from "@/server/auth/context";
import type { Permission } from "@/lib/permissions";

/** Notifikasi in-app (SRS 4.11): Waiting QC, Waiting Parts, approval pending, low stock */
export async function notify(
  tx: DbOrTx,
  input: {
    companyId: string;
    branchId?: string | null;
    permission?: Permission;
    userId?: string | null;
    type: string;
    title: string;
    message: string;
    link?: string;
  },
) {
  await tx.insert(notifications).values({
    companyId: input.companyId,
    branchId: input.branchId ?? null,
    permission: input.permission ?? null,
    userId: input.userId ?? null,
    type: input.type,
    title: input.title,
    message: input.message,
    link: input.link ?? null,
  });
}

function visibleTo(ctx: AuthContext) {
  const perms = [...ctx.permissions];
  return and(
    eq(notifications.companyId, ctx.companyId),
    or(isNull(notifications.branchId), inArray(notifications.branchId, ctx.branchIds.length ? ctx.branchIds : ["00000000-0000-0000-0000-000000000000"])),
    or(
      eq(notifications.userId, ctx.userId),
      and(isNull(notifications.userId), perms.length ? inArray(notifications.permission, perms) : sql`false`),
    ),
  );
}

export async function listNotifications(ctx: AuthContext, limit = 20) {
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      title: notifications.title,
      message: notifications.message,
      link: notifications.link,
      createdAt: notifications.createdAt,
      readAt: notificationReads.readAt,
    })
    .from(notifications)
    .leftJoin(notificationReads, and(eq(notificationReads.notificationId, notifications.id), eq(notificationReads.userId, ctx.userId)))
    .where(visibleTo(ctx))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows;
}

export async function countUnread(ctx: AuthContext) {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        visibleTo(ctx),
        notExists(
          db
            .select({ x: sql`1` })
            .from(notificationReads)
            .where(and(eq(notificationReads.notificationId, notifications.id), eq(notificationReads.userId, ctx.userId))),
        ),
      ),
    );
  return row?.count ?? 0;
}

export async function markAllRead(ctx: AuthContext) {
  const rows = await listNotifications(ctx, 200);
  const unread = rows.filter((r) => !r.readAt).map((r) => ({ notificationId: r.id, userId: ctx.userId }));
  if (unread.length) await db.insert(notificationReads).values(unread).onConflictDoNothing();
}
