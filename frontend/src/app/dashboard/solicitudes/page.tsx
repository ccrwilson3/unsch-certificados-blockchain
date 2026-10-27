"use client";

import { useEffect, useState } from "react";

interface CertificateRequest {
  id: number;
  student_name: string;
  language: string;
  level: string;
  status: string;
  created_at: string;
}

export default function SolicitudesDashboardPage() {
  const [solicitudes, setSolicitudes] = useState<CertificateRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

  useEffect(() => {
    // Aquí consumirías el endpoint del backend que liste las solicitudes pendientes para el personal del INDI
    async function fetchSolicitudes() {
      try {
        const res = await fetch(`${apiUrl}/solicitudes/`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setSolicitudes(data);
        }
      } catch (error) {
        console.error("Error al cargar solicitudes:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchSolicitudes();
  }, [apiUrl]);

  const handleAprobar = async (id: number) => {
    try {
      const res = await fetch(`${apiUrl}/solicitudes/${id}/aprobar/`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        // Actualizar la lista localmente tras la aprobación exitosa
        setSolicitudes(solicitudes.filter((s) => s.id !== id));
        alert("Solicitud aprobada y certificado emitido en la Blockchain con éxito.");
      } else {
        alert("Error al aprobar la solicitud.");
      }
    } catch (error) {
      console.error("Error en la petición de aprobación:", error);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-10 px-6">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-xl p-8 border border-slate-100">
        
        <div className="flex justify-between items-center border-b pb-6 mb-6">
          <div>
            <span className="text-xs font-bold tracking-widest text-blue-700 uppercase bg-blue-50 px-3 py-1 rounded-full">
              Panel INDI - Personal Autorizado
            </span>
            <h1 className="text-2xl font-bold text-slate-800 mt-2">Gestión de Solicitudes de Certificados</h1>
            <p className="text-sm text-slate-500">Aprobación y emisión automatizada de certificados académicos.</p>
          </div>
        </div>

        {loading ? (
          <p className="text-center py-8 text-slate-500">Cargando solicitudes pendientes...</p>
        ) : solicitudes.length === 0 ? (
          <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p className="text-slate-600 font-medium">No hay solicitudes pendientes de aprobación.</p>
            <p className="text-xs text-slate-400 mt-1">Las solicitudes enviadas por los estudiantes aparecerán aquí.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b text-xs font-semibold uppercase text-slate-400 bg-slate-50">
                  <th className="p-3">Estudiante</th>
                  <th className="p-3">Idioma / Nivel</th>
                  <th className="p-3">Fecha de Solicitud</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {solicitudes.map((sol) => (
                  <tr key={sol.id} className="hover:bg-slate-50/50 transition">
                    <td className="p-3 font-semibold text-slate-800">{sol.student_name}</td>
                    <td className="p-3 text-slate-600">{sol.language} - {sol.level}</td>
                    <td className="p-3 text-slate-500">{new Date(sol.created_at).toLocaleDateString()}</td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => handleAprobar(sol.id)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-medium transition shadow-sm"
                      >
                        Aprobar y Emitir
                      </button>
                    </td>
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