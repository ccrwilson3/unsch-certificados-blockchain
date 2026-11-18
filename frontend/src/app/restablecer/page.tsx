"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Eye, EyeOff } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

function Formulario() {
  const params = useSearchParams();
  const token = params.get("token") || "";

  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [ver, setVer] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [listo, setListo] = useState(false);

  const reglas = [
    { ok: nueva.length >= 8, texto: "Al menos 8 caracteres" },
    { ok: nueva !== "" && !/^\d+$/.test(nueva), texto: "No puede ser solo números" },
    { ok: confirmar !== "" && nueva === confirmar, texto: "La confirmación coincide" },
  ];

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (nueva !== confirmar) {
      setError("La confirmación no coincide con la nueva contraseña.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(`${API_URL}/password/restablecer/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, nueva, confirmar }),
      });
      const data = await res.json();
      if (res.ok) setListo(true);
      else setError(data.message || "No se pudo cambiar la contraseña.");
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  };

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-slate-600">Este enlace no es válido. Pide uno nuevo para continuar.</p>
        <a href="/recuperar" className="inline-block px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
          Pedir un enlace nuevo
        </a>
      </div>
    );
  }

  if (listo) {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
        <p className="text-sm text-slate-700 font-medium">Tu contraseña fue actualizada.</p>
        <a href="/login" className="inline-block px-5 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700">
          Ir a iniciar sesión
        </a>
      </div>
    );
  }

  const tipo = ver ? "text" : "password";
  const campo = "w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <form onSubmit={enviar} className="space-y-4">
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs text-center font-medium">
          {error}{" "}
          {error.includes("enlace") && (
            <a href="/recuperar" className="underline font-semibold">Pedir uno nuevo</a>
          )}
        </div>
      )}
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Nueva contraseña</label>
        <input type={tipo} required autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} className={campo} />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Repite la nueva contraseña</label>
        <input type={tipo} required autoComplete="new-password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} className={campo} />
      </div>

      <button type="button" onClick={() => setVer(!ver)} className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 cursor-pointer">
        {ver ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        {ver ? "Ocultar contraseñas" : "Mostrar contraseñas"}
      </button>

      <ul className="space-y-1">
        {reglas.map((r) => (
          <li key={r.texto} className={`text-xs flex items-center gap-2 ${r.ok ? "text-emerald-600" : "text-slate-400"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${r.ok ? "bg-emerald-500" : "bg-slate-300"}`} />
            {r.texto}
          </li>
        ))}
      </ul>

      <button
        type="submit"
        disabled={enviando}
        className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
      >
        {enviando ? "Guardando..." : "Guardar nueva contraseña"}
      </button>
    </form>
  );
}

export default function RestablecerPage() {
  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
        <div className="text-center mb-6">
          <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-600 rounded-full">UNSCH - INDI</span>
          <h1 className="text-2xl font-bold text-slate-800 mt-2">Crear nueva contraseña</h1>
        </div>
        <Suspense fallback={<p className="text-sm text-slate-500 text-center">Cargando...</p>}>
          <Formulario />
        </Suspense>
      </div>
    </main>
  );
}
