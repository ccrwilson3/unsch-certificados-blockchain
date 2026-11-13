"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface AuditLog {
  id: number;
  action: string;
  performed_by: string;
  performed_by_username: string;
  performed_by_role: string;
  certificate_code: string | null;
  timestamp: string;
  details: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

const ETIQUETAS_ROL: Record<string, string> = {
  ADMIN: "Administrador",
  INDI: "Personal INDI",
  DOCENTE: "Docente",
  GRADOS_TITULOS: "Grados y Títulos",
  STUDENT: "Estudiante",
  ESTUDIANTE: "Estudiante",
};

const sinTildes = (texto: string) =>
  texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

// Color de la etiqueta según el tipo de acción
const estiloAccion = (accion: string) => {
  const a = sinTildes(accion);
  if (
    a.startsWith("EMISION") ||
    a.startsWith("APROBACION") ||
    a.startsWith("ACTIVACION") ||
    a.startsWith("CREACION")
  ) {
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  }
  if (a.startsWith("REVOCACION") || a.startsWith("RECHAZO") || a.startsWith("DESACTIVACION")) {
    return "bg-rose-50 text-rose-700 border border-rose-200";
  }
  if (a.startsWith("RESTABLECIMIENTO") || a.startsWith("EDICION")) {
    return "bg-amber-50 text-amber-700 border border-amber-200";
  }
  return "bg-blue-50 text-blue-700 border border-blue-200";
};

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filtros independientes
  const [filtroTexto, setFiltroTexto] = useState("");
  const [filtroAccion, setFiltroAccion] = useState("TODAS");
  const [filtroFecha, setFiltroFecha] = useState(""); // Formato YYYY-MM-DD

  const [paginaActual, setPaginaActual] = useState(1);
  const registrosPorPagina = 10;

  const fetchLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/admin/auditoria/logs/?limit=1000`, { cache: "no-store" });

      if (res.status === 401 || res.status === 403) {
        setLogs([]);
        setError("No tienes permisos para ver la auditoría. Inicia sesión como administrador.");
        return;
      }
      if (!res.ok) {
        throw new Error(`Error HTTP ${res.status}`);
      }

      const data = await res.json();
      setLogs(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error al cargar auditoría:", err);
      setError("No se pudieron cargar los registros de auditoría.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Acciones distintas que existen en los registros (para el selector)
  const accionesDisponibles = Array.from(new Set(logs.map((l) => l.action))).sort();

  const logsFiltrados = logs.filter((log) => {
    const texto = filtroTexto.toLowerCase();
    const coincideTexto =
      !texto ||
      log.performed_by.toLowerCase().includes(texto) ||
      log.performed_by_username.toLowerCase().includes(texto) ||
      log.details.toLowerCase().includes(texto) ||
      (log.certificate_code || "").toLowerCase().includes(texto);

    const coincideAccion = filtroAccion === "TODAS" || log.action === filtroAccion;

    const fechaLog = log.timestamp ? new Date(log.timestamp).toLocaleDateString("en-CA") : "";
    const coincideFecha = !filtroFecha || fechaLog === filtroFecha;

    return coincideTexto && coincideAccion && coincideFecha;
  });

  // Paginación
  const indiceUltimoRegistro = paginaActual * registrosPorPagina;
  const indicePrimerRegistro = indiceUltimoRegistro - registrosPorPagina;
  const logsActuales = logsFiltrados.slice(indicePrimerRegistro, indiceUltimoRegistro);
  const totalPaginas = Math.ceil(logsFiltrados.length / registrosPorPagina) || 1;

  // Reiniciar a la página 1 al cambiar filtros
  const handleFiltroChange = (setter: (valor: string) => void, valor: string) => {
    setter(valor);
    setPaginaActual(1);
  };

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <span className="text-xs font-semibold px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">
            UNSCH - Panel Administrador
          </span>
          <h1 className="text-2xl font-bold text-slate-800 mt-2">
            Auditoría y Trazabilidad del Sistema
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Registro real de las acciones sensibles: emisión y revocación de certificados, gestión de usuarios, matrículas y cursos.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          disabled={loading}
          className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-100 disabled:opacity-50 transition-colors"
        >
          🔄 Actualizar
        </button>
      </div>

      {/* FILTROS */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Buscar por usuario, detalle o certificado</label>
          <input
            type="text"
            placeholder="Ej. 98745621, INDI-2026..."
            value={filtroTexto}
            onChange={(e) => handleFiltroChange(setFiltroTexto, e.target.value)}
            className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Filtrar por Tipo de Acción</label>
          <select
            value={filtroAccion}
            onChange={(e) => handleFiltroChange(setFiltroAccion, e.target.value)}
            className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
          >
            <option value="TODAS">Todas las acciones</option>
            {accionesDisponibles.map((accion) => (
              <option key={accion} value={accion}>
                {accion}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Filtrar por Fecha Exacta</label>
          <input
            type="date"
            value={filtroFecha}
            onChange={(e) => handleFiltroChange(setFiltroFecha, e.target.value)}
            className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Cargando eventos de auditoría...</div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
          ⚠️ {error}
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
          Aún no hay registros de auditoría. Aparecerán aquí a medida que se realicen acciones en el sistema.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="p-4">Fecha y Hora</th>
                  <th className="p-4">Usuario / Rol</th>
                  <th className="p-4">Acción</th>
                  <th className="p-4">Certificado</th>
                  <th className="p-4">Detalle de Operación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
                {logsActuales.length > 0 ? (
                  logsActuales.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors align-top">
                      <td className="p-4 text-xs text-slate-500 font-mono whitespace-nowrap">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="p-4">
                        <div className="font-medium text-slate-800">{log.performed_by}</div>
                        <div className="text-xs text-slate-400">
                          {log.performed_by_username && <span className="font-mono">{log.performed_by_username}</span>}
                          {log.performed_by_role && (
                            <span> · {ETIQUETAS_ROL[log.performed_by_role] || log.performed_by_role}</span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-full whitespace-nowrap ${estiloAccion(log.action)}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="p-4">
                        {log.certificate_code ? (
                          <Link
                            href={`/verificar/${log.certificate_code}`}
                            target="_blank"
                            className="font-mono text-xs text-blue-600 hover:underline"
                          >
                            {log.certificate_code}
                          </Link>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                      <td className="p-4 text-slate-600 text-xs">{log.details || "Sin detalles adicionales"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-500">
                      No se encontraron registros que coincidan con los filtros seleccionados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* BARRA DE PAGINACIÓN */}
          <div className="p-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center bg-slate-50/50 gap-2">
            <span className="text-xs text-slate-500">
              Mostrando {logsActuales.length > 0 ? indicePrimerRegistro + 1 : 0} a {Math.min(indiceUltimoRegistro, logsFiltrados.length)} de {logsFiltrados.length} registros
            </span>
            <div className="space-x-2 flex items-center">
              <button
                onClick={() => setPaginaActual((p) => Math.max(p - 1, 1))}
                disabled={paginaActual === 1}
                className="px-3.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors"
              >
                Anterior
              </button>
              <span className="text-xs font-semibold text-slate-600 px-2">
                {paginaActual} / {totalPaginas}
              </span>
              <button
                onClick={() => setPaginaActual((p) => Math.min(p + 1, totalPaginas))}
                disabled={paginaActual === totalPaginas}
                className="px-3.5 py-1.5 border border-slate-200 rounded-lg text-xs font-medium bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}