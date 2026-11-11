"use client";

import { useState, useEffect } from "react";

interface Certificado {
  id: number;
  certificate_code: string;
  language: string;
  level: string;
  subnivel?: string;
  anio?: string;
  status: string;
}

export default function MisCertificadosPage() {
  const [certificados, setCertificados] = useState<Certificado[]>([]);
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState("");

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

  const getAuthToken = () => {
    try {
      const userData = localStorage.getItem("user");
      if (userData) {
        const parsed = JSON.parse(userData);
        if (parsed.username) return parsed.username;
      }
    } catch (e) {
      console.error("Error al leer usuario", e);
    }
    return "";
  };

  useEffect(() => {
    fetchCertificados();
  }, []);

  const fetchCertificados = async () => {
    try {
      const tokenDni = getAuthToken();
      const res = await fetch(`${apiUrl}/solicitudes/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${tokenDni}`,
        },
        credentials: "include",
      });

      if (!res.ok) throw new Error("Error al cargar datos");
      const data = await res.json();
      
      // Filtramos únicamente las solicitudes aprobadas que ya tienen certificado emitido
      const aprobados = Array.isArray(data) 
        ? data.filter((s: any) => s.status === "APPROVED" || s.status === "ISSUED") 
        : [];
      
      setCertificados(aprobados);
    } catch (error) {
      console.error("Error:", error);
      setMensaje("No se pudieron cargar tus certificados.");
    } finally {
      setLoading(false);
    }
  };

  const handleDescargarPDF = (code: string) => {
    window.open(`${apiUrl}/certificado/${code}/descargar/`, "_blank");
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      {/* Cabecera */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex justify-between items-center">
        <div>
          <span className="text-xs font-semibold px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full">
            INDI - UNSCH
          </span>
          <h1 className="text-2xl font-bold text-slate-800 mt-1">
            Mis Certificados Oficiales
          </h1>
        </div>
      </div>

      {/* Listado */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        <h2 className="text-lg font-semibold text-slate-800">
          Certificados Emitidos y Validados por Blockchain
        </h2>

        {loading ? (
          <p className="text-sm text-slate-500 text-center py-6">Cargando certificados...</p>
        ) : certificados.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <p className="text-sm text-slate-500">
              Aún no tienes certificados aprobados disponibles para descarga.
            </p>
            <p className="text-xs text-slate-400">
              Una vez que el personal del INDI apruebe tus solicitudes, aparecerán aquí automáticamente listos para descargar.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {certificados.map((c) => (
              <div key={c.id} className="py-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-lg">
                      {c.certificate_code || `INDI-2026-000${c.id}`}
                    </span>
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      Aprobado
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-slate-800">
                    {c.language} - {c.level} {c.subnivel ? `(${c.subnivel})` : ""}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Año de estudio: <span className="font-medium text-slate-700">{c.anio || "2026"}</span>
                  </p>
                </div>

                <button
                  onClick={() => handleDescargarPDF(c.certificate_code || `INDI-2026-ING-000${c.id}`)}
                  className="px-4 py-2 bg-emerald-600 text-white text-xs font-medium rounded-xl hover:bg-emerald-700 transition-colors flex items-center gap-2 shadow-sm cursor-pointer"
                >
                  📥 Descargar PDF Oficial
                </button>
              </div>
            ))}
          </div>
        )}

        {mensaje && (
          <p className="text-xs text-center text-rose-600 font-medium">{mensaje}</p>
        )}
      </div>
    </div>
  );
}