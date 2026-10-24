"use client";

import { useEffect } from "react";

// iOS opens a home-screen bookmark on the page it was saved from, not the
// manifest's start_url, so a bookmark of the homepage goes on to /start too.
// An effect, not an inline script: React never runs a <script> it renders
// itself, as it does when you come back to this page within the app.
export function OpenedAsApp() {
  useEffect(() => {
    const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone;
    if (standalone) location.replace("/start");
  }, []);
  return null;
}
