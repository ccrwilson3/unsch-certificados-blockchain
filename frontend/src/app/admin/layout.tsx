"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = () => {
    localStorage.removeItem("user");
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Menú Lateral (Sidebar) */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col justify-between p-6 border-r border-slate-800">
        <div className="space-y-8">
          <div>
            <span className="text-xs font-bold px-2.5 py-1 bg-purple-600 rounded-full text-white">
              UNSCH - ADMIN
            </span>
            <h2 className="text-lg font-bold mt-3 text-slate-100">Administración</h2>
          </div>

          <nav className="space-y-2">
            <Link
              href="/admin/usuarios"
              className={`block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.includes("/usuarios")
                  ? "bg-purple-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              👥 Gestión de Usuarios
            </Link>

            <Link
              href="/admin/auditoria"
              className={`block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                pathname.includes("/auditoria")
                  ? "bg-purple-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              📜 Auditoría / Logs
            </Link>

            <Link
              href="/"
              className="block px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
            >
              🔍 Verificador Público
            </Link>
          </nav>
        </div>

        {/* Cierre de Sesión */}
        <button
          onClick={handleLogout}
          className="w-full text-left px-4 py-2.5 text-sm font-medium text-rose-400 hover:bg-rose-950/30 rounded-xl transition-colors"
        >
          🚪 Cerrar Sesión
        </button>
      </aside>

      {/* Contenido Principal */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}