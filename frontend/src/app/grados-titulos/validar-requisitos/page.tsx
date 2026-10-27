"use client";

import { useState } from "react";

export default function ValidarRequisitosPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState("");

  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setResultado(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      // Consultar directamente al endpoint de verificación en Django
      const res = await fetch(`${apiUrl}/verificar/${query.trim().toUpperCase()}/`, { cache: "no-store" });
      
      if (res.ok) {
        const data = await res.json();
        if (data.existe) {
          setResultado(data);
        } else {
          setError(data.mensaje || "El código ingresado no existe o no ha sido emitido formalmente.");
        }
      } else {
        setError("No se encontró el certificado o solicitud con el código ingresado.");
      }
    } catch (err) {
      setError("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <span className="text-xs font-semibold px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
          UNSCH - Oficina de Grados y Títulos
        </span>
        <h1 className="text-2xl font-bold text-slate-800 mt-2">
          Validación Cruzada de Requisitos de Idioma
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Consulte la validez y estado oficial de los certificados de suficiencia emitidos por el INDI para trámites de titulación.
        </p>
      </div>

      {/* Formulario de búsqueda */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
        <form onSubmit={handleBuscar} className="flex gap-4">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ingrese Código Único del Certificado (Ej. INDI-2026-ING-0007)"
            className="flex-1 px-4 py-3 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-amber-600 text-white rounded-xl font-semibold text-sm hover:bg-amber-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Verificando..." : "🔍 Validar Requisito"}
          </button>
        </form>
      </div>

      {/* Resultados */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
          {error}
        </div>
      )}

      {resultado && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                Estudiante: {resultado.estudiante}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Código de Registro: {resultado.codigo}
              </p>
            </div>
            <span className="px-3 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              VALIDADO Y REGISTRADO
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-400 block font-medium">Idioma Acreditado</span>
              <span className="font-semibold text-slate-700">{resultado.idioma}</span>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-400 block font-medium">Nivel de Suficiencia</span>
              <span className="font-semibold text-slate-700">{resultado.nivel}</span>
            </div>
          </div>

          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-emerald-800">
                ✓ Requisito de Idioma Cumplido
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                El estudiante cuenta con certificado auténtico registrado en el sistema UNSCH.
              </p>
            </div>
            <a
              href={`http://127.0.0.1:8000/api/certificado/${resultado.codigo}/descargar/`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors"
            >
              📄 Descargar Constancia PDF
            </a>
          </div>
        </div>
      )}
    </main>
  );
}