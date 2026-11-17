"use client";

import AppShell, { type ItemNav } from "../../components/ui/AppShell";
import { BadgeCheck } from "lucide-react";

const items: ItemNav[] = [
  { href: "/grados-titulos/validar-requisitos", texto: "Validar requisitos", Icono: BadgeCheck },
];

export default function GradosTitulosLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell items={items} titulo="Grados y Títulos" subtitulo="Validación de requisitos" color="violet">
      {children}
    </AppShell>
  );
}
