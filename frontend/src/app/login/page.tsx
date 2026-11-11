"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // nuevo
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

      // <--- AGREGA ESTA LÍNEA PARA VER QUÉ DEVUELVE EL BACKEND EN LA CONSOLA DEL NAVEGADOR --->
      console.log("Respuesta completa del login:", data);

      if (!res.ok) {
        setError(data.detail || data.error || "Credenciales incorrectas.");
        return;
      }

      // Guardamos la sesión localmente
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data));

      // Normalizar el rol a mayúsculas
      const role = (data.role || "").toUpperCase();

      // Redirección Dinámica alineada con tus carpetas reales en Next.js
      if (role === "ADMIN") {
        router.push("/admin/usuarios");
      } else if (role === "INDI") {
        router.push("/indi/aprobar-solicitudes"); // Ruta exacta según tu imagen
      } else if (role === "GRADOS_TITULOS") {
        router.push("/grados-titulos/validar-requisitos"); // Ruta exacta según tu imagen
      } else if (role == 'DOCENTE') {
        router.push('/docente/cursos');
      } else {
        router.push("/estudiante/solicitudes"); // Ruta exacta según tu imagen
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
              maxLength={8} // <--- Limita a máximo 8 caracteres
              value={username}
              // Filtra para permitir únicamente números (0-9) y corta a 8 caracteres
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                setUsername(val);
              }}
              placeholder="Ej. 12345678"
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"} // <--- Cambia dinámicamente según el estado
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
              >
                {showPassword ? (
                  /* Icono de Ojo tachado (Ocultar) */
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  /* Icono de Ojo normal (Mostrar) */
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
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