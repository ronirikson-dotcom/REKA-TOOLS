"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui";

export function PrintButton({ label = "Cetak / PDF" }: { label?: string }) {
  return (
    <button type="button" className={buttonClass("secondary")} onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      {label}
    </button>
  );
}
