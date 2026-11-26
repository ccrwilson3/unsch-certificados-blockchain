"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { API_URL } from "../../lib/abrirArchivo";
import type { Nivel } from "../../lib/permisos";
import SelectorModulos, { aplicarCapa, type ModuloCatalogo } from "./SelectorModulos";

interface Plantilla { id: number; nombre: string; descripcion: string; rol: string; permisos: Record<string, Nivel>; }
interface Datos {
  id: number; username: string; nombre: string; role: string;
  perfil_id: number | null; excepciones: Record<string, Nivel>;
  base: Record<string, Nivel>; modulos: ModuloCatalogo[];
}

const ROLES: Record<string, string> = { INDI: "Personal INDI", DOCENTE: "Docente", GRADOS_TITULOS: "Grados y Títulos" };

export default function PermisosUsuarioDialog({
  usuarioId, onCerrar, onGuardado,
}: { usuarioId: number; onCerrar: () => void; onGuardado: () => void }) {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [perfilId, setPerfilId] = useState<number | null>(null);
  const [excepciones, setExcepciones] = useState<Record<string, Nivel | "">>({});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    setMontado(true);
    (async () => {
      try {
        const [r1, r2] = await Promise.all([
          fetch(`${API_URL}/usuarios/${usuarioId}/permisos/`, { cache: "no-store" }),
          fetch(`${API_URL}/permisos/plantillas/`, { cache: "no-store" }),
        ]);
        const d = await r1.json();
        if (!r1.ok) return setError(d.message || "No se pudieron cargar los permisos.");
        setDatos(d);
        setPerfilId(d.perfil_id);
        setExcepciones(d.excepciones || {});
        if (r2.ok) setPlantillas(await r2.json());
      } catch {
        setError("No se pudo conectar con el servidor.");
      }
    })();
  }, [usuarioId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCerrar]);

  const disponibles = useMemo(() => plantillas.filter((p) => datos && p.rol === datos.role), [plantillas, datos]);
  const heredado = useMemo(() => {
    if (!datos) return {};
    const p = disponibles.find((x) => x.id === perfilId);
    return aplicarCapa(datos.modulos, datos.base, p ? p.permisos : {});
  }, [datos, disponibles, perfilId]);

  const guardar = async () => {
    if (!datos) return;
    setGuardando(true);
    setError("");
    try {
      const limpio: Record<string, Nivel> = {};
      for (const [k, v] of Object.entries(excepciones)) if (v) limpio[k] = v;
      const res = await fetch(`${API_URL}/usuarios/${datos.id}/permisos/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perfil_id: perfilId, excepciones: limpio }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return setError(d.message || "No se pudieron guardar los permisos.");
      onGuardado();
      onCerrar();
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  if (!montado) return null;
  return createPortal(
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div role="dialog" aria-modal="true" aria-label="Permisos del usuario" className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center"><ShieldCheck className="w-5 h-5" /></span>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Permisos por módulo</h2>
              <p className="text-xs text-slate-500">
                {datos ? <>{datos.nombre} · DNI {datos.username} · {ROLES[datos.role] || datos.role}</> : "Cargando..."}
              </p>
            </div>
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4">
          {!datos && !error && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</div>}
          {datos && (
            <>
              <p className="text-xs text-slate-600">
                Cada rol ya trae sus módulos. Aquí puedes quitar o limitar los de esta persona. Los cambios se aplican de inmediato, sin que tenga que volver a ingresar.
              </p>
              <div>
                <label htmlFor="plantilla" className="block text-xs font-semibold text-slate-600 mb-1">Plantilla</label>
                <select
                  id="plantilla" value={perfilId ?? ""}
                  onChange={(e) => setPerfilId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="">Sin plantilla (solo lo que da el rol)</option>
                  {disponibles.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                {disponibles.length === 0 && <p className="text-[11px] text-slate-400 mt-1">Aún no hay plantillas para este rol. Se crean en «Permisos» del menú.</p>}
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-1.5">Ajustes propios de esta persona</p>
                <SelectorModulos
                  modulos={datos.modulos} valores={excepciones} heredado={heredado}
                  etiquetaHeredado={perfilId ? "Plantilla" : "Rol"}
                  onCambiar={(k, v) => setExcepciones((a) => ({ ...a, [k]: v }))}
                />
              </div>
            </>
          )}
          {error && <div role="status" className="p-3 rounded-xl text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 p-4 border-t border-slate-100">
          <button type="button" onClick={onCerrar} className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">Cancelar</button>
          <button type="button" onClick={guardar} disabled={!datos || guardando} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer">
            {guardando ? "Guardando..." : "Guardar permisos"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
