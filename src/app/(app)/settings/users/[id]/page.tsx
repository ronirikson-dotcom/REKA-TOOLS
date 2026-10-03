import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { pageContext } from "@/server/page";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { listBranches, listRoles } from "@/server/services/settings";
import { UserForm } from "@/components/forms/user-form";
import { PageHeader } from "@/components/ui";

export default async function EditUserPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("settings.user");
  const { id } = await params;
  const [user, roles, branches] = await Promise.all([
    db.query.users.findFirst({ where: and(eq(users.id, id), eq(users.companyId, ctx.companyId)), columns: { passwordHash: false } }),
    listRoles(ctx),
    listBranches(ctx),
  ]);
  if (!user) notFound();
  return (
    <div className="max-w-3xl">
      <PageHeader title={`Ubah ${user.name}`} back={{ href: "/settings/users", label: "User" }} />
      <UserForm user={user} roles={roles} branches={branches} />
    </div>
  );
}
