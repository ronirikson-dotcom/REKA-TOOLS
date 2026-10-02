import { pageContext } from "@/server/page";
import { listBranches, listRoles } from "@/server/services/settings";
import { UserForm } from "@/components/forms/user-form";
import { PageHeader } from "@/components/ui";

export default async function NewUserPage() {
  const ctx = await pageContext("settings.user");
  const [roles, branches] = await Promise.all([listRoles(ctx), listBranches(ctx)]);
  return (
    <div className="max-w-3xl">
      <PageHeader title="User baru" back={{ href: "/settings/users", label: "User" }} />
      <UserForm roles={roles} branches={branches} />
    </div>
  );
}
