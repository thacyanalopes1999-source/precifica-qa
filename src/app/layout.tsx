
import type { Metadata } from "next";
import type { ReactNode } from "react";
import AppShell from "@/components/layout/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Precifica QA | Validação de Produtos",
  description:
    "Plataforma inteligente de comparação, conciliação e validação de produtos.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
