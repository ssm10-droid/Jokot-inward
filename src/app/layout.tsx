import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jokot Inward",
  description: "Purchase bill inward tracking — Jokot International",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
