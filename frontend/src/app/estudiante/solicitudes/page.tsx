"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

interface Solicitud {
  id: number;
  language: string;
  level: string;
  subnivel?: string;
  anio?: string;
  status: string;
  created_at: string;
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

interface CursoNota {
  curso_id: number;
  curso_nombre: string;
  periodo: string;
  idioma: string;
  nivel: string;
  subnivel: string;
  anio: string;
  promedio_final: number | null;
  aprobado: boolean | null;
  nota_minima_aprobatoria: number;
  precio_certificado?: number;
}

// Muestra 15 en vez de 15.00 y 14.25 tal cual
const fmt = (n: number) => Number(n.toFixed(2)).toString();
const soles = (n: number) => `S/ ${n.toFixed(2)}`;
const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString() : "");
// Para fechas sin hora (AAAA-MM-DD): evita que la zona horaria la corra un día
const fechaSolo = (iso?: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString() : "");

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  AWAITING_PAYMENT: { texto: "Esperando pago", clase: "bg-amber-50 text-amber-700 border-amber-200" },
  PAYMENT_REVIEW: { texto: "Pago en revisión", clase: "bg-blue-50 text-blue-700 border-blue-200" },
  PAYMENT_OBSERVED: { texto: "Pago observado", clase: "bg-rose-50 text-rose-700 border-rose-200" },
  IN_PROCESS: { texto: "En trámite", clase: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  APPROVED: { texto: "Certificado emitido", clase: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  REJECTED: { texto: "Rechazada", clase: "bg-rose-50 text-rose-700 border-rose-200" },
  PENDING: { texto: "Solicitud anterior", clase: "bg-slate-50 text-slate-600 border-slate-200" },
};

const PASOS = ["Solicitud", "Pago", "Validación", "Certificado"];

// En qué paso del trámite está cada estado (5 = todo completado, 0 = sin seguimiento)
const pasoActual = (status: string) => {
  switch (status) {
    case "AWAITING_PAYMENT":
    case "PAYMENT_OBSERVED":
      return 2;
    case "PAYMENT_REVIEW":
      return 3;
    case "IN_PROCESS":
      return 4;
    case "APPROVED":
      return 5;
    default:
      return 0;
  }
};

// Línea de seguimiento: Solicitud → Pago → Validación → Certificado
function Progreso({ status }: { status: string }) {
  const paso = pasoActual(status);
  if (paso === 0) return null;
  const observado = status === "PAYMENT_OBSERVED";

  return (
    <ol className="flex items-start w-full">
      {PASOS.map((nombre, i) => {
        const numero = i + 1;
        const hecho = paso > numero;
        const actual = paso === numero;
        return (
          <li key={nombre} className={`flex items-start ${i < PASOS.length - 1 ? "flex-1" : ""}`}>
            <div className="flex flex-col items-center">
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                  hecho
                    ? "bg-emerald-600 border-emerald-600 text-white"
                    : actual
                    ? observado
                      ? "bg-white border-rose-500 text-rose-600"
                      : "bg-white border-blue-600 text-blue-600"
                    : "bg-white border-slate-200 text-slate-400"
                }`}
              >
                {hecho ? "✓" : numero}
              </span>
              <span
                className={`mt-1 text-[11px] font-medium ${
                  hecho ? "text-emerald-700" : actual ? (observado ? "text-rose-600" : "text-blue-700") : "text-slate-400"
                }`}
              >
                {nombre}
              </span>
            </div>
            {i < PASOS.length - 1 && (
              <div className={`flex-1 h-0.5 mx-2 mt-4 ${paso > numero ? "bg-emerald-600" : "bg-slate-200"}`} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function SolicitudesEstudiantePage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [cursos, setCursos] = useState<CursoNota[]>([]);
  const [cursoSeleccionado, setCursoSeleccionado] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error"; texto: string } | null>(null);
  const [pestana, setPestana] = useState<"tramite" | "emitidos">("tramite");

  // Correo al que se envía el certificado
  const [correo, setCorreo] = useState("");
  const [editandoCorreo, setEditandoCorreo] = useState(false);
  const [correoInput, setCorreoInput] = useState("");
  const [guardandoCorreo, setGuardandoCorreo] = useState(false);

  // Formulario del voucher (por solicitud)
  const [numeros, setNumeros] = useState<Record<number, string>>({});
  const [archivos, setArchivos] = useState<Record<number, File | null>>({});
  const [enviandoPagoId, setEnviandoPagoId] = useState<number | null>(null);

  useEffect(() => {
    cargarDatos();
    cargarCorreo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carga las solicitudes del estudiante y sus cursos con notas (el token se agrega solo)
  const cargarDatos = async () => {
    try {
      const [resSolicitudes, resNotas] = await Promise.all([
        fetch(`${API_URL}/solicitudes/`),
        fetch(`${API_URL}/estudiante/notas/`),
      ]);

      const dataSolicitudes = await resSolicitudes.json();
      const dataNotas = await resNotas.json();

      if (resSolicitudes.ok && Array.isArray(dataSolicitudes)) setSolicitudes(dataSolicitudes);
      if (resNotas.ok && Array.isArray(dataNotas)) setCursos(dataNotas);

      if (!resSolicitudes.ok) {
        setMensaje({ tipo: "error", texto: dataSolicitudes.message || "No se pudieron cargar tus solicitudes." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "No se pudo conectar con el servidor." });
    } finally {
      setCargando(false);
    }
  };

  // Cursos que ya tienen una solicitud en trámite o emitida
  const cursosConSolicitud = new Set(
    solicitudes
      .filter((s) => s.status !== "REJECTED" && s.curso_id)
      .map((s) => s.curso_id as number)
  );

  // Cursos de los que SÍ puede pedir certificado: aprobados y sin solicitud activa
  const cursosElegibles = cursos.filter((c) => c.aprobado === true && !cursosConSolicitud.has(c.curso_id));
  const cursosNoElegibles = cursos.filter((c) => !cursosElegibles.includes(c));

  const motivoNoElegible = (c: CursoNota) => {
    if (cursosConSolicitud.has(c.curso_id)) return "Ya tienes una solicitud para este curso";
    if (c.aprobado === false && c.promedio_final !== null) {
      return `Desaprobado (promedio ${fmt(c.promedio_final)}; mínimo ${fmt(c.nota_minima_aprobatoria)})`;
    }
    return "En curso: aún faltan notas por registrar";
  };

  const seleccionado = cursosElegibles.find((c) => String(c.curso_id) === cursoSeleccionado);
  const precio = cursos.length > 0 && cursos[0].precio_certificado !== undefined ? cursos[0].precio_certificado : 20;

  // Abre un archivo protegido (orden de pago o voucher) en una pestaña nueva
  const abrirArchivo = async (ruta: string, errorTexto: string) => {
    const ventana = window.open("", "_blank");
    try {
      const res = await fetch(`${API_URL}${ruta}`);
      if (!res.ok) {
        ventana?.close();
        const data = await res.json().catch(() => ({}));
        setMensaje({ tipo: "error", texto: data.message || errorTexto });
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

  const handleCrearSolicitud = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cursoSeleccionado) return;
    setEnviando(true);
    setMensaje(null);

    try {
      const res = await fetch(`${API_URL}/solicitudes/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curso_id: Number(cursoSeleccionado) }),
      });

      const data = await res.json();
      if (res.ok) {
        setMensaje({
          tipo: "exito",
          texto: "¡Solicitud creada! Ahora descarga tu orden de pago y sube tu voucher.",
        });
        setCursoSeleccionado("");
        setPestana("tramite");
        await cargarDatos();
      } else {
        setMensaje({ tipo: "error", texto: data.message || "No se pudo crear la solicitud." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error de conexión con el servidor." });
    } finally {
      setEnviando(false);
    }
  };

  const handleEnviarVoucher = async (e: React.FormEvent, id: number) => {
    e.preventDefault();
    const archivo = archivos[id];
    const numero = (numeros[id] || "").trim();

    if (!numero) {
      setMensaje({ tipo: "error", texto: "Ingresa el número de operación que aparece en tu voucher." });
      return;
    }
    if (!archivo) {
      setMensaje({ tipo: "error", texto: "Adjunta la foto o el PDF de tu voucher." });
      return;
    }
    if (archivo.size > 5 * 1024 * 1024) {
      setMensaje({ tipo: "error", texto: "El archivo es demasiado grande (máximo 5 MB)." });
      return;
    }

    setEnviandoPagoId(id);
    setMensaje(null);

    const formData = new FormData();
    formData.append("voucher_pago", archivo);
    formData.append("numero_operacion", numero);

    try {
      const res = await fetch(`${API_URL}/solicitudes/${id}/pago/`, { method: "POST", body: formData });
      const data = await res.json();

      if (res.ok) {
        setMensaje({ tipo: "exito", texto: "¡Voucher enviado! El INDI revisará tu pago." });
        setNumeros((prev) => ({ ...prev, [id]: "" }));
        setArchivos((prev) => ({ ...prev, [id]: null }));
        await cargarDatos();
      } else {
        setMensaje({ tipo: "error", texto: data.message || "No se pudo enviar el voucher." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error de conexión con el servidor." });
    } finally {
      setEnviandoPagoId(null);
    }
  };

  // Reenvía una solicitud rechazada (los datos salen del curso y no se pueden cambiar)
  const handleReenviar = async (id: number) => {
    setMensaje(null);
    try {
      const res = await fetch(`${API_URL}/solicitudes/${id}/rectificar/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setMensaje({ tipo: "exito", texto: "¡Solicitud reenviada! Revisa el paso que te toca." });
        await cargarDatos();
      } else {
        setMensaje({ tipo: "error", texto: data.message || "No se pudo reenviar la solicitud." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error de conexión con el servidor." });
    }
  };

  const cargarCorreo = async () => {
    try {
      const res = await fetch(`${API_URL}/mi-correo/`);
      const data = await res.json();
      if (res.ok) setCorreo(data.correo || "");
    } catch (error) {
      // Si falla, simplemente no se muestra el correo
    }
  };

  const guardarCorreo = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardandoCorreo(true);
    setMensaje(null);
    try {
      const res = await fetch(`${API_URL}/mi-correo/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo: correoInput }),
      });
      const data = await res.json();
      if (res.ok) {
        setCorreo(data.correo);
        setEditandoCorreo(false);
        setMensaje({ tipo: "exito", texto: "Correo guardado. Ahí recibirás tu certificado y los avisos del trámite." });
      } else {
        setMensaje({ tipo: "error", texto: data.message || "No se pudo guardar el correo." });
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error de conexión con el servidor." });
    } finally {
      setGuardandoCorreo(false);
    }
  };

  const enTramite = solicitudes.filter((s) => s.status !== "APPROVED");
  const emitidas = solicitudes.filter((s) => s.status === "APPROVED");
  const lista = pestana === "tramite" ? enTramite : emitidas;

  // Formulario para subir el voucher (se muestra cuando el estudiante debe pagar)
  const formularioVoucher = (s: Solicitud) => (
    <form onSubmit={(e) => handleEnviarVoucher(e, s.id)} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">N° de operación del voucher</label>
        <input
          type="text"
          value={numeros[s.id] || ""}
          onChange={(e) => setNumeros((prev) => ({ ...prev, [s.id]: e.target.value }))}
          placeholder="Ej. 12345678"
          maxLength={30}
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-xs font-semibold text-slate-600 mb-1">Foto o PDF del voucher (máx. 5 MB)</label>
        <input
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          onChange={(e) =>
            setArchivos((prev) => ({ ...prev, [s.id]: e.target.files ? e.target.files[0] : null }))
          }
          className="w-full text-xs text-slate-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 bg-white border border-slate-200 rounded-xl p-1"
        />
      </div>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={enviandoPagoId === s.id}
          className="w-full sm:w-auto px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          {enviandoPagoId === s.id ? "Enviando..." : "Enviar voucher"}
        </button>
      </div>
    </form>
  );

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
              Certificados de Curso
            </h1>
            <p className="text-sm text-slate-500 mt-1">Solicita tu certificado y sigue el trámite paso a paso.</p>
          </div>
          <Link
            href="/"
            className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            ← Ir a Verificación
          </Link>
        </div>

        {/* Cómo funciona */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800 mb-4">¿Cómo obtengo mi certificado?</h2>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[
              { n: 1, t: "Solicita", d: "Elige el curso que aprobaste." },
              { n: 2, t: "Paga", d: `Paga ${soles(precio)} en Interbank y sube tu voucher.` },
              { n: 3, t: "Validación", d: "El INDI revisa tu pago." },
              { n: 4, t: "Recibe", d: "Te llega a tu correo y lo descargas desde aquí." },
            ].map((p) => (
              <div key={p.n} className="flex sm:flex-col gap-3 sm:gap-2">
                <span className="w-7 h-7 shrink-0 rounded-full bg-blue-50 text-blue-700 text-xs font-bold flex items-center justify-center">
                  {p.n}
                </span>
                <div>
                  <p className="text-sm font-semibold text-slate-800">{p.t}</p>
                  <p className="text-xs text-slate-500">{p.d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {mensaje && (
          <div
            className={`p-4 rounded-xl text-sm font-medium ${
              mensaje.tipo === "exito"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-rose-50 text-rose-700 border border-rose-200"
            }`}
          >
            {mensaje.texto}
          </div>
        )}

        {/* Correo donde se recibe el certificado */}
        <div
          className={`p-5 rounded-2xl border ${
            correo ? "bg-white border-slate-100 shadow-sm" : "bg-amber-50 border-amber-200"
          }`}
        >
          {editandoCorreo || !correo ? (
            <form onSubmit={guardarCorreo} className="space-y-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {correo ? "Cambiar mi correo" : "Agrega tu correo para recibir tu certificado"}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cuando el INDI emita tu certificado te lo enviaremos en PDF. También te avisaremos si tu pago es observado.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  required
                  value={correoInput}
                  onChange={(e) => setCorreoInput(e.target.value)}
                  placeholder="tucorreo@ejemplo.com"
                  className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={guardandoCorreo}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {guardandoCorreo ? "Guardando..." : "Guardar correo"}
                </button>
                {correo && (
                  <button
                    type="button"
                    onClick={() => setEditandoCorreo(false)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-sm hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-sm text-slate-600">
                📧 Recibirás tu certificado y los avisos del trámite en{" "}
                <span className="font-semibold text-slate-800">{correo}</span>
              </p>
              <button
                type="button"
                onClick={() => {
                  setCorreoInput(correo);
                  setEditandoCorreo(true);
                }}
                className="text-xs font-semibold text-blue-600 hover:underline self-start sm:self-auto"
              >
                Cambiar
              </button>
            </div>
          )}
        </div>

        {/* Nueva solicitud: se elige un curso aprobado */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Solicitar Certificado de un Curso Aprobado</h2>
            <p className="text-sm text-slate-500 mt-1">
              Solo puedes pedir el certificado de un curso en el que aprobaste. El idioma, nivel, ciclo y año se toman del curso.
            </p>
          </div>

          {cargando ? (
            <p className="text-sm text-slate-500">Cargando tus cursos...</p>
          ) : cursosElegibles.length === 0 ? (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-600">
              {cursos.length === 0 ? (
                <>
                  Todavía no estás matriculado en ningún curso. Puedes inscribirte en{" "}
                  <Link href="/estudiante/matricula" className="text-blue-600 hover:underline">
                    Inscripción a Cursos
                  </Link>
                  .
                </>
              ) : (
                <>
                  No tienes cursos aprobados disponibles para solicitar. Revisa tus calificaciones en{" "}
                  <Link href="/estudiante/notas" className="text-blue-600 hover:underline">
                    Mis Notas y Promedios
                  </Link>
                  .
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleCrearSolicitud} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1">Curso aprobado</label>
                <select
                  value={cursoSeleccionado}
                  onChange={(e) => setCursoSeleccionado(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  <option value="">-- Elige el curso --</option>
                  {cursosElegibles.map((c) => (
                    <option key={c.curso_id} value={c.curso_id}>
                      {c.curso_nombre} · Promedio {c.promedio_final !== null ? fmt(c.promedio_final) : "-"}
                    </option>
                  ))}
                </select>
              </div>

              {seleccionado && (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-slate-700 space-y-2">
                  <p className="font-semibold text-blue-800">Tu certificado dirá:</p>
                  <p>
                    Idioma: <span className="font-semibold">{seleccionado.idioma}</span> · Nivel:{" "}
                    <span className="font-semibold">{seleccionado.nivel}</span> · Ciclo:{" "}
                    <span className="font-semibold">{seleccionado.subnivel}</span> · Año:{" "}
                    <span className="font-semibold">{seleccionado.anio}</span>
                  </p>
                  <p className="pt-2 border-t border-blue-100">
                    Costo del certificado: <span className="font-bold text-blue-900">{soles(precio)}</span>. Después de
                    solicitarlo podrás descargar tu orden de pago.
                  </p>
                </div>
              )}

              <button
                type="submit"
                disabled={enviando || !cursoSeleccionado}
                className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {enviando ? "Creando solicitud..." : "Solicitar certificado"}
              </button>
            </form>
          )}

          {/* Cursos que todavía no se pueden solicitar, con el motivo */}
          {!cargando && cursosNoElegibles.length > 0 && (
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Cursos que aún no puedes solicitar
              </p>
              {cursosNoElegibles.map((c) => (
                <div key={c.curso_id} className="flex flex-col sm:flex-row sm:justify-between text-xs text-slate-500 gap-1">
                  <span className="font-medium text-slate-700">{c.curso_nombre}</span>
                  <span>{motivoNoElegible(c)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mis trámites */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">Mis Trámites</h2>
            <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold">
              <button
                onClick={() => setPestana("tramite")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  pestana === "tramite" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                En trámite ({enTramite.length})
              </button>
              <button
                onClick={() => setPestana("emitidos")}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  pestana === "emitidos" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                Certificados emitidos ({emitidas.length})
              </button>
            </div>
          </div>

          {lista.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-100 text-center text-sm text-slate-500">
              {pestana === "tramite"
                ? "No tienes trámites en curso. Cuando solicites un certificado aparecerá aquí."
                : "Todavía no tienes certificados emitidos."}
            </div>
          ) : (
            lista.map((s) => {
              const estado = ESTADOS[s.status] || { texto: s.status, clase: "bg-slate-50 text-slate-600 border-slate-200" };
              const monto = s.monto && s.monto > 0 ? s.monto : precio;

              return (
                <div key={s.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-5">
                  <div className="flex flex-col sm:flex-row sm:justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-400">
                        Solicitud #{s.id} · {fecha(s.created_at)}
                      </p>
                      <h3 className="text-base font-semibold text-slate-800">
                        {s.curso_nombre || "Solicitud anterior"}
                      </h3>
                      <p className="text-xs text-slate-500">
                        {s.language} · {s.level} · {s.subnivel || "Nivel I"} · Año {s.anio || "—"}
                      </p>
                    </div>
                    <span className={`self-start px-3 py-1 rounded-full text-xs font-semibold border ${estado.clase}`}>
                      {estado.texto}
                    </span>
                  </div>

                  <Progreso status={s.status} />

                  {/* Paso que le toca al estudiante */}
                  {s.status === "AWAITING_PAYMENT" && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-amber-900">
                          Siguiente paso: paga {soles(monto)} y sube tu voucher
                        </p>
                        <ol className="text-xs text-amber-800 mt-1 list-decimal list-inside space-y-0.5">
                          <li>Descarga tu orden de pago.</li>
                          <li>Págala en un agente Interbank presentando tu DNI.</li>
                          <li>Sube aquí la foto o el PDF de tu voucher y su número de operación.</li>
                        </ol>
                      </div>
                      <button
                        type="button"
                        onClick={() => abrirArchivo(`/solicitudes/${s.id}/orden-pago/`, "No se pudo abrir la orden de pago.")}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-semibold transition-colors"
                      >
                        📄 Descargar orden de pago
                      </button>
                      {formularioVoucher(s)}
                    </div>
                  )}

                  {s.status === "PAYMENT_OBSERVED" && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 space-y-4">
                      <div>
                        <p className="text-sm font-semibold text-rose-900">El INDI observó tu pago</p>
                        <p className="text-sm text-rose-800 mt-1">
                          <span className="font-semibold">Motivo:</span>{" "}
                          {s.comentarios_pago || "No se especificó un motivo."}
                        </p>
                        <p className="text-xs text-rose-700 mt-1">Corrige el problema y vuelve a subir tu voucher.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => abrirArchivo(`/solicitudes/${s.id}/orden-pago/`, "No se pudo abrir la orden de pago.")}
                        className="px-4 py-2 border border-rose-200 bg-white text-rose-700 rounded-xl text-sm font-semibold hover:bg-rose-50 transition-colors"
                      >
                        📄 Descargar orden de pago
                      </button>
                      {formularioVoucher(s)}
                    </div>
                  )}

                  {s.status === "PAYMENT_REVIEW" && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-blue-900">Tu voucher está en revisión</p>
                        <p className="text-xs text-blue-800 mt-1">
                          Operación N° {s.numero_operacion}
                          {s.pago_enviado_en ? ` · enviado el ${fecha(s.pago_enviado_en)}` : ""}. El INDI validará tu
                          pago; no necesitas hacer nada más.
                        </p>
                        {s.fecha_limite && (
                          <p className="text-xs font-semibold text-blue-900 mt-1">
                            Entrega estimada: hasta el {fechaSolo(s.fecha_limite)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => abrirArchivo(`/solicitudes/${s.id}/voucher/`, "No se pudo abrir el voucher.")}
                        className="px-4 py-2 border border-blue-200 bg-white text-blue-700 rounded-xl text-sm font-semibold hover:bg-blue-50 transition-colors shrink-0"
                      >
                        Ver mi voucher
                      </button>
                    </div>
                  )}

                  {s.status === "IN_PROCESS" && (
                    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
                      <p className="text-sm font-semibold text-indigo-900">Pago validado</p>
                      <p className="text-xs text-indigo-800 mt-1">
                        El INDI está preparando tu certificado. Cuando esté listo te llegará a tu correo y podrás
                        descargarlo desde esta pantalla.
                      </p>
                      {s.fecha_limite && (
                        <p className="text-xs font-semibold text-indigo-900 mt-1">
                          Entrega estimada: hasta el {fechaSolo(s.fecha_limite)}
                        </p>
                      )}
                    </div>
                  )}

                  {s.status === "APPROVED" &&
                    (s.certificate_status === "REVOKED" ? (
                      <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4">
                        <p className="text-sm font-semibold text-rose-900">Este certificado fue revocado</p>
                        <p className="text-xs text-rose-800 mt-1">
                          Código {s.certificate_code}. Comunícate con el INDI para más información.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-emerald-900">🎓 Tu certificado está listo</p>
                          <p className="text-xs text-emerald-800 mt-1">
                            Código <span className="font-mono font-semibold">{s.certificate_code || "—"}</span>. Cualquier
                            persona puede comprobar su autenticidad con ese código o escaneando el QR del documento.
                          </p>
                          {s.certificado_enviado_en && (
                            <p className="text-xs font-semibold text-emerald-900 mt-1">
                              📧 Te lo enviamos a tu correo el {fecha(s.certificado_enviado_en)}.
                            </p>
                          )}
                        </div>
                        {s.certificate_code && (
                          <div className="flex gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => window.open(`${API_URL}/certificado/${s.certificate_code}/descargar/`, "_blank")}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold transition-colors"
                            >
                              📥 Descargar certificado
                            </button>
                            <Link
                              href={`/verificar/${s.certificate_code}`}
                              target="_blank"
                              className="px-4 py-2 border border-emerald-200 bg-white text-emerald-700 rounded-xl text-sm font-semibold hover:bg-emerald-50 transition-colors"
                            >
                              Verificar
                            </Link>
                          </div>
                        )}
                      </div>
                    ))}

                  {s.status === "REJECTED" && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 space-y-3">
                      <div>
                        <p className="text-sm font-semibold text-rose-900">Solicitud rechazada</p>
                        <p className="text-sm text-rose-800 mt-1">
                          <span className="font-semibold">Motivo:</span>{" "}
                          {s.review_comments || "No se especificó un motivo."}
                        </p>
                      </div>
                      {s.curso_id ? (
                        <button
                          onClick={() => handleReenviar(s.id)}
                          className="px-4 py-2 bg-rose-600 text-white font-semibold rounded-xl text-sm hover:bg-rose-700 transition-colors"
                        >
                          🔄 Reenviar solicitud
                        </button>
                      ) : (
                        <p className="text-xs text-rose-700">
                          Esta solicitud es anterior al nuevo proceso. Crea una nueva eligiendo el curso que aprobaste.
                        </p>
                      )}
                    </div>
                  )}

                  {s.status === "PENDING" && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                      Esta solicitud es anterior al nuevo proceso de pago. Crea una nueva solicitud eligiendo el curso
                      que aprobaste.
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>
    </main>
  );
}