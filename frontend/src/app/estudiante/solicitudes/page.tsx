"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Solicitud {
  id: number;
  language: string;
  level: string;
  status: string;
  created_at: string;
}

export default function SolicitudesEstudiantePage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [language, setLanguage] = useState("EN");
  const [level, setLevel] = useState("BASICO");
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

// Cargar solicitudes al montar la página
  useEffect(() => {
    fetchSolicitudes();
  }, []);

  const fetchSolicitudes = async () => {
    try {
      // Usamos ${apiUrl}/solicitudes/ para mantener la consistencia
      const res = await fetch(`${apiUrl}/solicitudes/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer ccrwilson", 
        },
        credentials: "include",
      });

      if (!res.ok) {
        throw new Error(`Error HTTP: ${res.status}`);
      }

      const data = await res.json();
      setSolicitudes(data);
    } catch (error) {
      console.error("Error al cargar solicitudes:", error);
    }
  };

  const handleCrearSolicitud = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMensaje("");

    try {
      const res = await fetch(`${apiUrl}/solicitudes/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer ccrwilson",
        },
        credentials: "include",
        body: JSON.stringify({ language, level }),
      });

      const data = await res.json();
      if (res.ok) {
        setMensaje("¡Solicitud creada exitosamente!");
        fetchSolicitudes(); // Recargar lista
      } else {
        setMensaje(`Error: ${data.message || "No se pudo crear la solicitud."}`);
      }
    } catch (error) {
      setMensaje("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 py-12 px-6">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Cabecera */}
        <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div>
            <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-600 rounded-full">
              INDI - UNSCH
            </span>
            <h1 className="text-2xl font-bold text-slate-800 mt-1">
              Portal de Solicitudes de Certificados
            </h1>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            ← Ir a Verificación
          </Link>
        </div>

        {/* Formulario de nueva solicitud */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Solicitar Nuevo Certificado de Idioma
          </h2>
          
          <form onSubmit={handleCrearSolicitud} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Idioma
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="EN">Inglés</option>
                <option value="QU">Quechua</option>
                <option value="FR">Francés</option>
                <option value="PT">Portugués</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">
                Nivel
              </label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="BASICO">Básico</option>
                <option value="INTERMEDIO">Intermedio</option>
                <option value="AVANZADO">Avanzado</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar Solicitud"}
            </button>
          </form>

          {mensaje && (
            <p className="mt-4 text-sm text-center font-medium text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
              {mensaje}
            </p>
          )}
        </div>

        {/* Listado de solicitudes */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">
            Mis Solicitudes Realizadas
          </h2>

          {solicitudes.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              Aún no tienes solicitudes registradas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-600">
                <thead className="bg-slate-50 text-slate-700 uppercase text-xs">
                  <tr>
                    <th className="px-4 py-3 rounded-l-xl">ID</th>
                    <th className="px-4 py-3">Idioma</th>
                    <th className="px-4 py-3">Nivel</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 rounded-r-xl">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {solicitudes.map((s) => (
                    <tr key={s.id}>
                      <td className="px-4 py-3 font-medium text-slate-800">#{s.id}</td>
                      <td className="px-4 py-3">{s.language}</td>
                      <td className="px-4 py-3">{s.level}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                            s.status === "PENDING"
                              ? "bg-amber-50 text-amber-700"
                              : s.status === "APPROVED"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-rose-50 text-rose-700"
                          }`}
                        >
                          {s.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-400">
                        {new Date(s.created_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}