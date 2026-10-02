"use client";

import { Alert, Button } from "@/components/ui";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-10 max-w-lg space-y-4">
      <Alert tone="red" title="Terjadi kesalahan">
        {process.env.NODE_ENV === "development" ? error.message : "Silakan coba lagi. Bila berulang, hubungi administrator."}
        {error.digest && <div className="mt-1 text-xs opacity-70">Ref: {error.digest}</div>}
      </Alert>
      <Button onClick={reset}>Coba lagi</Button>
    </div>
  );
}
