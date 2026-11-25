"use client";

import { useState } from "react";
import { API_URL, abrirArchivoProtegido } from "../lib/abrirArchivo";
import {
  ActaDatos, ESTILO_ESTADO, TEXTO_EVENTO, fechaCorta, fechaHora,
} from "../lib/actas";

type Accion = "firmar_docente" | "observar" | "firmar_direccion" | "reabrir" | "ampliar_plazo";

const CONFIG: Record<Accion, { titulo: string; boton: string; pide_clave: boolean; pide_texto?: string; obligatorio?: boolean; aviso?: string; estilo: string }> = {
  firmar_docente: {
    titulo: "Firmar y enviar el acta",
    boton: "Firmar acta",
    pide_clave: true,
    aviso: "Al firmar, las notas quedan bloqueadas y el acta pasa al INDI para su revisión. Revisa bien: no podrás cambiarlas salvo que el INDI te la devuelva.",
    estilo: "bg-emerald-600 hover:bg-emerald-700",
  },
  observar: {
    titulo: "Devolver el acta al docente",
    boton: "Devolver con observación",
    pide_clave: false,
    pide_texto: "¿Qué debe corregir el docente?",
    obligatorio: true,
    estilo: "bg-amber-600 hover:bg-amber-700",
  },
  firmar_direccion: {
    titulo: "Firmar como Dirección del INDI",
    boton: "Firmar y cerrar acta",
    pide_clave: true,
    pide_texto: "Comentario (opcional)",
    aviso: "Con tu firma el acta queda cerrada: ya nadie podrá modificar las notas, ni el docente.",
    estilo: "bg-emerald-600 hover:bg-emerald-700",
  },
  reabrir: {
    titulo: "Reabrir el acta para corregir",
    boton: "Reabrir acta",
    pide_clave: true,
    pide_texto: "Motivo de la corrección (queda registrado)",
    obligatorio: true,
    aviso: "El acta volverá al docente, que deberá corregir y firmar de nuevo; después tendrá que firmarla otra vez la Dirección.",
    estilo: "bg-rose-600 hover:bg-rose-700",
  },
  ampliar_plazo: {
    titulo: "Ampliar el plazo del docente",
    boton: "Ampliar plazo",
    pide_clave: false,
    pide_texto: "Motivo (opcional)",
    estilo: "bg-indigo-600 hover:bg-indigo-700",
  },
};

