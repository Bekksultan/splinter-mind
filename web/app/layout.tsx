import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Splinter Mind — Operations Console",
  description:
    "AI-powered operations and incident management for multi-location currency exchange businesses.",
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
