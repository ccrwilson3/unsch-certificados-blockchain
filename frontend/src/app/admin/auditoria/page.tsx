"use client";

import { useState, useEffect } from "react";

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Nuevos estados para los filtros independientes por columnas
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroAccion, setFiltroAccion] = useState("TODAS");
  const [filtroFecha, setFiltroFecha] = useState(""); // Formato YYYY-MM-DD

  const [paginaActual, setPaginaActual] = useState(1);
  const registrosPorPagina = 8;

const fetchLogs = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      const res = await fetch(`${apiUrl}/solicitudes/`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        const historial = data.flatMap((s: any) => [
          {
            id: `LOG-REQ-${s.id}`,
            usuario: s.student_name || "Estudiante",
            accion: "SOLICITUD_CREADA",
            detalle: `Registro de solicitud de certificado de idioma (${s.language || 'Idioma'})`,
            fecha: s.created_at || new Date().toISOString(),
            tipo: "info"
          },
          ...(s.status === 'APPROVED' || s.status === 'APROBADO' ? [{
            id: `LOG-APP-${s.id}`,
            usuario: "indi_user (INDI Staff)",
            accion: "SOLICITUD_APROBADA",
            detalle: `Aprobación oficial y emisión de certificado INDI-2026-ING-000${s.id}`,
            fecha: s.created_at || new Date().toISOString(),
            tipo: "success"
          }] : [])
        ]);

        // ORDENAMIENTO ESTRICTO: De lo más reciente a lo más antiguo
        historial.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());
        
        setLogs(historial);
      }
    } catch (error) {
      console.error("Error al cargar auditoría:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Filtrado avanzado por columnas específicas (Usuario, Acción y Fecha)
  const logsFiltrados = logs.filter((log) => {
    const coincideUsuario = log.usuario.toLowerCase().includes(filtroUsuario.toLowerCase()) ||
                            log.detalle.toLowerCase().includes(filtroUsuario.toLowerCase());
    
    const coincideAccion = filtroAccion === "TODAS" || log.accion === filtroAccion;

// Extraer de forma segura los primeros 10 caracteres (YYYY-MM-DD) sin depender de separadores
    const fechaLog = log.fecha 
    ? new Date(log.fecha).toLocaleDateString('en-CA') : "";
    const coincideFecha = !filtroFecha || fechaLog === filtroFecha;

    return coincideUsuario && coincideAccion && coincideFecha;
  });

  // Paginación
  const indiceUltimoRegistro = paginaActual * registrosPorPagina;
  const indicePrimerRegistro = indiceUltimoRegistro - registrosPorPagina;
  const logsActuales = logsFiltrados.slice(indicePrimerRegistro, indiceUltimoRegistro);
  const totalPaginas = Math.ceil(logsFiltrados.length / registrosPorPagina);

  // Reiniciar a página 1 al cambiar filtros
  const handleFiltroChange = (setter: any, val: any) => {
    setter(val);
    setPaginaActual(1);
  };

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-6">
        <span className="text-xs font-semibold px-3 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded-full">
          UNSCH - Panel Administrador
        </span>
        <h1 className="text-2xl font-bold text-slate-800 mt-2">
          Auditoría y Trazabilidad del Sistema
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Registro en tiempo real de eventos, aprobaciones y modificaciones de certificados académicos.
        </p>
      </div>

      {/* SECCIÓN DE FILTROS PROFESIONALES (Búsqueda por columnas y fecha) */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Buscar por Usuario o Detalle</label>
          <input
            type="text"
            placeholder="Ej. Juan, certificado..."
            value={filtroUsuario}
            onChange={(e) => handleFiltroChange(setFiltroUsuario, e.target.value)}
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
            <option value="SOLICITUD_CREADA">Solicitud Creada</option>
            <option value="SOLICITUD_APROBADA">Solicitud Aprobada</option>
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
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
          No hay registros de auditoría disponibles.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="p-4">ID Evento</th>
                  <th className="p-4">Usuario / Rol</th>
                  <th className="p-4">Acción</th>
                  <th className="p-4">Detalle de Operación</th>
                  <th className="p-4 text-right">Fecha y Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
                {logsActuales.length > 0 ? (
                  logsActuales.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-mono text-xs font-semibold text-slate-700">{log.id}</td>
                      <td className="p-4 font-medium text-slate-800">{log.usuario}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                          log.tipo === 'success' 
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                            : 'bg-blue-50 text-blue-700 border border-blue-200'
                        }`}>
                          {log.accion}
                        </span>
                      </td>
                      <td className="p-4 text-slate-600">{log.detalle}</td>
                      <td className="p-4 text-right text-xs text-slate-400 font-mono">
                        {new Date(log.fecha).toLocaleString()}
                      </td>
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
                {paginaActual} / {totalPaginas || 1}
              </span>
              <button
                onClick={() => setPaginaActual((p) => Math.min(p + 1, totalPaginas))}
                disabled={paginaActual === totalPaginas || totalPaginas === 0}
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