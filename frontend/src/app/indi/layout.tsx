"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import {
  ClipboardList,
  BookOpen,
  FileSpreadsheet,
  ShieldCheck,
  LogOut,
  UserCheck,
  ExternalLink,
  Languages,
} from "lucide-react";

export default function IndiLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [usuarioActual, setUsuarioActual] = useState({
    nombre: "Personal INDI",
    dni: "",
    rol: "INDI",
  });

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        setUsuarioActual({
          nombre: parsed.first_name
            ? `${parsed.first_name} ${parsed.last_name || ""}`
            : parsed.username || "Personal INDI",
          dni: parsed.username || "",
          rol: "INDI",
        });
      } catch (e) {
        setUsuarioActual({
          nombre: `Usuario (${userData})`,
          dni: userData,
          rol: "INDI",
        });
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    router.push("/login");
  };

  // Configuración centralizada de las rutas del INDI para mantener limpio el código
  const navItems = [
    {
      name: "Bandeja de Solicitudes",
      href: "/indi/aprobar-solicitudes",
      icon: ClipboardList,
      active: pathname.includes("/indi/aprobar-solicitudes"),
    },
    {
      name: "Gestión de Cursos",
      href: "/indi/cursos",
      icon: BookOpen,
      active: pathname.includes("/indi/cursos"),
    },
    {
      name: "Gestión de Matrículas",
      href: "/indi/matriculas",
      icon: FileSpreadsheet,
      active: pathname.includes("/indi/matriculas"),
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Menú Lateral (Sidebar) Institucional del INDI */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between p-6 border-r border-slate-800 shrink-0">
        <div className="space-y-8">
          {/* Encabezado Institucional Ámbar */}
          <div>
            <div className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 bg-amber-600/20 text-amber-300 border border-amber-500/30 rounded-full">
              <Languages className="w-3.5 h-3.5 text-amber-400" />
              <span>INDI • UNSCH</span>
            </div>
            <h2 className="text-lg font-bold mt-3 text-slate-100 tracking-tight">
              Instituto de Idiomas
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Certificados Blockchain
            </p>
          </div>

          {/* Navegación Principal */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    item.active
                      ? "bg-amber-600 text-white shadow-md shadow-amber-900/20"
                      : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100"
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      item.active ? "text-white" : "text-slate-400"
                    }`}
                  />
                  <span>{item.name}</span>
                </Link>
              );
            })}

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
            <div className="w-9 h-9 rounded-lg bg-amber-600/20 border border-amber-500/30 flex items-center justify-center shrink-0">
              <UserCheck className="w-4 h-4 text-amber-400" />
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