export default function ActaPanel({
  cursoId, datos, onCambio,
}: { cursoId: number | string; datos: ActaDatos; onCambio: () => void }) {
  const [accion, setAccion] = useState<Accion | null>(null);
  const [clave, setClave] = useState("");
  const [texto, setTexto] = useState("");
  const [dias, setDias] = useState("7");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [verHistorial, setVerHistorial] = useState(false);

  const a = datos.acta;
  const p = datos.permisos;

  const abrir = (x: Accion) => {
    setAccion(x);
    setClave("");
    setTexto("");
    setError("");
    setMensaje("");
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accion) return;
    const cfg = CONFIG[accion];
    if (cfg.obligatorio && !texto.trim()) {
      setError("Este campo es obligatorio.");
      return;
    }
    setEnviando(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/cursos/${cursoId}/acta/accion/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accion,
          password: clave,
          comentario: texto,
          dias: accion === "ampliar_plazo" ? parseInt(dias || "7") : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "No se pudo completar la acción.");
        return;
      }
      setAccion(null);
      setMensaje(data.message || "Listo.");
      onCambio();
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  const abrirPdf = async () => {
    const err = await abrirArchivoProtegido(`/cursos/${cursoId}/acta/pdf/`);
    if (err) setError(err);
  };

  const ultimaObservacion =
    (a.estado === "OBSERVADA" || a.estado === "REABIERTA")
      ? [...datos.eventos].reverse().find((e) => e.accion === "OBSERVACION" || e.accion === "REAPERTURA")
      : null;

  return (
    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-500">Acta de notas</div>
          <div className="flex items-center gap-2 flex-wrap mt-0.5">
            <span className="font-mono text-sm font-bold text-slate-800">{a.codigo}</span>
            <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${ESTILO_ESTADO[a.estado] || ""}`}>
              {a.estado_texto}
            </span>
            {a.version > 1 && <span className="text-xs text-slate-400">versión {a.version}</span>}
          </div>
        </div>
        <button
          type="button"
          onClick={abrirPdf}
          className="px-3.5 py-2 text-xs font-semibold border border-slate-200 rounded-xl hover:bg-slate-50 text-slate-700"
        >
          Ver / descargar PDF
        </button>
      </div>

      {mensaje && (
        <div className="p-3 rounded-xl text-sm bg-emerald-50 text-emerald-700 border border-emerald-200">{mensaje}</div>
      )}
      {error && !accion && (
        <div className="p-3 rounded-xl text-sm bg-rose-50 text-rose-700 border border-rose-200">{error}</div>
      )}

      {/* Plazo */}
      {a.fecha_fin_curso ? (
        <div className={`text-xs rounded-xl px-3 py-2 border ${
          a.plazo_vencido ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-slate-50 text-slate-600 border-slate-200"
        }`}>
          El curso culmina el <b>{fechaCorta(a.fecha_fin_curso)}</b>. El docente puede registrar y firmar hasta el{" "}
          <b>{fechaCorta(a.plazo_limite)}</b> ({a.plazo_base_dias} días{a.plazo_extra_dias ? ` + ${a.plazo_extra_dias} ampliados` : ""}).
          {a.plazo_vencido && " El plazo venció: solo el INDI puede ampliarlo."}
        </div>
      ) : (
        a.estado === "BORRADOR" && (
          <div className="text-xs rounded-xl px-3 py-2 border bg-slate-50 text-slate-500 border-slate-200">
            El curso aún no tiene fecha de culminación, por eso no corre plazo para el docente.
          </div>
        )
      )}

      {/* Observación o reapertura vigente */}
      {ultimaObservacion && (
        <div className="p-3 rounded-xl text-sm bg-amber-50 border border-amber-200 text-amber-900">
          <div className="font-semibold">
            {ultimaObservacion.accion === "OBSERVACION" ? "El INDI observó el acta" : "El INDI reabrió el acta"}
          </div>
          <div className="mt-0.5">{ultimaObservacion.comentario}</div>
        </div>
      )}

      {/* Integridad */}
      {datos.integridad === "ALTERADA" && (
        <div className="p-3 rounded-xl text-sm bg-rose-50 border border-rose-300 text-rose-800 font-medium">
          Alerta: las notas guardadas NO coinciden con las que se firmaron. El acta pudo haber sido alterada fuera del sistema.
        </div>
      )}
      {datos.integridad === "INTEGRA" && (
        <div className="text-xs rounded-xl px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200">
          Integridad verificada: las notas actuales coinciden exactamente con las firmadas.
        </div>
      )}
      {datos.cambio_tras_firma && (
        <div className="p-3 rounded-xl text-sm bg-amber-50 border border-amber-200 text-amber-900">
          Las notas o la lista de matriculados cambiaron después de la firma del docente. Devuelve el acta al docente para que la firme de nuevo.
        </div>
      )}

      {/* Firmas */}
      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="font-semibold text-slate-700">Docente</div>
          {a.firma_docente ? (
            <div className="text-slate-500 mt-1">Firmada por <b className="text-slate-700">{a.firma_docente.por}</b><br />{fechaHora(a.firma_docente.en)}</div>
          ) : <div className="text-slate-400 mt-1">Pendiente de firma</div>}
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="font-semibold text-slate-700">Dirección del INDI</div>
          {a.firma_direccion ? (
            <div className="text-slate-500 mt-1">Firmada por <b className="text-slate-700">{a.firma_direccion.por}</b><br />{fechaHora(a.firma_direccion.en)}</div>
          ) : <div className="text-slate-400 mt-1">Pendiente de firma</div>}
        </div>
      </div>
      {a.hash && (
        <div className="text-[11px] text-slate-400 break-all">
          Huella digital de las notas firmadas (SHA-256): <span className="font-mono">{a.hash}</span>
        </div>
      )}

      {/* Lo que falta para poder firmar */}
      {datos.problemas.length > 0 && (
        <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3 list-disc list-inside space-y-0.5">
          {datos.problemas.map((x) => <li key={x}>{x}</li>)}
        </ul>
      )}
      {datos.motivo_bloqueo && datos.acta.estado !== "FIRMADA_DOCENTE" && datos.acta.estado !== "CERRADA" && (
        <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">{datos.motivo_bloqueo}</div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap gap-2">
        {p.firmar_docente && (
          <button type="button" onClick={() => abrir("firmar_docente")} className="px-4 py-2 text-sm font-semibold text-white rounded-xl bg-emerald-600 hover:bg-emerald-700">
            Firmar y enviar acta al INDI
          </button>
        )}
        {p.firmar_direccion && (
          <button type="button" onClick={() => abrir("firmar_direccion")} className="px-4 py-2 text-sm font-semibold text-white rounded-xl bg-emerald-600 hover:bg-emerald-700">
            Firmar como Dirección
          </button>
        )}
        {p.observar && (
          <button type="button" onClick={() => abrir("observar")} className="px-4 py-2 text-sm font-semibold text-white rounded-xl bg-amber-600 hover:bg-amber-700">
            Devolver con observación
          </button>
        )}
        {p.reabrir && (
          <button type="button" onClick={() => abrir("reabrir")} className="px-4 py-2 text-sm font-semibold text-rose-700 border border-rose-200 rounded-xl hover:bg-rose-50">
            Reabrir para corrección
          </button>
        )}
        {p.ampliar_plazo && (
          <button type="button" onClick={() => abrir("ampliar_plazo")} className="px-4 py-2 text-sm font-semibold text-indigo-700 border border-indigo-200 rounded-xl hover:bg-indigo-50">
            Ampliar plazo
          </button>
        )}
      </div>

      {/* Historial */}
      <div>
        <button type="button" onClick={() => setVerHistorial(!verHistorial)} className="text-xs font-semibold text-slate-500 hover:text-slate-800">
          {verHistorial ? "Ocultar historial" : `Ver historial (${datos.eventos.length})`}
        </button>
        {verHistorial && (
          <ol className="mt-2 space-y-2">
            {datos.eventos.length === 0 && <li className="text-xs text-slate-400">Todavía no hay movimientos.</li>}
            {[...datos.eventos].reverse().map((e, i) => (
              <li key={i} className="text-xs border-l-2 border-slate-200 pl-3">
                <div className="font-semibold text-slate-700">{TEXTO_EVENTO[e.accion] || e.accion} <span className="font-normal text-slate-400">· v{e.version}</span></div>
                <div className="text-slate-500">{e.por || "—"} · {fechaHora(e.fecha)}{e.ip ? ` · IP ${e.ip}` : ""}</div>
                {e.comentario && <div className="text-slate-600 mt-0.5">{e.comentario}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Ventana de confirmación */}
      {accion && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <form onSubmit={enviar} className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200 space-y-4">
            <h2 className="text-lg font-bold text-slate-800">{CONFIG[accion].titulo}</h2>
            {CONFIG[accion].aviso && (
              <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">{CONFIG[accion].aviso}</p>
            )}
            {error && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">{error}</div>}

            {accion === "ampliar_plazo" && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Días a ampliar (1 a 30)</label>
                <input type="number" min={1} max={30} value={dias} onChange={(e) => setDias(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl" />
              </div>
            )}
            {CONFIG[accion].pide_texto && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">{CONFIG[accion].pide_texto}</label>
                <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={500}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            )}
            {CONFIG[accion].pide_clave && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Confirma con tu contraseña (es tu firma)</label>
                <input type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setAccion(null)} disabled={enviando}
                className="px-4 py-2 text-sm border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button type="submit" disabled={enviando}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-50 ${CONFIG[accion].estilo}`}>
                {enviando ? "Procesando..." : CONFIG[accion].boton}
              </button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
