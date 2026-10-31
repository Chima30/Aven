import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AVEN",
    short_name: "AVEN",
    description: "Personal finance, wellbeing and planning in one calm place.",
    start_url: "/overview",
    scope: "/",
    display: "standalone",
    background_color: "#f6f4ef",
    theme_color: "#14243d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
