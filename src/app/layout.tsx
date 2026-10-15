import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Font library | wayoffmars",
  description: "A personal home for the type you collect.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
