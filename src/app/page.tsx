import { redirect } from "next/navigation";
import { getContext } from "@/server/auth/session";

export default async function Home() {
  const ctx = await getContext();
  if (!ctx) redirect("/login");
  redirect(ctx.permissions.has("dashboard.view") ? "/dashboard" : ctx.permissions.has("job.execute") ? "/mechanic" : "/account");
}
