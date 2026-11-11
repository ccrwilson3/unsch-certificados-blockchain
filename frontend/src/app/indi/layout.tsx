"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";

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
    rol: "INDI"
  });

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        setUsuarioActual({
          nombre: parsed.first_name ? `${parsed.first_name} ${parsed.last_name || ""}` : parsed.username || "Personal INDI",
          dni: parsed.username || "",
          rol: "INDI"
        });
      } catch (e) {
        setUsuarioActual({
          nombre: `Usuario (${userData})`,
          dni: userData,
          rol: "INDI"
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
      {/* Menú Lateral (Sidebar) Institucional del INDI */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between p-6 border-r border-slate-800">
        <div className="space-y-8">
          <div>
            <span className="text-xs font-bold px-2.5 py-1 bg-amber-600 rounded-full text-white">
              INDI - UNSCH
            </span>
            <h2 className="text-lg font-bold mt-3 text-slate-100">Instituto de Idiomas</h2>
          </div>

          <nav className="space-y-2">
            <Link
              href="/indi/aprobar-solicitudes"
              className={`block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.includes("/indi/aprobar-solicitudes")
                  ? "bg-amber-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              📋 Bandeja de Solicitudes
            </Link>

            {/* 🟢 NUEVOS ENLACES ACADÉMICOS PARA EL INDI */}
            <Link
              href="/indi/cursos"
              className={`block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.includes("/indi/cursos")
                  ? "bg-amber-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              📚 Gestión de Cursos
            </Link>

            <Link
              href="/indi/matriculas"
              className={`block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.includes("/indi/matriculas")
                  ? "bg-amber-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              📝 Gestión de Matrículas
            </Link>

            <Link
              href="/"
              className="block px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              🔍 Verificador Público
            </Link>
          </nav>
        </div>

        {/* Sección de Usuario Activo y Cierre de Sesión */}
        <div className="space-y-4 pt-4 border-t border-slate-800">
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
            <p className="text-xs font-bold text-slate-200 truncate">{usuarioActual.nombre}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">DNI: <span className="text-slate-300 font-semibold">{usuarioActual.dni}</span></p>
          </div>

          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-950/30 rounded-xl transition-colors"
          >
            🚪 Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Contenido Principal */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}