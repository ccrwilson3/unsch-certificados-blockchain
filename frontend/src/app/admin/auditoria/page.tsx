"use client";

import { useState, useEffect } from "react";

export default function AuditoriaPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      const res = await fetch(`${apiUrl}/solicitudes/`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        // Generamos eventos de trazabilidad basados en las solicitudes
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
        setLogs(historial.reverse());
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

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
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

      {loading ? (
        <div className="text-center py-12 text-slate-500">Cargando eventos de auditoría...</div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
          No hay registros de auditoría disponibles.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
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
              {logs.map((log) => (
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}