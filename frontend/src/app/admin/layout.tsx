"use client";

import AppShell, { type ItemNav } from "../../components/ui/AppShell";
import { Users, ScrollText } from "lucide-react";

const items: ItemNav[] = [
  { href: "/admin/usuarios", texto: "Usuarios", Icono: Users },
  { href: "/admin/auditoria", texto: "Auditoría", Icono: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell items={items} titulo="Administración" subtitulo="Control del sistema" color="rose">
      {children}
    </AppShell>
  );
}
