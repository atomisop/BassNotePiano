import type { MetadataRoute } from "next";

// Makes the site installable: "Add to Home Screen" gives students an app icon
// that opens straight into their dashboard without browser bars.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Bass Note Piano",
    short_name: "Bass Note",
    description: "Live piano, guitar and bass lessons, and a curriculum that opens one scale at a time.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#222222",
    theme_color: "#222222",
    icons: [
      { src: "/icon.png", sizes: "256x256", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
