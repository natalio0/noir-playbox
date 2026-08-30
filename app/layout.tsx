import type { Metadata } from "next";

import "./globals.css";

import { AuthProvider } from "@/components/providers/AuthProvider";
import RoleGuard from "@/components/auth/RoleGuard";

export const metadata: Metadata = {
  title: "Noir Playbox",
  description: "Noir Playbox Management Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <RoleGuard>{children}</RoleGuard>
        </AuthProvider>
      </body>
    </html>
  );
}
