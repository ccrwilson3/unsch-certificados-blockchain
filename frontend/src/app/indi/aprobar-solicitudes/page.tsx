"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

interface Solicitud {
  id: number;
  student_name?: string;
  language?: string;
  level?: string;
  subnivel?: string;
  anio?: string;
  status: string;
  created_at?: string;
  review_comments?: string;
  curso_id?: number | null;
  curso_nombre?: string | null;
  promedio_final?: number | null;
  monto?: number;
  numero_operacion?: string;
  tiene_voucher?: boolean;
  pago_enviado_en?: string | null;
  pago_revisado_en?: string | null;
  comentarios_pago?: string;
  certificate_code?: string | null;
  certificate_status?: string | null;
  certificado_enviado_en?: string | null;
  fecha_limite?: string | null;
  atrasada?: boolean;
}

type Etapa = "TODAS" | "REVISAR_PAGO" | "EMITIR" | "ESPERANDO" | "EMITIDOS" | "RECHAZADAS";

// A qué etapa de la bandeja pertenece cada estado de la solicitud
const ETAPA_DE: Record<string, Etapa> = {
  PAYMENT_REVIEW: "REVISAR_PAGO",
  IN_PROCESS: "EMITIR",
  AWAITING_PAYMENT: "ESPERANDO",
  PAYMENT_OBSERVED: "ESPERANDO",
  PENDING: "ESPERANDO",
  APPROVED: "EMITIDOS",
  REJECTED: "RECHAZADAS",
};

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  AWAITING_PAYMENT: { texto: "Esperando pago", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  PAYMENT_REVIEW: { texto: "Pago en revisión", clase: "bg-blue-50 text-blue-700 border-blue-200" },
  PAYMENT_OBSERVED: { texto: "Pago observado", clase: "bg-rose-50 text-rose-700 border-rose-200" },
  IN_PROCESS: { texto: "Listo para emitir", clase: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  APPROVED: { texto: "Emitido", clase: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REJECTED: { texto: "Rechazada", clase: "bg-rose-50 text-rose-700 border-rose-200" },
  PENDING: { texto: "Solicitud anterior", clase: "bg-slate-50 text-slate-600 border-slate-200" },
};

const AYUDA_ETAPA: Record<Etapa, string> = {
  TODAS: "Todas las solicitudes de certificado.",
  REVISAR_PAGO: "Compara el monto, el DNI y el número de operación del voucher antes de validar el pago.",
  EMITIR: "El pago ya fue validado. Al emitir, el certificado se registra en la blockchain y queda disponible para el estudiante.",
  ESPERANDO: "Estas solicitudes esperan una acción del estudiante (pagar o corregir su voucher).",
  EMITIDOS: "Certificados ya emitidos. Desde aquí puedes verlos o revocarlos.",
  RECHAZADAS: "Solicitudes rechazadas. El estudiante puede reenviarlas si corresponde.",
};

const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "");
// Para fechas sin hora (AAAA-MM-DD): evita que la zona horaria la corra un día
const fechaSolo = (iso?: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString() : "");

export default function AprobarSolicitudesPage() {
  const router = useRouter();
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [etapa, setEtapa] = useState<Etapa>("TODAS");
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [soloAtrasadas, setSoloAtrasadas] = useState(false);

  // 📄 Estados para la Paginación
  const [paginaActual, setPaginaActual] = useState(1);
  const registrosPorPagina = 10;

  const fetchSolicitudes = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/solicitudes/`, { method: "GET", cache: "no-store" });

      if (res.ok) {
        const data = await res.json();
        const lista: Solicitud[] = Array.isArray(data) ? data : [];
        setSolicitudes(lista);

        // Al entrar, se muestra directamente la etapa que tiene trabajo pendiente
        if (primeraCarga) {
          const hayPagos = lista.some((s) => s.status === "PAYMENT_REVIEW");
          const hayEmitir = lista.some((s) => s.status === "IN_PROCESS");
          setEtapa(hayPagos ? "REVISAR_PAGO" : hayEmitir ? "EMITIR" : "TODAS");
          setPrimeraCarga(false);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setMensaje({ tipo: "error", texto: data.message || "No se pudieron cargar las solicitudes." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error de conexión al cargar las solicitudes." });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSolicitudes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    router.push("/login");
  };

  // Abre el voucher (archivo protegido) en una pestaña nueva
  const verVoucher = async (id: number) => {
    const ventana = window.open("", "_blank");
    try {
      const res = await fetch(`${API_URL}/solicitudes/${id}/voucher/`);
      if (!res.ok) {
        ventana?.close();
        const data = await res.json().catch(() => ({}));
        setMensaje({ tipo: "error", texto: data.message || "No se pudo abrir el voucher." });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (ventana) {
        ventana.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (error) {
      ventana?.close();
      setMensaje({ tipo: "error", texto: "Error de conexión con el servidor." });
    }
  };

  // Envía una acción al servidor y muestra el resultado
  const ejecutar = async (ruta: string, cuerpo: object, textoExito: string) => {
    setMensaje(null);
    try {
      const res = await fetch(`${API_URL}${ruta}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setMensaje({ tipo: "exito", texto: data.message || textoExito });
        await fetchSolicitudes();
      } else {
        setMensaje({ tipo: "error", texto: data.message || "No se pudo completar la acción." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error de conexión con el backend." });
    }
  };

  // ✅ Valida el pago: la solicitud pasa a "Listo para emitir"
  const validarPago = (s: Solicitud) => {
    if (!confirm(`¿Validar el pago de ${s.student_name || "el estudiante"} (operación ${s.numero_operacion})?`)) return;
    ejecutar(`/solicitudes/${s.id}/revisar-pago/`, { accion: "aprobar" }, `Pago de la solicitud #${s.id} validado.`);
  };

  // ⚠️ Observa el pago: el estudiante deberá subir otro voucher
  const observarPago = (s: Solicitud) => {
    const motivo = prompt("Indica el motivo de la observación (el estudiante lo verá). Ej: el monto no es S/ 20.00:");
    if (motivo === null) return;
    if (!motivo.trim()) {
      setMensaje({ tipo: "error", texto: "Debes indicar el motivo de la observación." });
      return;
    }
    ejecutar(
      `/solicitudes/${s.id}/revisar-pago/`,
      { accion: "observar", comments: motivo.trim() },
      `Pago de la solicitud #${s.id} observado. El estudiante deberá subir otro voucher.`
    );
  };

  // 🎓 Emite el certificado y lo registra en la blockchain
  const emitirCertificado = (s: Solicitud) => {
    if (
      !confirm(
        `¿Emitir el certificado de ${s.student_name || "el estudiante"}?\n\nSe registrará en la blockchain y quedará disponible para el estudiante.`
      )
    )
      return;
    ejecutar(
      `/solicitudes/${s.id}/aprobar/`,
      { accion: "aprobar" },
      `Certificado de la solicitud #${s.id} emitido y registrado en la blockchain.`
    );
  };

  // ❌ Rechaza la solicitud
  const rechazar = (s: Solicitud) => {
    const motivo = prompt("Ingresa el motivo del rechazo (el estudiante lo verá):");
    if (motivo === null) return;
    ejecutar(
      `/solicitudes/${s.id}/aprobar/`,
      { accion: "rechazar", comments: motivo.trim() || "Rechazado por el INDI sin motivo especificado." },
      `Solicitud #${s.id} rechazada.`
    );
  };

  // 🚫 Revoca un certificado ya emitido (queda registrado en la blockchain)
  const revocar = (codigo: string) => {
    const motivo = prompt(`Ingrese el motivo de la revocación del certificado ${codigo}:`);
    if (motivo === null) return;
    if (!motivo.trim()) {
      setMensaje({ tipo: "error", texto: "Debe indicar un motivo para revocar el certificado." });
      return;
    }
    if (!confirm(`¿Revocar el certificado ${codigo}?\n\nEsta acción es irreversible y queda registrada en la blockchain.`)) return;
    ejecutar(`/certificado/${codigo}/revocar/`, { reason: motivo.trim() }, `Certificado ${codigo} revocado.`);
  };

  // 📧 Reenvía el certificado por correo al estudiante
  const reenviarCorreo = (s: Solicitud) => {
    if (!confirm(`¿Reenviar el certificado de ${s.student_name || "el estudiante"} a su correo?`)) return;
    ejecutar(`/solicitudes/${s.id}/reenviar-correo/`, {}, "Correo enviado.");
  };

  // Solicitudes que ya superaron el plazo de entrega
  const atrasadas = solicitudes.filter((s) => s.atrasada);

  // Conteo por etapa
  const cuenta = (e: Etapa) =>
    e === "TODAS" ? solicitudes.length : solicitudes.filter((s) => ETAPA_DE[s.status] === e).length;

  // 🔍 Filtrar por etapa y búsqueda
  const solicitudesFiltradas = solicitudes.filter((s) => {
    if (etapa !== "TODAS" && ETAPA_DE[s.status] !== etapa) return false;
    if (soloAtrasadas && !s.atrasada) return false;
    const texto = busqueda.toLowerCase();
    if (!texto) return true;
    return (
      (s.student_name || "").toLowerCase().includes(texto) ||
      (s.curso_nombre || "").toLowerCase().includes(texto) ||
      (s.language || "").toLowerCase().includes(texto) ||
      (s.numero_operacion || "").toLowerCase().includes(texto) ||
      String(s.id).includes(texto)
    );
  });

  // 📄 Lógica de Paginación
  const indiceUltimoRegistro = paginaActual * registrosPorPagina;
  const indicePrimerRegistro = indiceUltimoRegistro - registrosPorPagina;
  const registrosPaginados = solicitudesFiltradas.slice(indicePrimerRegistro, indiceUltimoRegistro);
  const totalPaginas = Math.ceil(solicitudesFiltradas.length / registrosPorPagina) || 1;

  const tarjetas: { id: Etapa; titulo: string; color: string; activo: string }[] = [
    { id: "REVISAR_PAGO", titulo: "Pagos por revisar", color: "text-blue-600", activo: "ring-blue-500" },
    { id: "EMITIR", titulo: "Listos para emitir", color: "text-indigo-600", activo: "ring-indigo-500" },
    { id: "ESPERANDO", titulo: "Esperando al estudiante", color: "text-amber-600", activo: "ring-amber-500" },
    { id: "EMITIDOS", titulo: "Emitidos", color: "text-emerald-600", activo: "ring-emerald-500" },
    { id: "RECHAZADAS", titulo: "Rechazadas", color: "text-rose-600", activo: "ring-rose-500" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* NAVBAR SUPERIOR */}
      <header className="bg-white border-b border-slate-200 px-8 py-4 flex justify-between items-center shadow-sm">
        <div>
          <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-600 rounded-full">
            INDI - Personal Administrativo
          </span>
          <h1 className="text-xl font-bold text-slate-800 mt-1">Trámite de Certificados</h1>
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
          Revisa los pagos de los estudiantes y emite sus certificados. Cada solicitud avanza por etapas: pago, validación y emisión.
        </p>

        {mensaje && (
          <div
            className={`mb-6 p-4 rounded-xl text-sm font-medium flex justify-between items-center border ${
              mensaje.tipo === "exito"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-rose-50 border-rose-200 text-rose-800"
            }`}
          >
            <span>{mensaje.texto}</span>
            <button onClick={() => setMensaje(null)} className="font-bold ml-4 opacity-70 hover:opacity-100">✕</button>
          </div>
        )}

        {/* ⏰ Aviso de solicitudes fuera de plazo */}
        {atrasadas.length > 0 && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span>
              ⏰ <strong>{atrasadas.length}</strong>{" "}
              {atrasadas.length === 1 ? "solicitud superó" : "solicitudes superaron"} el plazo de entrega. Conviene
              atenderlas primero.
            </span>
            <button
              onClick={() => {
                if (!soloAtrasadas) setEtapa("TODAS");
                setSoloAtrasadas(!soloAtrasadas);
                setPaginaActual(1);
              }}
              className="px-3 py-1.5 bg-white border border-rose-200 text-rose-700 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors self-start sm:self-auto"
            >
              {soloAtrasadas ? "Ver todas" : "Ver atrasadas"}
            </button>
          </div>
        )}

        {/* 📊 ETAPAS DEL TRÁMITE (se pueden pulsar para filtrar) */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
          {tarjetas.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setEtapa(etapa === t.id ? "TODAS" : t.id);
                setPaginaActual(1);
              }}
              className={`text-left bg-white p-4 rounded-2xl shadow-sm border border-slate-200 transition-all hover:shadow-md ${
                etapa === t.id ? `ring-2 ${t.activo}` : ""
              }`}
            >
              <p className="text-[11px] font-semibold text-slate-400 uppercase leading-tight">{t.titulo}</p>
              <p className={`text-2xl font-bold mt-1 ${t.color}`}>{cuenta(t.id)}</p>
            </button>
          ))}
        </div>

        {/* BARRA DE BÚSQUEDA */}
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-2 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="w-full sm:w-96 relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input
              type="text"
              placeholder="Buscar por estudiante, curso, operación o N° de solicitud..."
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setPaginaActual(1);
              }}
              className="w-full pl-10 pr-4 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="text-xs text-slate-500">
            Mostrando <span className="font-semibold text-slate-700">{registrosPaginados.length}</span> de{" "}
            <span className="font-semibold text-slate-700">{solicitudesFiltradas.length}</span> solicitudes
            {etapa !== "TODAS" && (
              <button onClick={() => setEtapa("TODAS")} className="ml-3 text-blue-600 hover:underline font-semibold">
                Ver todas
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-6 px-1">{AYUDA_ETAPA[etapa]}</p>

        {loading ? (
          <div className="text-center py-12 text-slate-500">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-blue-600 border-t-transparent mb-2"></div>
            <p>Cargando solicitudes desde el servidor...</p>
          </div>
        ) : solicitudes.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
            Todavía no hay solicitudes de certificado.
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <tr>
                    <th className="p-4">Solicitud</th>
                    <th className="p-4">Estudiante</th>
                    <th className="p-4">Certificado</th>
                    <th className="p-4">Pago</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
                  {registrosPaginados.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400">
                        No hay solicitudes en esta etapa{busqueda ? " con esa búsqueda" : ""}.
                      </td>
                    </tr>
                  ) : (
                    registrosPaginados.map((s) => {
                      const estado = ESTADOS[s.status] || { texto: s.status, clase: "bg-slate-50 text-slate-600 border-slate-200" };
                      const revocado = s.certificate_status === "REVOKED";

                      return (
                        <tr key={s.id} className="hover:bg-slate-50/50 transition-colors align-top">
                          <td className="p-4">
                            <div className="font-semibold text-slate-800">#{s.id}</div>
                            <div className="text-xs text-slate-400">{fecha(s.created_at)}</div>
                          </td>
                          <td className="p-4">{s.student_name || "Estudiante UNSCH"}</td>
                          <td className="p-4 font-medium text-slate-800">
                            <div>{s.language || "—"} - {s.level || "—"}</div>
                            <div className="text-xs text-slate-500 font-normal">
                              Ciclo: <span className="font-semibold text-slate-700">{s.subnivel || "Nivel I"}</span> | Año:{" "}
                              <span className="font-semibold text-slate-700">{s.anio || "—"}</span>
                            </div>
                            {s.curso_nombre ? (
                              <div className="text-xs text-slate-500 font-normal mt-0.5">
                                Curso: <span className="font-semibold text-slate-700">{s.curso_nombre}</span>
                                {s.promedio_final !== null && s.promedio_final !== undefined && (
                                  <>
                                    {" "}| Promedio:{" "}
                                    <span className="font-semibold text-slate-700">
                                      {Number(Number(s.promedio_final).toFixed(2))}
                                    </span>
                                  </>
                                )}
                              </div>
                            ) : (
                              <div className="text-xs text-amber-600 font-normal mt-0.5">
                                Solicitud anterior (sin curso asociado)
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-xs">
                            <div className="font-semibold text-slate-700">
                              S/ {Number(s.monto || 0).toFixed(2)}
                            </div>
                            {s.numero_operacion ? (
                              <>
                                <div className="text-slate-500">
                                  Operación: <span className="font-mono text-slate-700">{s.numero_operacion}</span>
                                </div>
                                {s.pago_enviado_en && (
                                  <div className="text-slate-400">Enviado el {fecha(s.pago_enviado_en)}</div>
                                )}
                              </>
                            ) : (
                              <div className="text-slate-400">Sin voucher</div>
                            )}
                            {s.tiene_voucher && (
                              <button
                                onClick={() => verVoucher(s.id)}
                                className="mt-1 text-blue-600 hover:underline font-semibold"
                              >
                                Ver voucher
                              </button>
                            )}
                          </td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 text-xs font-bold rounded-full border whitespace-nowrap ${estado.clase}`}>
                              {estado.texto}
                            </span>
                            {s.status === "PAYMENT_OBSERVED" && s.comentarios_pago && (
                              <div className="mt-1 text-xs text-rose-600 max-w-[200px]">Motivo: {s.comentarios_pago}</div>
                            )}
                            {s.status === "REJECTED" && s.review_comments && (
                              <div className="mt-1 text-xs text-rose-600 max-w-[200px]">Motivo: {s.review_comments}</div>
                            )}
                            {revocado && (
                              <div className="mt-1 text-xs font-bold text-rose-700">CERTIFICADO REVOCADO</div>
                            )}
                            {s.fecha_limite && (
                              <div
                                className={`mt-1 text-xs ${
                                  s.atrasada ? "font-bold text-rose-600" : "text-slate-400"
                                }`}
                              >
                                {s.atrasada ? "⏰ Atrasada · venció el " : "Plazo: hasta el "}
                                {fechaSolo(s.fecha_limite)}
                              </div>
                            )}
                            {s.status === "APPROVED" && !revocado && (
                              <div className="mt-1 text-xs text-slate-400">
                                {s.certificado_enviado_en
                                  ? `📧 Enviado el ${fecha(s.certificado_enviado_en)}`
                                  : "📧 Sin enviar por correo"}
                              </div>
                            )}
                          </td>
                          <td className="p-4 text-right">
                            <div className="flex flex-wrap justify-end gap-2">
                              {s.status === "PAYMENT_REVIEW" && (
                                <>
                                  <button
                                    onClick={() => validarPago(s)}
                                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors"
                                  >
                                    Validar pago
                                  </button>
                                  <button
                                    onClick={() => observarPago(s)}
                                    className="px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-xs font-semibold hover:bg-amber-100 transition-colors"
                                  >
                                    Observar
                                  </button>
                                </>
                              )}

                              {s.status === "IN_PROCESS" && (
                                <>
                                  <button
                                    onClick={() => emitirCertificado(s)}
                                    className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 transition-colors"
                                  >
                                    Emitir certificado
                                  </button>
                                  <button
                                    onClick={() => rechazar(s)}
                                    className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors"
                                  >
                                    Rechazar
                                  </button>
                                </>
                              )}

                              {(s.status === "AWAITING_PAYMENT" || s.status === "PAYMENT_OBSERVED" || s.status === "PENDING") && (
                                <>
                                  <span className="text-xs text-slate-400 italic self-center">Esperando al estudiante</span>
                                  <button
                                    onClick={() => rechazar(s)}
                                    className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors"
                                  >
                                    Rechazar
                                  </button>
                                </>
                              )}

                              {s.status === "APPROVED" &&
                                (!s.certificate_code ? (
                                  <span className="text-xs text-slate-400 italic">Certificado no disponible</span>
                                ) : revocado ? (
                                  <span className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold">
                                    🚫 Revocado
                                  </span>
                                ) : (
                                  <>
                                    <a
                                      href={`${API_URL}/certificado/${s.certificate_code}/descargar/`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors"
                                    >
                                      📄 Ver certificado
                                    </a>
                                    <button
                                      onClick={() => reenviarCorreo(s)}
                                      className="px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
                                    >
                                      📧 Reenviar correo
                                    </button>
                                    <button
                                      onClick={() => revocar(s.certificate_code as string)}
                                      className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100 transition-colors"
                                    >
                                      Revocar
                                    </button>
                                  </>
                                ))}

                              {s.status === "REJECTED" && (
                                <span className="text-xs text-slate-400 italic">Solicitud rechazada</span>
                              )}
                            </div>
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
                Página <span className="font-semibold text-slate-700">{paginaActual}</span> de{" "}
                <span className="font-semibold text-slate-700">{totalPaginas}</span>
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