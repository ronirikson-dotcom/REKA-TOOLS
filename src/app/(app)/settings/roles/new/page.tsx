import { pageContext } from "@/server/page";
import { listPermissionCatalog } from "@/server/services/settings";
import { RoleForm } from "@/components/client/settings-forms";
import { saveRoleAction } from "@/server/actions/admin";
import { PERMISSION_MODULE_LABELS } from "@/lib/permissions";
import { PageHeader } from "@/components/ui";

export default async function NewRolePage() {
  await pageContext("settings.role");
  const catalog = await listPermissionCatalog();
  return (
    <>
      <PageHeader title="Role baru" back={{ href: "/settings/roles", label: "Role" }} />
      <RoleForm action={saveRoleAction} catalog={catalog} moduleLabels={PERMISSION_MODULE_LABELS} />
    </>
  );
}
