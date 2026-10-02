import { pageContext, params, type SP } from "@/server/page";
import { listUsers } from "@/server/services/settings";
import { InlineAction } from "@/components/client/action-form";
import { unlockUserAction } from "@/server/actions/admin";
import { Badge, ButtonLink, EmptyRow, FilterBar, PageHeader, RowLink, StatusBadge, Table, TBody, Td, Th, THead } from "@/components/ui";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "User" };

export default async function UsersPage({ searchParams }: { searchParams: SP }) {
  const ctx = await pageContext("settings.user");
  const p = await params(searchParams);
  const users = await listUsers(ctx, { q: p.q });
  return (
    <>
      <PageHeader title="User" subtitle="Akun pengguna, role dan scope cabang" actions={<ButtonLink href="/settings/users/new" variant="primary">+ User baru</ButtonLink>} />
      <FilterBar action="/settings/users" q={p.q} placeholder="Nama / username / email" />
      <Table>
        <THead>
          <tr>
            <Th>Nama</Th>
            <Th>Username</Th>
            <Th>Role</Th>
            <Th>Cabang</Th>
            <Th>Login terakhir</Th>
            <Th>Status</Th>
          </tr>
        </THead>
        <TBody>
          {users.length === 0 && <EmptyRow colSpan={6} />}
          {users.map((u) => (
            <tr key={u.id}>
              <Td>
                <RowLink href={`/settings/users/${u.id}`}>{u.name}</RowLink>
                <div className="text-xs text-slate-500">{u.email}</div>
              </Td>
              <Td className="font-mono text-xs">{u.username}</Td>
              <Td>{u.roleName}</Td>
              <Td>{u.allBranches ? <Badge tone="indigo">Semua cabang</Badge> : (u.branchName ?? "-")}</Td>
              <Td>{formatDateTime(u.lastLoginAt)}</Td>
              <Td>
                <StatusBadge domain="active" status={u.status} />
                {u.lockedUntil && new Date(u.lockedUntil) > new Date() && (
                  <div className="mt-1 flex items-center gap-1">
                    <Badge tone="red">Terkunci</Badge>
                    <InlineAction action={unlockUserAction} fields={{ id: u.id }}>
                      Buka
                    </InlineAction>
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </TBody>
      </Table>
    </>
  );
}
