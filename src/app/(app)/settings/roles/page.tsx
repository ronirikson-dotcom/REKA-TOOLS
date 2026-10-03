import { pageContext } from "@/server/page";
import { listRoles } from "@/server/services/settings";
import { Badge, ButtonLink, PageHeader, RowLink, Table, TBody, Td, Th, THead } from "@/components/ui";

export const metadata = { title: "Role & Permission" };

export default async function RolesPage() {
  const ctx = await pageContext("settings.role");
  const roles = await listRoles(ctx);
  return (
    <>
      <PageHeader title="Role & Permission" subtitle="RBAC dengan granularitas per module/action (SRS 4.3)" actions={<ButtonLink href="/settings/roles/new" variant="primary">+ Role baru</ButtonLink>} />
      <Table>
        <THead>
          <tr>
            <Th>Role</Th>
            <Th>Tanggung jawab</Th>
            <Th right>Permission</Th>
            <Th right>User</Th>
          </tr>
        </THead>
        <TBody>
          {roles.map((r) => (
            <tr key={r.id}>
              <Td>
                <RowLink href={`/settings/roles/${r.id}`}>{r.name}</RowLink> {r.isSystem && <Badge>Default</Badge>}
              </Td>
              <Td className="max-w-lg text-slate-600">{r.description}</Td>
              <Td right>{r.permissionCodes.length}</Td>
              <Td right>{r.userCount}</Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
