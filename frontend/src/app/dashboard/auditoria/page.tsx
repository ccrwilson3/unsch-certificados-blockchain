"use client";

import { useEffect, useState } from "react";

interface AuditLog {
  id: number;
  action: string;
  performed_by: string;
  certificate_code?: string;
  timestamp: string;
  details: string;
}

export default function AuditoriaDashboardPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

  useEffect(() => {
    async function fetchLogs() {
      try {
        const res = await fetch(`${apiUrl}/admin/auditoria/logs/`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setLogs(data);
        }
      } catch (error) {
        console.error("Error al cargar los logs de auditoría:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [apiUrl]);

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-6">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        
        <div className="border-b pb-6 mb-6">
          <span className="text-xs font-bold tracking-widest text-indigo-700 uppercase bg-indigo-50 px-3 py-1 rounded-full">
            Panel de Administración - UNSCH
          </span>
          <h1 className="text-2xl font-bold text-slate-800 mt-2">Logs de Trazabilidad y Auditoría</h1>
          <p className="text-sm text-slate-500">Historial inalterable de operaciones y eventos registrados en el sistema.</p>
        </div>

        {loading ? (
          <p className="text-center py-8 text-slate-500">Cargando registros de auditoría...</p>
        ) : logs.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p className="text-slate-600 font-medium">No hay registros de auditoría disponibles.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b text-xs font-semibold uppercase text-slate-400 bg-slate-50">
                  <th className="p-3">Fecha y Hora</th>
                  <th className="p-3">Usuario</th>
                  <th className="p-3">Acción</th>
                  <th className="p-3">Detalles</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition">
                    <td className="p-3 text-slate-500 font-mono text-xs">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="p-3 font-semibold text-slate-700">{log.performed_by || "Sistema"}</td>
                    <td className="p-3">
                      <span className="bg-slate-100 text-slate-800 px-2.5 py-1 rounded-md text-xs font-medium border border-slate-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 text-xs font-mono">{log.details || "Sin detalles adicionales"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </main>
  );
}