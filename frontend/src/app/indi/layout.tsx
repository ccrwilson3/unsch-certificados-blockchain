"use client";

import AppShell, { type ItemNav } from "../../components/ui/AppShell";
import { Inbox, BookOpen, ClipboardList, BarChart3, FileSignature } from "lucide-react";

const items: ItemNav[] = [
  { href: "/indi/aprobar-solicitudes", modulo: "solicitudes", texto: "Bandeja de Solicitudes", Icono: Inbox },
  { href: "/indi/cursos", modulo: "cursos", texto: "Gestión de Cursos", Icono: BookOpen },
  { href: "/indi/matriculas", modulo: "matriculas", texto: "Gestión de Matrículas", Icono: ClipboardList },
  { href: "/indi/actas", modulo: "actas", texto: "Actas de Notas", Icono: FileSignature },
  { href: "/indi/reportes", modulo: "reportes", texto: "Reportes", Icono: BarChart3 },
];

export default function IndiLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell items={items} titulo="Instituto de Idiomas" subtitulo="Gestión académica y certificados" color="amber">
      {children}
    </AppShell>
  );
}
