"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AprobarSolicitudesPage() {
  const router = useRouter();
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState("");
  const [busqueda, setBusqueda] = useState("");

  // 📄 Estados para la Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const registrosPorPagina = 10;

  const fetchSolicitudes = async () => {
    try {
      setLoading(true);
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      
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

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

const handleAccionSolicitud = async (id: number, accion: "aprobar" | "rechazar") => {
    let comments = "";
    
    if (accion === "rechazar") {
      const motivo = prompt("Ingrese el motivo detallado del rechazo (ej. Datos incorrectos, subnivel no coincide):");
      if (motivo === null) return; // Si cancela, no hace nada
      comments = motivo.trim() || "Rechazado por el INDI sin motivo especificado.";
    }

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
        body: JSON.stringify({ accion, comments }),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setMensaje(`¡Solicitud #${id} ${accion === 'aprobar' ? 'aprobada y registrada en Blockchain' : 'rechazada con éxito'}!`);
        await fetchSolicitudes();
      } else {
        setMensaje(`Error al procesar: ${data.message || 'No se pudo completar la acción.'}`);
      }
    } catch (error) {
      setMensaje("Error de conexión con el backend.");
    }
  };

  // 🔍 Filtrar solicitudes dinámicamente
  const solicitudesFiltradas = solicitudes.filter((sol) => {
    const textoBusqueda = busqueda.toLowerCase();
    const nombre = (sol.student_name || "").toLowerCase();
    const idioma = (sol.language || "").toLowerCase();
    const idStr = String(sol.id);
    return nombre.includes(textoBusqueda) || idioma.includes(textoBusqueda) || idStr.includes(textoBusqueda);
  });

  // 📄 Lógica de Paginación
  const indiceUltimoRegistro = paginaActual * registrosPorPagina;
  const indicePrimerRegistro = indiceUltimoRegistro - registrosPorPagina;
  const registrosPaginados = solicitudesFiltradas.slice(indicePrimerRegistro, indiceUltimoRegistro);
  const totalPaginas = Math.ceil(solicitudesFiltradas.length / registrosPorPagina) || 1;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      
      {/* NAVBAR SUPERIOR */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm">
        <div>
          <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-600 rounded-full">
            INDI - Personal Administrativo
          </span>
          <h1 className="text-xl font-bold text-slate-800 mt-1">Bandeja de Solicitudes de Certificados</h1>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-semibold hover:bg-rose-100 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Cerrar Sesión
        </button>
      </header>

      {/* CONTENIDO PRINCIPAL */}
      <main className="p-8 max-w-6xl mx-auto w-full flex-1">
        <p className="text-sm text-slate-500 mb-6">
          Revise y apruebe las solicitudes académicas presentadas por los estudiantes del Instituto de Idiomas.
        </p>

        {mensaje && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm font-medium flex justify-between items-center">
            <span>{mensaje}</span>
            <button onClick={() => setMensaje("")} className="text-emerald-600 hover:text-emerald-900 font-bold ml-4">✕</button>
          </div>
        )}

        {/* 📊 TARJETAS DE ESTADÍSTICAS RÁPIDAS (LAYOUT MEJORADO) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase">Total Solicitudes</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1">{solicitudes.length}</h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">📋</div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase">Pendientes de Revisión</p>
              <h3 className="text-2xl font-bold text-amber-600 mt-1">
                {solicitudes.filter(s => (s.status || "").toUpperCase() === "PENDING" || (s.status || "").toUpperCase() === "PENDIENTE").length}
              </h3>
            </div>
            <div className="p-3 bg-amber-50 text-amber-600 rounded-xl">⏳</div>
          </div>
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-400 uppercase">Aprobadas / Emitidos</p>
              <h3 className="text-2xl font-bold text-emerald-600 mt-1">
                {solicitudes.filter(s => (s.status || "").toUpperCase() === "APPROVED" || (s.status || "").toUpperCase() === "APROBADO").length}
              </h3>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">✅</div>
          </div>
        </div>

        {/* BARRA DE BÚSQUEDA */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="w-full sm:w-96 relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Buscar por ID, estudiante o idioma..."
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPaginaActual(1); // Reiniciar a la página 1 al buscar
              }}
              className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="text-xs text-slate-500">
            Mostrando <span className="font-semibold text-slate-700">{registrosPaginados.length}</span> de <span className="font-semibold text-slate-700">{solicitudesFiltradas.length}</span> registros
          </div>
        </div>

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
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-4">ID</th>
                    <th className="p-4">Estudiante</th>
                    <th className="p-4">Idioma / Nivel</th>
                    <th className="p-4">Estado Actual</th>
                    <th className="p-4 text-right">Acciones / Certificado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
                  {registrosPaginados.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-8 text-slate-400">
                        No se encontraron solicitudes que coincidan con la búsqueda.
                      </td>
                    </tr>
                  ) : (
                    registrosPaginados.map((sol) => {
                      const estadoUpper = (sol.status || "").toUpperCase();
                      const esAprobado = estadoUpper === "APPROVED" || estadoUpper === "APROBADO";
                      const esRechazado = estadoUpper === "REJECTED" || estadoUpper === "RECHAZADO";
                      const codigoCertificado = sol.certificate_code || `INDI-2026-ING-000${sol.id}`;

                      return (
                        <tr key={sol.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-4 font-semibold text-slate-800">#{sol.id}</td>
                          <td className="p-4">{sol.student_name || "Estudiante UNSCH"}</td>
                          <td className="p-4 font-medium text-slate-800">
                            <div>{sol.language || "Inglés"} - {sol.level || "Intermedio"}</div>
                            <div className="text-xs text-slate-500 font-normal">
                              Ciclo: <span className="font-semibold text-slate-700">{sol.subnivel || "Nivel I"}</span> | Año: <span className="font-semibold text-slate-700">{sol.anio || "2026"}</span>
                            </div>
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
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* 📄 CONTROLES DE PAGINACIÓN (ANTERIOR / SIGUIENTE) */}
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Página <span className="font-semibold text-slate-700">{paginaActual}</span> de <span className="font-semibold text-slate-700">{totalPaginas}</span>
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPaginaActual((prev) => Math.max(prev - 1, 1))}
                  disabled={paginaActual === 1}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Anterior
                </button>
                <button
                  onClick={() => setPaginaActual((prev) => Math.min(prev + 1, totalPaginas))}
                  disabled={paginaActual === totalPaginas}
                  className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Siguiente →
                </button>
              </div>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}