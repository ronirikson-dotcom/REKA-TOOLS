import { notFound } from "next/navigation";
import { pageContext } from "@/server/page";
import { listPermissionCatalog, listRoles } from "@/server/services/settings";
import { RoleForm } from "@/components/client/settings-forms";
import { saveRoleAction } from "@/server/actions/admin";
import { PERMISSION_MODULE_LABELS } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";

export default async function EditRolePage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await pageContext("settings.role");
  const { id } = await params;
  const [roles, catalog] = await Promise.all([listRoles(ctx), listPermissionCatalog()]);
  const role = roles.find((r) => r.id === id);
  if (!role) notFound();
  return (
    <>
      <PageHeader title={`Role: ${role.name}`} subtitle={`${role.userCount} user memakai role ini — perubahan berlaku pada sesi berikutnya`} back={{ href: "/settings/roles", label: "Role" }} />
      <RoleForm action={saveRoleAction} role={role} catalog={catalog} moduleLabels={PERMISSION_MODULE_LABELS} />
    </>
  );
}
