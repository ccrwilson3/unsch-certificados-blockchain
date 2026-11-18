"use client";

import { useState } from "react";
import { ArrowLeft, MailCheck } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export default function RecuperarPage() {
  const [valor, setValor] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [enviado, setEnviado] = useState("");

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const res = await fetch(`${API_URL}/password/olvide/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: valor.trim() }),
      });
      const data = await res.json();
      if (res.ok) setEnviado(data.message);
      else setError(data.message || data.detail || "No se pudo procesar la solicitud.");
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
        <div className="text-center mb-6">
          <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-600 rounded-full">UNSCH - INDI</span>
          <h1 className="text-2xl font-bold text-slate-800 mt-2">Recuperar contraseña</h1>
          <p className="text-xs text-slate-500 mt-1">
            Escribe tu DNI o tu correo personal y te enviaremos un enlace para crear una contraseña nueva.
          </p>
        </div>

        {enviado ? (
          <div className="space-y-4">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm flex gap-3">
              <MailCheck className="w-5 h-5 shrink-0 mt-0.5" />
              <p>{enviado}</p>
            </div>
            <p className="text-xs text-slate-500">
              ¿No te llega? Revisa spam o vuelve a intentarlo en un minuto. Si ya no usas el correo con el que te
              registraste, comunícate con el INDI.
            </p>
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-4">
            {error && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs text-center font-medium">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">DNI o correo personal</label>
              <input
                type="text"
                required
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="Ej. 12345678 o nombre@gmail.com"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="submit"
              disabled={enviando || !valor.trim()}
              className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {enviando ? "Enviando..." : "Enviarme el enlace"}
            </button>
          </form>
        )}

        <div className="mt-6 text-center border-t border-slate-100 pt-4">
          <a href="/login" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver a iniciar sesión
          </a>
        </div>
      </div>
    </main>
  );
}
