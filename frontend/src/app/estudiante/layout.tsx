"use client";

import AppShell, { type ItemNav } from "../../components/ui/AppShell";
import { FileText, Award, PlusCircle, CreditCard, BarChart3, FolderOpen } from "lucide-react";

const items: ItemNav[] = [
  { href: "/estudiante/solicitudes", texto: "Mis Solicitudes", Icono: FileText },
  { href: "/estudiante/mis-certificados", texto: "Mis Certificados", Icono: Award },
  { href: "/estudiante/matricula", texto: "Inscripción a Cursos", Icono: PlusCircle },
  { href: "/estudiante/dashboard", texto: "Órdenes de Pago", Icono: CreditCard },
  { href: "/estudiante/notas", texto: "Mis Notas y Promedios", Icono: BarChart3 },
  { href: "/estudiante/materiales", texto: "Materiales de Clase", Icono: FolderOpen },
];

export default function EstudianteLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell items={items} titulo="Portal Estudiante" subtitulo="Certificados Blockchain" color="indigo">
      {children}
    </AppShell>
  );
}
