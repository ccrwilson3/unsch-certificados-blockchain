"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Pencil, Plus, ShieldCheck, Trash2, UserPlus, Users, X } from "lucide-react";
import { API_URL } from "../../../lib/abrirArchivo";
import { ETIQUETAS_NIVEL, type Nivel } from "../../../lib/permisos";
import SelectorModulos, { type ModuloCatalogo } from "../../../components/ui/SelectorModulos";

interface Plantilla { id: number; nombre: string; descripcion: string; rol: string; permisos: Record<string, Nivel>; usuarios: number; }
interface RolCatalogo { rol: string; etiqueta: string; modulos: ModuloCatalogo[]; }
interface UsuarioLista { id: number; username: string; nombre_completo: string; role: string; is_active: boolean; perfil_permisos?: string; }
type Aviso = { tipo: "exito" | "error"; texto: string } | null;

const campo = "w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white";

async function llamar(ruta: string, metodo = "GET", cuerpo?: object) {
  const res = await fetch(`${API_URL}${ruta}`, {
    method: metodo, cache: "no-store",
    headers: cuerpo ? { "Content-Type": "application/json" } : undefined,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const datos = await res.json().catch(() => ({}));
  return { ok: res.ok, datos };
}

function Ventana({ titulo, subtitulo, onCerrar, children, pie }: {
  titulo: string; subtitulo?: string; onCerrar: () => void; children: React.ReactNode; pie: React.ReactNode;
}) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCerrar();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCerrar]);
  return createPortal(
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200">
        <div className="flex items-start justify-between p-5 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{titulo}</h2>
            {subtitulo && <p className="text-xs text-slate-500 mt-0.5">{subtitulo}</p>}
          </div>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">{children}</div>
        <div className="flex justify-end gap-2 p-4 border-t border-slate-100">{pie}</div>
      </div>
    </div>,
    document.body,
  );
}

