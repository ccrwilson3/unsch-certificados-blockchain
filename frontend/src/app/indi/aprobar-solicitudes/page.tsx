"use client";

import { useState, useEffect } from "react";

export default function AprobarSolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState("");

  const fetchSolicitudes = async () => {
    try {
      setLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      
      // Petición limpia sin cabeceras complejas que disparen bloqueos OPTIONS inesperados
      const res = await fetch(`${apiUrl}/solicitudes/`, { 
        method: "GET",
        cache: "no-store" 
      });

      if (res.ok) {
        const data = await res.json();
        console.log("Solicitudes recibidas en Next.js:", data);
        setSolicitudes(Array.isArray(data) ? data : []);
      } else {
        console.error("Error al obtener solicitudes. Estado HTTP:", res.status);
      }
    } catch (error) {
      console.error("Error de conexión al cargar solicitudes:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSolicitudes();
  }, []);

  const handleAccionSolicitud = async (id: number, accion: "aprobar" | "rechazar") => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      
      let token = "indi_user";
      const userData = localStorage.getItem("user");
      if (userData) {
        try {
          const parsed = JSON.parse(userData);
          if (parsed.username) token = parsed.username;
        } catch (e) {
          token = userData;
        }
      }

      const res = await fetch(`${apiUrl}/solicitudes/${id}/aprobar/`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ accion }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        const nuevoEstado = accion === "aprobar" ? "APPROVED" : "REJECTED";
        setMensaje(`Solicitud #${id} ${accion === 'aprobar' ? 'aprobada y registrada en Blockchain' : 'rechazada'} correctamente.`);
        
        // 🔄 Actualización instantánea en la interfaz
        setSolicitudes((prev) =>
          prev.map((sol) =>
            sol.id === id
              ? {
                  ...sol,
                  status: nuevoEstado,
                  certificate_code: data.certificate_code || `INDI-2026-ING-000${id}`
                }
              : sol
          )
        );
      } else {
        setMensaje(`Error al procesar: ${data.message || 'Esta solicitud ya fue procesada o es inválida.'}`);
      }
    } catch (error) {
      setMensaje("Error de conexión con el backend.");
    }
  };

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-600 rounded-full">
          INDI - Personal Administrativo
        </span>
        <h1 className="text-2xl font-bold text-slate-800 mt-2">Bandeja de Solicitudes de Certificados</h1>
        <p className="text-sm text-slate-500 mt-1">
          Revise y apruebe las solicitudes académicas presentadas por los estudiantes del Instituto de Idiomas.
        </p>
      </div>

      {mensaje && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-medium flex justify-between items-center">
          <span>{mensaje}</span>
          <button onClick={() => setMensaje("")} className="text-emerald-600 hover:text-emerald-900 font-bold ml-4">✕</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-2"></div>
          <p>Cargando lista de solicitudes desde el servidor...</p>
        </div>
      ) : solicitudes.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
          No hay solicitudes registradas en la base de datos.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                <th className="p-4">ID</th>
                <th className="p-4">Estudiante</th>
                <th className="p-4">Idioma / Nivel</th>
                <th className="p-4">Estado Actual</th>
                <th className="p-4 text-right">Acciones / Certificado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
              {solicitudes.map((sol) => {
                const estadoUpper = (sol.status || "").toUpperCase();
                const esAprobado = estadoUpper === "APPROVED" || estadoUpper === "APROBADO";
                const esRechazado = estadoUpper === "REJECTED" || estadoUpper === "RECHAZADO";
                const codigoCertificado = sol.certificate_code || `INDI-2026-ING-000${sol.id}`;

                return (
                  <tr key={sol.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-semibold text-slate-800">#{sol.id}</td>
                    <td className="p-4">{sol.student_name || "Estudiante UNSCH"}</td>
                    <td className="p-4 font-medium text-slate-800">
                      {sol.language || "Inglés"} - {sol.level || "Intermedio"}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        esAprobado ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        esRechazado ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {sol.status || "PENDIENTE"}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      {esAprobado ? (
                        <a
                          href={`http://127.0.0.1:8000/api/certificado/${codigoCertificado}/descargar/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
                        >
                          📄 Ver Certificado PDF
                        </a>
                      ) : esRechazado ? (
                        <span className="text-xs text-slate-400 italic">Solicitud Rechazada</span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleAccionSolicitud(sol.id, "aprobar")}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => handleAccionSolicitud(sol.id, "rechazar")}
                            className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors"
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}