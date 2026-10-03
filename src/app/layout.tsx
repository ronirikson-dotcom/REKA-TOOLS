import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/client/sw-register";

export const metadata: Metadata = {
  title: { default: "Workshop Management System", template: "%s · WMS Bengkel" },
  description: "Sistem operasional bengkel mobil & motor end-to-end",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon.svg", apple: "/icons/icon-192.png" },
  appleWebApp: { capable: true, title: "WMS Bengkel", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#1f70ab",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen font-sans antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
