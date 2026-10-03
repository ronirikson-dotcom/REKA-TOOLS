import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Workshop Management System",
    short_name: "WMS Bengkel",
    description: "Sistem operasional bengkel mobil & motor",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f5f7fa",
    theme_color: "#1f70ab",
    orientation: "any",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
