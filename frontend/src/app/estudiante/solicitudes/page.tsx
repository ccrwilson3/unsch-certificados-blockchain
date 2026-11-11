"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Solicitud {
  id: number;
  language: string;
  level: string;
  subnivel?: string;
  anio?: string;
  status: string;
  created_at: string;
  review_comments?: string; // 👈 Añadido para evitar errores de TypeScript
}

export default function SolicitudesEstudiantePage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [language, setLanguage] = useState("EN");
  const [level, setLevel] = useState("BASICO");
  const [subnivel, setSubnivel] = useState("Nivel I"); // Por defecto Nivel I
  const [anio, setAnio] = useState("2026");
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [busqueda, setBusqueda] = useState("");

  // 📄 Estados para la Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const registrosPorPagina = 5;

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

  const getAuthToken = () => {
    try {
      const userData = localStorage.getItem("user");
      if (userData) {
        const parsed = JSON.parse(userData);
        if (parsed.username) return parsed.username;
      }
    } catch (e) {
      console.error("Error al leer usuario de localStorage", e);
    }
    return "";
  };

  useEffect(() => {
    fetchSolicitudes();
  }, []);

  const fetchSolicitudes = async () => {
    try {
      const tokenDni = getAuthToken();
      const res = await fetch(`${apiUrl}/solicitudes/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${tokenDni}`, // 👈 El backend filtra o el estudiante ve las suyas
        },
        credentials: "include",
      });

      if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
      const data = await res.json();
      
      // Filtrar estrictamente en el cliente por si el backend devuelve todas, 
      // asegurando que correspondan al usuario logueado (puedes ajustar según tu filtrado en backend)
      setSolicitudes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error al cargar solicitudes:", error);
    }
  };

  const handleCrearSolicitud = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMensaje("");

    try {
      const tokenDni = getAuthToken();
      const res = await fetch(`${apiUrl}/solicitudes/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${tokenDni}`,
        },
        credentials: "include",
        body: JSON.stringify({ language, level, subnivel, anio }),
      });

      const data = await res.json();
      if (res.ok) {
        setMensaje("¡Solicitud creada exitosamente!");
        fetchSolicitudes();
      } else {
        setMensaje(`Error: ${data.message || "No se pudo crear la solicitud."}`);
      }
    } catch (error) {
      setMensaje("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  };

  // 🔍 Filtrar solicitudes del estudiante
  const solicitudesFiltradas = solicitudes.filter((s) => {
    const texto = busqueda.toLowerCase();
    return (
      s.language.toLowerCase().includes(texto) ||
      s.level.toLowerCase().includes(texto) ||
      (s.subnivel && s.subnivel.toLowerCase().includes(texto)) ||
      String(s.id).includes(texto)
    );
  });

  // 📄 Paginación
  const indiceUltimoRegistro = paginaActual * registrosPorPagina;
  const indicePrimerRegistro = indiceUltimoRegistro - registrosPorPagina;
  const registrosPaginados = solicitudesFiltradas.slice(indicePrimerRegistro, indiceUltimoRegistro);
  const totalPaginas = Math.ceil(solicitudesFiltradas.length / registrosPorPagina) || 1;

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
          
          <form onSubmit={handleCrearSolicitud} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Idioma</label>
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
              <label className="block text-sm font-medium text-slate-600 mb-1">Nivel General</label>
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

            {/* 🟢 Selector de los 4 subniveles */}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Subnivel / Ciclo</label>
              <select
                value={subnivel}
                onChange={(e) => setSubnivel(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="Nivel I">Nivel I</option>
                <option value="Nivel II">Nivel II</option>
                <option value="Nivel III">Nivel III</option>
                <option value="Nivel IV">Nivel IV</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1">Año de Estudios</label>
              <input
                type="text"
                value={anio}
                onChange={(e) => setAnio(e.target.value)}
                placeholder="Ej. 2023"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2 lg:col-span-4">
              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {loading ? "Enviando solicitud..." : "Enviar Solicitud de Certificado"}
              </button>
            </div>
          </form>

          {mensaje && (
            <p className="mt-4 text-sm text-center font-medium text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
              {mensaje}
            </p>
          )}
        </div>

        {/* Listado de solicitudes con Buscador y Estilo Admin */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <h2 className="text-lg font-semibold text-slate-800">
              Mis Solicitudes Realizadas
            </h2>
            <input
              type="text"
              placeholder="Buscar mis solicitudes..."
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPaginaActual(1);
              }}
              className="w-full sm:w-64 px-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {solicitudes.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">
              Aún no tienes solicitudes registradas.
            </p>
          ) : (
            <div className="border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
              <div className="max-h-[400px] overflow-y-auto">
                <table className="w-full text-left text-sm text-slate-600">
                  <thead className="bg-slate-50 text-slate-700 uppercase text-xs sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">Idioma</th>
                      <th className="px-4 py-3">Nivel / Ciclo</th>
                      <th className="px-4 py-3">Año</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Fecha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {registrosPaginados.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-6 text-slate-400">
                          No se encontraron resultados.
                        </td>
                      </tr>
                    ) : (
                      registrosPaginados.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/50 align-top">
                          <td className="px-4 py-3 font-medium text-slate-800">#{s.id}</td>
                          <td className="px-4 py-3">{s.language}</td>
                          <td className="px-4 py-3">{s.level} - {s.subnivel || "Nivel I"}</td>
                          <td className="px-4 py-3">{s.anio || "2023"}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-semibold inline-block ${
                                s.status === "PENDING"
                                  ? "bg-amber-50 text-amber-700"
                                  : s.status === "APPROVED"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : "bg-rose-50 text-rose-700"
                              }`}
                            >
                              {s.status}
                            </span>

                            {/* 🔴 MOTIVO DE RECHAZO Y OPCIÓN DE RECTIFICAR */}
                            {s.status === "REJECTED" && (
                              <div className="mt-2 p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-2">
                                <div>
                                  <p className="font-bold text-rose-800">❌ Solicitud Rechazada</p>
                                  <p className="text-rose-700 mt-0.5">
                                    <span className="font-semibold">Motivo:</span> {s.review_comments || "No se especificó un motivo."}
                                  </p>
                                </div>

                                <button
                                  onClick={async () => {
                                    const nuevoAnio = prompt("Ingrese el año correcto o confirme sus datos para rectificar:", s.anio || "2026");
                                    if (!nuevoAnio) return;

                                    try {
                                      const tokenDni = getAuthToken();
                                      const res = await fetch(`${apiUrl}/solicitudes/${s.id}/rectificar/`, {
                                        method: "PUT",
                                        headers: {
                                          "Content-Type": "application/json",
                                          "Authorization": `Bearer ${tokenDni}`
                                        },
                                        body: JSON.stringify({
                                          language: s.language,
                                          level: s.level,
                                          subnivel: s.subnivel,
                                          anio: nuevoAnio
                                        })
                                      });

                                      if (res.ok) {
                                        alert("¡Solicitud rectificada y reenviada al INDI con éxito!");
                                        fetchSolicitudes(); // Recargar listado en vivo
                                      } else {
                                        const errData = await res.json().catch(() => ({}));
                                        alert(`Error al rectificar: ${errData.message || "No se pudo actualizar."}`);
                                      }
                                    } catch (err) {
                                      console.error(err);
                                      alert("Error de conexión con el servidor.");
                                    }
                                  }}
                                  className="px-2.5 py-1 bg-rose-600 text-white font-semibold rounded-lg hover:bg-rose-700 transition-colors shadow-sm cursor-pointer"
                                >
                                  🔄 Corregir y Reenviar
                                </button>
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-400">
                            {s.created_at ? new Date(s.created_at).toLocaleDateString() : "N/A"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Controles de Paginación */}
              <div className="bg-slate-50 px-6 py-3 border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Página <span className="font-semibold text-slate-700">{paginaActual}</span> de <span className="font-semibold text-slate-700">{totalPaginas}</span>
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPaginaActual((prev) => Math.max(prev - 1, 1))}
                    disabled={paginaActual === 1}
                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    ← Anterior
                  </button>
                  <button
                    onClick={() => setPaginaActual((prev) => Math.min(prev + 1, totalPaginas))}
                    disabled={paginaActual === totalPaginas}
                    className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Siguiente →
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </main>
  );
}