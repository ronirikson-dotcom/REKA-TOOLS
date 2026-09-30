import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OKABE CORE", template: "%s · OKABE CORE" },
  description: "OKABE CORE — Core Accounting Engine",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
