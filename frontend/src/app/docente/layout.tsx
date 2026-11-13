"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import {
  BookOpen,
  ClipboardList,
  ShieldCheck,
  LogOut,
  UserCheck,
  ExternalLink,
  GraduationCap,
} from "lucide-react";

// Enlaces del menú del docente
const navItems = [
  {
    name: "Mis Cursos y Evaluaciones",
    href: "/docente/cursos",
    icon: BookOpen,
  },
  {
    name: "Registro de Notas",
    href: "/docente/notas",
    icon: ClipboardList,
  },
];

// Dibuja los enlaces. Recibe la ruta actual para resaltar el que está activo.
function NavLinks({ pathname }: { pathname: string }) {
  return (
    <>
      {navItems.map((item) => {
        const Icon = item.icon;
        const active = pathname !== "" && pathname.includes(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
              active
                ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/20"
                : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100"
            }`}
          >
            <Icon
              className={`w-4 h-4 shrink-0 ${
                active ? "text-white" : "text-slate-400"
              }`}
            />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </>
  );
}

// Este componente es el ÚNICO que lee la ruta actual (usePathname).
// En rutas con parámetro, como /docente/notas/19, Next.js exige que ese dato se lea
// dentro de <Suspense>; por eso va separado y se envuelve más abajo.
function NavConRutaActual() {
  const pathname = usePathname();
  return <NavLinks pathname={pathname} />;
}

export default function DocenteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();

  const [usuarioActual, setUsuarioActual] = useState({
    nombre: "Docente",
    dni: "",
    rol: "DOCENTE",
  });

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        setUsuarioActual({
          nombre: parsed.first_name
            ? `${parsed.first_name} ${parsed.last_name || ""}`
            : parsed.username || "Docente",
          dni: parsed.username || "",
          rol: "DOCENTE",
        });
      } catch (e) {
        setUsuarioActual({
          nombre: `Usuario (${userData})`,
          dni: userData,
          rol: "DOCENTE",
        });
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Menú Lateral (Sidebar) Docente */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between p-6 border-r border-slate-800 shrink-0">
        <div className="space-y-8">
          {/* Encabezado Institucional Docente */}
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 rounded-full">
              <GraduationCap className="w-3.5 h-3.5 text-emerald-400" />
              <span>INDI • DOCENTE</span>
            </div>
            <h2 className="text-lg font-bold mt-3 text-slate-100 tracking-tight">
              Portal Docente
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Certificados Blockchain
            </p>
          </div>

          {/* Navegación Principal */}
          <nav className="space-y-1.5">
            {/* Mientras carga la ruta se muestran los mismos enlaces, sin resaltar ninguno */}
            <Suspense fallback={<NavLinks pathname="" />}>
              <NavConRutaActual />
            </Suspense>

            <div className="pt-3 mt-3 border-t border-slate-800/80">
              <Link
                href="/"
                className="flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800/80 hover:text-slate-100 transition-all duration-200 group"
              >
                <div className="flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Verificador Público</span>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300 transition-colors" />
              </Link>
            </div>
          </nav>
        </div>

        {/* Sección de Usuario Activo y Cierre de Sesión */}
        <div className="space-y-3 pt-4 border-t border-slate-800">
          <div className="flex items-center gap-3 bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
            <div className="w-9 h-9 rounded-lg bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-200 truncate">
                {usuarioActual.nombre}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                DNI:{" "}
                <span className="text-slate-300 font-medium">
                  {usuarioActual.dni || "No registrado"}
                </span>
              </p>
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-950/40 hover:text-rose-300 rounded-xl transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4 shrink-0" />
            <span>Cerrar Sesión</span>
          </button>
        </div>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}