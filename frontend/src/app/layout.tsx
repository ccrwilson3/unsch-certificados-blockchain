import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Certificados Blockchain - INDI UNSCH",
  description: "Sistema de emisión y verificación de certificados basado en Blockchain",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}