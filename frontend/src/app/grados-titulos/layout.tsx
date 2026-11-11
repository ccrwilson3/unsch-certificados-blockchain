"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export default function GradosTitulosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  // 🟢 Estado para capturar los datos del usuario administrador logueado
  const [usuarioActual, setUsuarioActual] = useState({
    nombre: "Grados y Titulos",
    dni: "",
    rol: "GRADOS_TITULOS"
  });

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        setUsuarioActual({
          nombre: parsed.first_name ? `${parsed.first_name} ${parsed.last_name || ""}` : parsed.username || "Grados y Titulos",
          dni: parsed.username || "",
          rol: "GRADOS_TITULOS"
        });
      } catch (e) {
        setUsuarioActual({
          nombre: `Usuario (${userData})`,
          dni: userData,
          rol: "GRADOS_TITULOS"
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
      {/* Menú Lateral (Sidebar) */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between p-6 border-r border-slate-800">
        <div className="space-y-8">
          <div>
            <span className="text-xs font-bold px-2.5 py-1 bg-amber-600 rounded-full text-white">
              UNSCH - G&T
            </span>
            <h2 className="text-lg font-bold mt-3 text-slate-100">Grados y Títulos</h2>
          </div>

          <nav className="space-y-2">
            <Link
              href="/grados-titulos/validar-requisitos"
              className={`block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.includes("/validar-requisitos")
                  ? "bg-amber-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              🛡️ Validar Certificados
            </Link>

            <Link
              href="/"
              className="block px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              🔍 Verificador Público
            </Link>
          </nav>
        </div>

        {/* 🟢 SECCIÓN INFERIOR: IDENTIFICACIÓN INSTANTÁNEA + CIERRE DE SESIÓN */}
        <div className="space-y-4 pt-4 border-t border-slate-800">
          <div className="bg-slate-800/60 p-3 rounded-xl border border-slate-700/50">
            <p className="text-xs font-bold text-slate-200 truncate">{usuarioActual.nombre}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">
              DNI: <span className="text-slate-300 font-semibold">{usuarioActual.dni}</span>
            </p>
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