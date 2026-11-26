"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileSignature, RefreshCw } from "lucide-react";
import { API_URL } from "../lib/abrirArchivo";
import { ESTILO_ESTADO, TEXTO_ESTADO_CORTO, fechaCorta, fechaHora } from "../lib/actas";

interface FilaActa {
  curso_id: number;
  curso: string;
  periodo: string;
  idioma: string;
  nivel: string;
  subnivel: string;
  docente: string;
  matriculados: number;
  estado: string;
  codigo: string;
  version: number;
  fecha_fin_curso: string | null;
  plazo_limite: string | null;
  plazo_vencido: boolean;
  firmada_docente_en: string | null;
  cerrada_en: string | null;
  integridad: "INTEGRA" | "ALTERADA" | null;
}

const FILTROS = [
  { id: "TODAS", texto: "Todas" },
  { id: "FIRMADA_DOCENTE", texto: "Por revisar" },
  { id: "BORRADOR", texto: "En elaboración" },
  { id: "OBSERVADA", texto: "Observadas" },
  { id: "REABIERTA", texto: "Reabiertas" },
  { id: "CERRADA", texto: "Cerradas" },
];

export default function ActasLista({ rutaBase, descripcion, filtroInicial = "FIRMADA_DOCENTE" }: { rutaBase: string; descripcion: string; filtroInicial?: string }) {
  const [filas, setFilas] = useState<FilaActa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [filtro, setFiltro] = useState(filtroInicial);
  const [busqueda, setBusqueda] = useState("");

  const cargar = async () => {
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/actas/`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "No se pudieron cargar las actas.");
        return;
      }
      setFilas(data);
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const cuenta = (id: string) => (id === "TODAS" ? filas.length : filas.filter((f) => f.estado === id).length);

  const visibles = useMemo(() => {
    const t = busqueda.trim().toLowerCase();
    return filas.filter(
      (f) =>
        (filtro === "TODAS" || f.estado === filtro) &&
        (!t || `${f.curso} ${f.docente} ${f.periodo} ${f.codigo}`.toLowerCase().includes(t))
    );
  }, [filas, filtro, busqueda]);

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
            <FileSignature className="w-6 h-6 text-amber-600 shrink-0" />Actas de Notas
          </h1>
          <p className="text-sm text-slate-500 mt-1">{descripcion}</p>
        </div>
        <button onClick={cargar} disabled={cargando}
          className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-100 disabled:opacity-50">
          <RefreshCw className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />Actualizar
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {FILTROS.map((f) => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors ${
              filtro === f.id ? "bg-amber-600 text-white border-amber-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}>
            {f.texto} <span className="opacity-70">({cuenta(f.id)})</span>
          </button>
        ))}
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar curso, docente o período..."
          className="ml-auto w-full sm:w-72 px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500" />
      </div>

      {error && <div className="p-4 rounded-xl text-sm bg-rose-50 text-rose-700 border border-rose-200">{error}</div>}

      {cargando ? (
        <p className="text-slate-500">Cargando actas...</p>
      ) : visibles.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-slate-500 text-sm">
          No hay actas en esta vista.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="p-4">Curso</th>
                  <th className="p-4">Docente</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Plazo / Firmas</th>
                  <th className="p-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {visibles.map((f) => (
                  <tr key={f.curso_id} className="hover:bg-slate-50/60 align-top">
                    <td className="p-4">
                      <div className="font-medium text-slate-800">{f.curso}</div>
                      <div className="text-xs text-slate-500">{f.periodo} · {f.matriculados} matriculados</div>
                    </td>
                    <td className="p-4 text-slate-600">{f.docente}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full border whitespace-nowrap ${ESTILO_ESTADO[f.estado] || ""}`}>
                        {TEXTO_ESTADO_CORTO[f.estado] || f.estado}
                      </span>
                      {f.integridad === "ALTERADA" && (
                        <div className="mt-1 text-xs font-bold text-rose-600">Notas alteradas</div>
                      )}
                    </td>
                    <td className="p-4 text-xs text-slate-500 space-y-0.5">
                      {f.cerrada_en ? (
                        <div>Cerrada el {fechaHora(f.cerrada_en)}</div>
                      ) : f.firmada_docente_en ? (
                        <div>Docente firmó el {fechaHora(f.firmada_docente_en)}</div>
                      ) : f.plazo_limite ? (
                        <div className={f.plazo_vencido ? "text-rose-600 font-semibold" : ""}>
                          {f.plazo_vencido ? "Plazo vencido el " : "Plazo hasta el "}{fechaCorta(f.plazo_limite)}
                        </div>
                      ) : (
                        <div className="text-slate-400">Sin fecha de culminación</div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <Link href={`${rutaBase}/${f.curso_id}`}
                        className="inline-block px-3.5 py-2 text-xs font-semibold text-amber-700 border border-amber-200 rounded-xl hover:bg-amber-50">
                        {f.estado === "FIRMADA_DOCENTE" && rutaBase.startsWith("/indi") ? "Revisar" : "Abrir"}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </main>
  );
}
