import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "WhatsApp AI Agent",
  description: "Simple WhatsApp AI agent dashboard"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
