import type { MetadataRoute } from "next";
import { PROJECT_NAME } from "@/lib/brand";

// Lets the app be added to a home screen. It opens on /start, which takes you
// to your gathering rather than the homepage.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PROJECT_NAME,
    short_name: PROJECT_NAME,
    description: "Culture is grown in conversation.",
    start_url: "/start",
    scope: "/",
    display: "standalone",
    background_color: "#E8DBC4",
    theme_color: "#E8DBC4",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
