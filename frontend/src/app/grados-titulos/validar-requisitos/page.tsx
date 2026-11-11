"use client";

import { useState } from "react";

export default function ValidarRequisitosPage() {
  const [modoVerificacion, setModoVerificacion] = useState<"texto" | "pdf">("texto");
  const [query, setQuery] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState("");

  // Búsqueda por código único o DNI
  const handleBuscar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError("");
    setResultado(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      const res = await fetch(`${apiUrl}/verificar/${query.trim().toUpperCase()}/`, { cache: "no-store" });
      
      if (res.ok) {
        const data = await res.json();
        if (data.existe) {
          setResultado(data);
        } else {
          setError(data.mensaje || "El código o DNI ingresado no registra certificado oficial.");
        }
      } else {
        setError("No se encontró el certificado o solicitud con el código/DNI ingresado.");
      }
    } catch (err) {
      setError("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  // Verificación avanzada subiendo el PDF del estudiante
  const handleBuscarPorPdf = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pdfFile) {
      setError("Por favor, seleccione un archivo PDF para verificar.");
      return;
    }

    setLoading(true);
    setError("");
    setResultado(null);

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      const formData = new FormData();
      formData.append("pdf_file", pdfFile);

      const res = await fetch(`${apiUrl}/verificar-pdf/`, {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        if (data.existe) {
          setResultado(data);
        } else {
          setError(data.mensaje || "El archivo PDF no coincide con ningún registro oficial o podría estar adulterado.");
        }
      } else {
        setError("Error en el servidor al procesar el archivo PDF.");
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

      {/* Selector de pestañas: Código/DNI o Subir PDF */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setModoVerificacion("texto"); setResultado(null); setError(""); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            modoVerificacion === "texto" 
              ? "bg-amber-600 text-white shadow-sm" 
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          🔍 Buscar por Código o DNI
        </button>
        <button
          onClick={() => { setModoVerificacion("pdf"); setResultado(null); setError(""); }}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-colors ${
            modoVerificacion === "pdf" 
              ? "bg-amber-600 text-white shadow-sm" 
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          📁 Verificar Subiendo PDF del Estudiante
        </button>
      </div>

      {/* Formularios según el modo seleccionado */}
      {modoVerificacion === "texto" ? (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
          <form onSubmit={handleBuscar} className="flex gap-4">
            <input
              type="text"
              value={query ?? ""}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ingrese Código Único (Ej. INDI-2026-ING-0007) o DNI del egresado"
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
      ) : (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8">
          <form onSubmit={handleBuscarPorPdf} className="flex flex-col sm:flex-row gap-4 items-center">
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
              className="flex-1 w-full text-xs text-slate-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-amber-50 file:text-amber-700 hover:file:bg-amber-100 cursor-pointer border border-slate-200 rounded-xl p-2"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full sm:w-auto px-6 py-3 bg-amber-600 text-white rounded-xl font-semibold text-sm hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Analizando PDF..." : "🛡️ Verificar Integridad del PDF"}
            </button>
          </form>
        </div>
      )}

      {/* Resultados de Error */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium mb-6">
          ⚠️ {error}
        </div>
      )}

      {/* Resultados Exitosos */}
      {resultado && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
          <div className="flex justify-between items-center pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-800">
                Estudiante: {resultado.estudiante}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                DNI / Código: <span className="font-semibold text-slate-700">{resultado.dni || "N/A"}</span> | Registro: {resultado.codigo}
              </p>
            </div>
            {resultado.is_valid !== false ? (
              <span className="px-3 py-1 text-xs font-bold rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                VALIDADO Y REGISTRADO
              </span>
            ) : (
              <span className="px-3 py-1 text-xs font-bold rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                CERTIFICADO REVOCADO
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-400 block font-medium">Idioma Acreditado</span>
              <span className="font-semibold text-slate-700">{resultado.idioma}</span>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-400 block font-medium">Nivel de Suficiencia</span>
              <span className="font-semibold text-slate-700">{resultado.nivel}</span>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-400 block font-medium">Subnivel / Ciclo</span>
              <span className="font-semibold text-slate-700">{resultado.subnivel || "Nivel I"}</span>
            </div>
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
              <span className="text-xs text-slate-400 block font-medium">Año Acreditado</span>
              <span className="font-semibold text-slate-700">{resultado.anio || "2026"}</span>
            </div>
          </div>

          <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex justify-between items-center">
            <div>
              <p className="text-xs font-bold text-emerald-800">
                ✓ Requisito de Idioma Cumplido
              </p>
              <p className="text-xs text-emerald-600 mt-0.5">
                El estudiante cuenta con certificado auténtico registrado y verificado en el sistema UNSCH.
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