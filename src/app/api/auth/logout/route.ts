import { api } from "@/server/api";
import { logout } from "@/server/services/auth";

export const POST = api(async (_req, ctx) => {
  await logout(ctx);
  return { ok: true };
});
