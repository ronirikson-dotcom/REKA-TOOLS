"use server";

import { redirect } from "next/navigation";
import { clearSessionCookie, getContext, requestMeta, setActiveBranch, setSessionCookie } from "@/server/auth/session";
import { changePassword, login, logout, requestPasswordReset, resetPassword } from "@/server/services/auth";
import { toUserMessage } from "@/server/errors";
import { act, str, type ActionState } from "./_helpers";
import { revalidatePath } from "next/cache";

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const meta = await requestMeta();
    const res = await login(str(fd, "identifier"), str(fd, "password"), meta);
    await setSessionCookie(res.token, res.expiresAt);
  } catch (err) {
    return { ok: false, error: toUserMessage(err) };
  }
  const next = str(fd, "next");
  redirect(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logoutAction() {
  const ctx = await getContext();
  if (ctx) await logout(ctx);
  await clearSessionCookie();
  redirect("/login");
}

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  try {
    const res = await requestPasswordReset(str(fd, "identifier"));
    if (res) {
      const url = `${process.env.APP_URL ?? "http://localhost:3000"}/reset-password/${res.token}`;
      // Integrasi email (SMTP/provider) dapat ditambahkan di sini. Sementara link dicatat di log server.
      console.info(`[password-reset] ${res.email}: ${url}`);
      if (process.env.NODE_ENV !== "production") {
        return { ok: true, message: `Link reset password (mode development): ${url}` };
      }
    }
  } catch (err) {
    return { ok: false, error: toUserMessage(err) };
  }
  return { ok: true, message: "Jika akun terdaftar, link reset password telah dikirim ke email Anda." };
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, "password") !== str(fd, "confirm")) return { ok: false, error: "Konfirmasi password tidak sama" };
  try {
    await resetPassword(str(fd, "token"), str(fd, "password"));
  } catch (err) {
    return { ok: false, error: toUserMessage(err) };
  }
  redirect("/login?reset=1");
}

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  if (str(fd, "password") !== str(fd, "confirm")) return { ok: false, error: "Konfirmasi password tidak sama" };
  return act((ctx) => changePassword(ctx, str(fd, "current"), str(fd, "password")), { success: "Password berhasil diubah" });
}

export async function switchBranchAction(fd: FormData) {
  const ctx = await getContext();
  if (!ctx?.sessionId) redirect("/login");
  const branchId = str(fd, "branchId");
  if (ctx.allBranches) await setActiveBranch(ctx.sessionId, branchId && ctx.branchIds.includes(branchId) ? branchId : null);
  revalidatePath("/", "layout");
}
