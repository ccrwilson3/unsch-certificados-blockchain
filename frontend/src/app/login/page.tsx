"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      
      const res = await fetch(`${apiUrl}/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || data.error || "Credenciales incorrectas.");
        return;
      }

      // Guardamos la sesión localmente
      localStorage.setItem("token", data.token); // O data.username

      // Normalizar el rol para evitar problemas de mayúsculas/minúsculas
      const role = (data.role || "").toUpperCase();

      // Redirección Dinámica por Rol (RF 03)
      if (role === "INDI" || data.is_indi_staff) {
        router.push("/indi/aprobar-solicitudes");
      } else if (role === "GRADOS_TITULOS" || role === "GRADOS_Y_TITULOS" || role === "GT") {
        router.push("/grados-titulos/validar-requisitos");
      } else if (role === "ADMIN" || data.is_superuser || data.is_staff) {
        router.push("/admin/auditoria");
      } else {
        // Por defecto para estudiantes o roles generales
        router.push("/estudiante/solicitudes");
      }
    } catch (err) {
      setError("Error al conectar con el servidor de autenticación.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
        
        <div className="text-center mb-8">
          <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-600 rounded-full">
            UNSCH - INDI
          </span>
          <h1 className="text-2xl font-bold text-slate-800 mt-2">
            Sistema de Certificados Blockchain
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Ingresa tus credenciales institucionales
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs text-center font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Usuario / DNI
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Ej. ccrwilson"
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Contraseña
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Iniciando Sesión..." : "Iniciar Sesión"}
          </button>
        </form>

        <div className="mt-6 text-center border-t border-slate-100 pt-4">
          <a href="/" className="text-xs text-slate-500 hover:text-slate-800 transition-colors">
            ← Ir a Verificación Pública de Certificados
          </a>
        </div>
      </div>
    </main>
  );
}