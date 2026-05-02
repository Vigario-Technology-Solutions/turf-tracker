import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turf Tracker",
  description: "Field decision tool for area-based plant nutrition",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
