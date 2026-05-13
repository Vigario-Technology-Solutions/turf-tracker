import type { Metadata, Viewport } from "next";
import { getBrand } from "@/lib/brand";
import { SerwistProvider } from "./serwist";
import { ServiceWorkerUpdater } from "./sw-updater";
import "./globals.css";

// title.template wraps every page's `metadata.title` as
// "<page> — <appName>", so per-page metadata only needs the page-
// specific part. `default` is the fallback when a child sets nothing.
// manifest path matches Next's MetadataRoute.Manifest convention —
// src/app/manifest.ts serves /manifest.webmanifest.
export async function generateMetadata(): Promise<Metadata> {
  const brand = await getBrand();
  return {
    applicationName: brand.appName,
    title: {
      default: brand.appName,
      template: `%s — ${brand.appName}`,
    },
    description: "Field decision tool for area-based plant nutrition",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: "/branding/icon.svg",
      apple: "/branding/icon.svg",
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: brand.appShortName,
    },
  };
}

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
