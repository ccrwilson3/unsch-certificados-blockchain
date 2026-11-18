"use client";

import AppShell, { type ItemNav } from "../../components/ui/AppShell";
import { Inbox, BookOpen, ClipboardList, BarChart3 } from "lucide-react";

const items: ItemNav[] = [
  { href: "/indi/aprobar-solicitudes", texto: "Bandeja de Solicitudes", Icono: Inbox },
  { href: "/indi/cursos", texto: "Gestión de Cursos", Icono: BookOpen },
  { href: "/indi/matriculas", texto: "Gestión de Matrículas", Icono: ClipboardList },
  { href: "/indi/reportes", texto: "Reportes", Icono: BarChart3 },
];

export default function IndiLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell items={items} titulo="Instituto de Idiomas" subtitulo="Gestión académica y certificados" color="amber">
      {children}
    </AppShell>
  );
}