const CajaAviso = ({ aviso }: { aviso: Aviso }) =>
  aviso ? (
    <div role="status" className={`p-3 rounded-xl text-xs font-medium border ${aviso.tipo === "exito" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
      {aviso.texto}
    </div>
  ) : null;

function EditorPlantilla({ plantilla, roles, onCerrar, onGuardado }: {
  plantilla: Plantilla | null; roles: RolCatalogo[]; onCerrar: () => void; onGuardado: (msg: string) => void;
}) {
  const [nombre, setNombre] = useState(plantilla?.nombre || "");
  const [descripcion, setDescripcion] = useState(plantilla?.descripcion || "");
  const [rol, setRol] = useState(plantilla?.rol || roles[0]?.rol || "INDI");
  const [permisos, setPermisos] = useState<Record<string, Nivel | "">>(plantilla?.permisos || {});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const catalogo = roles.find((r) => r.rol === rol);
  const base = useMemo(() => Object.fromEntries((catalogo?.modulos || []).map((m) => [m.clave, m.defecto])) as Record<string, Nivel>, [catalogo]);

  const guardar = async () => {
    setGuardando(true);
    setError("");
    const limpio: Record<string, Nivel> = {};
    for (const [k, v] of Object.entries(permisos)) if (v) limpio[k] = v;
    const cuerpo = { nombre, descripcion, rol, permisos: limpio };
    const r = plantilla ? await llamar(`/permisos/plantillas/${plantilla.id}/`, "PUT", cuerpo) : await llamar("/permisos/plantillas/", "POST", cuerpo);
    setGuardando(false);
    if (!r.ok) return setError(r.datos.message || "No se pudo guardar la plantilla.");
    onGuardado(plantilla ? "Plantilla actualizada. Se aplicó a quienes la tienen." : "Plantilla creada.");
  };

  return (
    <Ventana
      titulo={plantilla ? "Editar plantilla" : "Nueva plantilla"}
      subtitulo="Una plantilla agrupa permisos para asignarlos a varias personas a la vez."
      onCerrar={onCerrar}
      pie={<>
        <button type="button" onClick={onCerrar} className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">Cancelar</button>
        <button type="button" onClick={guardar} disabled={guardando || !nombre.trim()} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer">
          {guardando ? "Guardando..." : "Guardar plantilla"}
        </button>
      </>}
    >
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="pl-nombre" className="block text-xs font-semibold text-slate-600 mb-1">Nombre</label>
          <input id="pl-nombre" className={campo} maxLength={80} placeholder="Ej. INDI solo matrículas" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>
        <div>
          <label htmlFor="pl-rol" className="block text-xs font-semibold text-slate-600 mb-1">Se aplica al rol</label>
          <select id="pl-rol" className={campo} value={rol} disabled={!!plantilla} onChange={(e) => { setRol(e.target.value); setPermisos({}); }}>
            {roles.map((r) => <option key={r.rol} value={r.rol}>{r.etiqueta}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="pl-desc" className="block text-xs font-semibold text-slate-600 mb-1">Descripción (opcional)</label>
        <input id="pl-desc" className={campo} maxLength={200} placeholder="Para qué sirve esta plantilla" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
      </div>
      {catalogo && (
        <SelectorModulos
          modulos={catalogo.modulos} valores={permisos} heredado={base} etiquetaHeredado="Rol"
          onCambiar={(k, v) => setPermisos((a) => ({ ...a, [k]: v }))}
        />
      )}
      <CajaAviso aviso={error ? { tipo: "error", texto: error } : null} />
    </Ventana>
  );
}

function AsignarUsuarios({ plantilla, onCerrar, onHecho }: { plantilla: Plantilla; onCerrar: () => void; onHecho: (msg: string) => void }) {
  const [usuarios, setUsuarios] = useState<UsuarioLista[] | null>(null);
  const [elegidos, setElegidos] = useState<number[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [error, setError] = useState("");
  const [trabajando, setTrabajando] = useState(false);

  useEffect(() => {
    llamar("/usuarios/").then((r) => {
      if (r.ok) setUsuarios((r.datos as UsuarioLista[]).filter((u) => u.role === plantilla.rol && u.is_active));
      else setError(r.datos.message || "No se pudo cargar la lista.");
    });
  }, [plantilla.rol]);

  const visibles = (usuarios || []).filter((u) => `${u.username} ${u.nombre_completo}`.toLowerCase().includes(busqueda.toLowerCase()));
  const alternar = (id: number) => setElegidos((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));

  const enviar = async (accion: "asignar" | "quitar") => {
    setTrabajando(true);
    setError("");
    const r = await llamar(`/permisos/plantillas/${plantilla.id}/asignar/`, "POST", { user_ids: elegidos, accion });
    setTrabajando(false);
    if (!r.ok) return setError(r.datos.message || "No se pudo completar.");
    onHecho(r.datos.message);
  };

  return (
    <Ventana
      titulo={`Asignar «${plantilla.nombre}»`}
      subtitulo="Elige a quiénes se aplica. Solo aparecen usuarios activos con el rol de la plantilla."
      onCerrar={onCerrar}
      pie={<>
        <button type="button" onClick={onCerrar} className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">Cerrar</button>
        <button type="button" onClick={() => enviar("quitar")} disabled={trabajando || !elegidos.length} className="px-4 py-2 border border-rose-200 text-rose-700 hover:bg-rose-50 rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer">Quitar a los marcados</button>
        <button type="button" onClick={() => enviar("asignar")} disabled={trabajando || !elegidos.length} className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer">Asignar a los marcados ({elegidos.length})</button>
      </>}
    >
      <input className={campo} placeholder="Buscar por DNI o nombre" aria-label="Buscar usuario" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      {!usuarios && !error && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</div>}
      {usuarios && visibles.length === 0 && <p className="text-sm text-slate-500">No hay usuarios con ese rol.</p>}
      <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl max-h-72 overflow-y-auto">
        {visibles.map((u) => (
          <li key={u.id}>
            <label className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-slate-50">
              <input type="checkbox" checked={elegidos.includes(u.id)} onChange={() => alternar(u.id)} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-slate-800 truncate">{u.nombre_completo}</span>
                <span className="block text-[11px] text-slate-500 font-mono">{u.username}</span>
              </span>
              {u.perfil_permisos && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${u.perfil_permisos === plantilla.nombre ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-slate-50 text-slate-600 border-slate-200"}`}>
                  {u.perfil_permisos}
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
      <CajaAviso aviso={error ? { tipo: "error", texto: error } : null} />
    </Ventana>
  );
}

