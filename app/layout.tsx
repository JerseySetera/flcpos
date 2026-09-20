import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simple POS",
  description: "Simple point-of-sale system powered by Supabase"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
