import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Car Fleet Tracker — Real-time Simulation",
  description:
    "Track N cars on an interactive map with varying speeds, record positions to GeoJSON, and flush to PostgreSQL.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="bg-gray-100 text-gray-900 antialiased overflow-hidden">
        {children}
      </body>
    </html>
  );
}
