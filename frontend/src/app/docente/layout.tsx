"use client";

import AppShell, { type ItemNav } from "../../components/ui/AppShell";
import { BookOpen, CalendarCheck, ClipboardList, FolderOpen } from "lucide-react";

const items: ItemNav[] = [
  { href: "/docente/cursos", modulo: "docente_cursos", texto: "Mis Cursos y Evaluaciones", Icono: BookOpen },
  { href: "/docente/notas", modulo: "docente_notas", texto: "Registro de Notas", Icono: ClipboardList },
  { href: "/docente/asistencia", modulo: "docente_asistencia", texto: "Asistencia", Icono: CalendarCheck },
  { href: "/docente/materiales", modulo: "docente_materiales", texto: "Materiales para estudiantes", Icono: FolderOpen },
];

export default function DocenteLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell items={items} titulo="Portal Docente" subtitulo="Certificados Blockchain" color="emerald">
      {children}
    </AppShell>
  );
}