export default function PermisosPage() {
  const [plantillas, setPlantillas] = useState<Plantilla[] | null>(null);
  const [roles, setRoles] = useState<RolCatalogo[]>([]);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [editando, setEditando] = useState<Plantilla | "nueva" | null>(null);
  const [asignando, setAsignando] = useState<Plantilla | null>(null);

  const cargar = useCallback(async () => {
    const [p, c] = await Promise.all([llamar("/permisos/plantillas/"), llamar("/permisos/catalogo/")]);
    if (p.ok) setPlantillas(p.datos);
    else setAviso({ tipo: "error", texto: p.datos.message || "No se pudieron cargar las plantillas." });
    if (c.ok) setRoles(c.datos.roles);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const nombreModulo = (rol: string, clave: string) => roles.find((r) => r.rol === rol)?.modulos.find((m) => m.clave === clave)?.etiqueta || clave;
  const etiquetaRol = (rol: string) => roles.find((r) => r.rol === rol)?.etiqueta || rol;

  const eliminar = async (p: Plantilla) => {
    const aviso2 = p.usuarios ? `\n\n${p.usuarios} usuario(s) volverán a los permisos de su rol.` : "";
    if (!confirm(`¿Eliminar la plantilla «${p.nombre}»?${aviso2}`)) return;
    const r = await llamar(`/permisos/plantillas/${p.id}/`, "DELETE");
    setAviso({ tipo: r.ok ? "exito" : "error", texto: r.datos.message || (r.ok ? "Plantilla eliminada." : "No se pudo eliminar.") });
    cargar();
  };

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Permisos por módulo</h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Cada rol ya trae sus módulos. Aquí creas plantillas para dar a ciertas personas menos acceso (o solo lectura) y las asignas a varias a la vez.
            Para ajustar a una sola persona usa el botón «Permisos» en <b>Usuarios</b>.
          </p>
        </div>
        <button type="button" onClick={() => { setAviso(null); setEditando("nueva"); }} className="inline-flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold cursor-pointer">
          <Plus className="w-4 h-4" /> Nueva plantilla
        </button>
      </div>

      <CajaAviso aviso={aviso} />

      {!plantillas && !aviso && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Cargando...</div>}

      {plantillas && plantillas.length === 0 && (
        <div className="text-center bg-white border border-dashed border-slate-300 rounded-2xl p-10">
          <ShieldCheck className="w-8 h-8 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-700 mt-2">Aún no hay plantillas</p>
          <p className="text-xs text-slate-500 mt-1">Ejemplo: «INDI solo matrículas», con la bandeja y los reportes sin acceso.</p>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        {(plantillas || []).map((p) => {
          const cambios = Object.entries(p.permisos);
          return (
            <section key={p.id} className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="font-bold text-slate-800 truncate">{p.nombre}</h2>
                  <p className="text-[11px] font-semibold text-purple-700 mt-0.5">{etiquetaRol(p.rol)}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-50 border border-slate-200 px-2 py-1 rounded-full shrink-0">
                  <Users className="w-3 h-3" /> {p.usuarios}
                </span>
              </div>
              {p.descripcion && <p className="text-xs text-slate-500 mt-2">{p.descripcion}</p>}
              <ul className="mt-3 space-y-1 flex-1">
                {cambios.length === 0 && <li className="text-xs text-slate-400 italic">Igual que el rol (sin cambios)</li>}
                {cambios.map(([k, n]) => (
                  <li key={k} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700">{nombreModulo(p.rol, k)}</span>
                    <span className={`font-semibold ${n === "NINGUNO" ? "text-rose-700" : n === "VER" ? "text-amber-700" : "text-emerald-700"}`}>{ETIQUETAS_NIVEL[n]}</span>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => { setAviso(null); setAsignando(p); }} className="inline-flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 rounded-lg text-xs font-semibold cursor-pointer">
                  <UserPlus className="w-3.5 h-3.5" /> Asignar
                </button>
                <button type="button" onClick={() => { setAviso(null); setEditando(p); }} className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 rounded-lg text-xs font-semibold cursor-pointer">
                  <Pencil className="w-3.5 h-3.5" /> Editar
                </button>
                <button type="button" onClick={() => eliminar(p)} className="inline-flex items-center gap-1 px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-lg text-xs font-semibold cursor-pointer ml-auto">
                  <Trash2 className="w-3.5 h-3.5" /> Eliminar
                </button>
              </div>
            </section>
          );
        })}
      </div>

      {editando && (
        <EditorPlantilla
          plantilla={editando === "nueva" ? null : editando} roles={roles}
          onCerrar={() => setEditando(null)}
          onGuardado={(m) => { setEditando(null); setAviso({ tipo: "exito", texto: m }); cargar(); }}
        />
      )}
      {asignando && (
        <AsignarUsuarios
          plantilla={asignando} onCerrar={() => setAsignando(null)}
          onHecho={(m) => { setAsignando(null); setAviso({ tipo: "exito", texto: m }); cargar(); }}
        />
      )}
    </div>
  );
}
