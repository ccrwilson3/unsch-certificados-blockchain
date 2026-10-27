"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const [codigo, setCodigo] = useState("");
  const router = useRouter();

  const handleVerificar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!codigo.trim()) return;
    router.push(`/verificar/${codigo.trim()}`);
  };

  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-slate-100">
        <div className="text-center mb-6">
          <span className="text-xs font-bold tracking-wider text-blue-600 uppercase bg-blue-50 px-3 py-1 rounded-full">
            UNSCH - INDI
          </span>
          <h1 className="text-2xl font-bold text-slate-800 mt-3">Verificación de Certificados</h1>
          <p className="text-sm text-slate-500 mt-1">
            Sistema basado en Blockchain para la validación oficial de estudios de idiomas.
          </p>
        </div>

        <form onSubmit={handleVerificar} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase mb-2">
              Código Único de Certificado
            </label>
            <input
              type="text"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="Ej: INDI-2026-ING-XXXX"
              className="w-full px-4 py-3 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 focus:outline-none text-slate-800 transition"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-blue-700 hover:bg-blue-800 text-white font-medium py-3 rounded-lg transition-colors shadow-sm"
          >
            Consultar Autenticidad
          </button>
        </form>
      </div>
    </main>
  );
}