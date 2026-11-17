"use client";

import AppShell, { type ItemNav } from "../../components/ui/AppShell";
import { BookOpen, ClipboardList, FolderOpen } from "lucide-react";

const items: ItemNav[] = [
  { href: "/docente/cursos", texto: "Mis Cursos y Evaluaciones", Icono: BookOpen },
  { href: "/docente/notas", texto: "Registro de Notas", Icono: ClipboardList },
  { href: "/docente/materiales", texto: "Materiales para estudiantes", Icono: FolderOpen },
];

export default function DocenteLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell items={items} titulo="Portal Docente" subtitulo="Certificados Blockchain" color="emerald">
      {children}
    </AppShell>
  );
}
