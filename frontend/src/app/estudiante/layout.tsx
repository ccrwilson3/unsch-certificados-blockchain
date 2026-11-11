'use client';

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useState, useEffect } from "react";

export default function EstudianteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const [usuarioActual, setUsuarioActual] = useState({
    nombre: "Estudiante",
    dni: "",
    rol: "ESTUDIANTE"
  });

  useEffect(() => {
    const userData = localStorage.getItem("user");
    if (userData) {
      try {
        const parsed = JSON.parse(userData);
        setUsuarioActual({
          nombre: parsed.first_name ? `${parsed.first_name} ${parsed.last_name || ""}` : parsed.username || "Estudiante",
          dni: parsed.username || "",
          rol: "ESTUDIANTE"
        });
      } catch (e) {
        setUsuarioActual({
          nombre: `Usuario (${userData})`,
          dni: userData,
          rol: "ESTUDIANTE"
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
            <span className="text-xs font-bold px-2.5 py-1 bg-indigo-600 rounded-full uppercase tracking-wider">
              INDI - UNSCH
            </span>
            <h2 className="text-lg font-bold mt-3 text-slate-100">Portal Estudiante</h2>
          </div>

          <nav className="space-y-1.5">
            <Link
              href="/estudiante/solicitudes"
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.includes("/solicitudes")
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
              Mis Solicitudes
            </Link>

            <Link
              href="/estudiante/mis-certificados"
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.includes("/mis-certificados")
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5z"/><path strokeLinecap="round" strokeLinejoin="round" d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z"/></svg>
              Mis Certificados
            </Link>

            <Link
              href="/estudiante/matricula"
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname === "/estudiante/matricula"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              Inscripción a Cursos
            </Link>

            <Link
              href="/estudiante/dashboard"
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.includes("/dashboard")
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>
              Órdenes de Pago
            </Link>

            <Link
              href="/estudiante/notas"
              className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.includes("/notas")
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
              Mis Notas y Promedios
            </Link>

            <Link
              href="/"
              className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
              Verificador Público
            </Link>
          </nav>
        </div>

        {/* Sección de Usuario y Logout */}
        <div className="space-y-4 pt-4 border-t border-slate-800">
          <div className="bg-slate-800/60 p-3.5 rounded-xl border border-slate-700/50">
            <p className="text-xs font-bold text-slate-200 truncate">{usuarioActual.nombre}</p>
            <p className="text-[11px] text-slate-400 mt-0.5">
              DNI: <span className="text-slate-300 font-semibold">{usuarioActual.dni}</span>
            </p>
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-950/30 rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
            Cerrar Sesión
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