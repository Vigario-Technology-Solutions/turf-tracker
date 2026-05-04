import type { Metadata, Viewport } from "next";
import { SerwistProvider } from "./serwist";
import { ServiceWorkerUpdater } from "./sw-updater";
import "./globals.css";

export const metadata: Metadata = {
  applicationName: "Turf Tracker",
  title: "Turf Tracker",
  description: "Field decision tool for area-based plant nutrition",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Turf Tracker",
  },
};

export const viewport: Viewport = {
  themeColor: "#171717",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SerwistProvider
          swUrl="/sw.js"
          // Dev disables the SW by default — it caches against HMR's
          // un-hashed asset URLs and the precache manifest is empty,
          // so leaving it on causes "edited a file but nothing
          // changes" until you clear caches. Set DEV_SW=1 in .env to
          // exercise SW behaviour against a dev server. Server-evaluated
          // here (this layout is an RSC); only the boolean ships to
          // the client, so no NEXT_PUBLIC_ prefix needed.
          disable={process.env.NODE_ENV === "development" && process.env.DEV_SW !== "1"}
        >
          <ServiceWorkerUpdater />
          {children}
        </SerwistProvider>
      </body>
    </html>
  );
}
