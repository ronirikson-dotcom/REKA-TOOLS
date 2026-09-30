import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  // Diteruskan ke Supabase agar audit trail mencatat IP pengguna, bukan IP server.
  const clientIp = headerStore.get("x-forwarded-for") ?? headerStore.get("x-real-ip");

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: clientIp ? { headers: { "x-forwarded-for": clientIp } } : undefined,
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Dipanggil dari Server Component; sesi di-refresh oleh proxy.
          }
        },
      },
    },
  );
}
