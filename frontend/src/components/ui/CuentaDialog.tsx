"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, EyeOff, KeyRound, Loader2, UserCircle, X } from "lucide-react";
import { API_URL } from "../../lib/abrirArchivo";
import { ETIQUETAS_ROL } from "../../lib/sesion";

type Pestana = "datos" | "password";
type Aviso = { tipo: "exito" | "error"; texto: string } | null;

interface Perfil {
  username: string;
  first_name: string;
  last_name: string;
  role: string;
  email: string;
  correo_institucional?: string;
  celular: string;
}

const campo =
  "w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-50 disabled:text-slate-500";

function Mensaje({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  return (
    <div
      role="status"
      className={`p-3 rounded-xl text-xs font-medium ${
        aviso.tipo === "exito"
          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
          : "bg-rose-50 text-rose-700 border border-rose-200"
      }`}
    >
      {aviso.texto}
    </div>
  );
}

export default function CuentaDialog({
  inicial,
  onCerrar,
}: {
  inicial: Pestana;
  onCerrar: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>(inicial);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [cargando, setCargando] = useState(true);

  // Datos de contacto
  const [email, setEmail] = useState("");
  const [correoInst, setCorreoInst] = useState("");
  const [celular, setCelular] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [avisoDatos, setAvisoDatos] = useState<Aviso>(null);

  // Contraseña
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [ver, setVer] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [avisoPass, setAvisoPass] = useState<Aviso>(null);

  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", alTeclear);
    panel.current?.focus();
    return () => document.removeEventListener("keydown", alTeclear);
  }, [onCerrar]);

  useEffect(() => {
    fetch(`${API_URL}/perfil/`)
      .then(async (r) => {
        const d = await r.json();
        if (r.ok) {
          setPerfil(d);
          setEmail(d.email || "");
          setCorreoInst(d.correo_institucional || "");
          setCelular(d.celular || "");
        } else {
          setAvisoDatos({ tipo: "error", texto: d.message || "No se pudieron cargar tus datos." });
        }
      })
      .catch(() => setAvisoDatos({ tipo: "error", texto: "No se pudo conectar con el servidor." }))
      .finally(() => setCargando(false));
  }, []);

  const guardarDatos = async (e: React.FormEvent) => {
    e.preventDefault();
    setAvisoDatos(null);
    setGuardando(true);
    try {
      const res = await fetch(`${API_URL}/perfil/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, celular, correo_institucional: correoInst }),
      });
      const d = await res.json();
      setAvisoDatos(
        res.ok
          ? { tipo: "exito", texto: "Tus datos se guardaron correctamente." }
          : { tipo: "error", texto: d.message || "No se pudieron guardar los datos." }
      );
    } catch {
      setAvisoDatos({ tipo: "error", texto: "Error de red al guardar." });
    } finally {
      setGuardando(false);
    }
  };

  const cambiarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setAvisoPass(null);
    if (nueva !== confirmar) {
      setAvisoPass({ tipo: "error", texto: "La confirmación no coincide con la nueva contraseña." });
      return;
    }
    setCambiando(true);
    try {
      const res = await fetch(`${API_URL}/perfil/password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actual, nueva, confirmar }),
      });
      const d = await res.json();
      if (res.ok) {
        if (d.token) localStorage.setItem("token", d.token);
        setAvisoPass({ tipo: "exito", texto: d.message });
        setActual("");
        setNueva("");
        setConfirmar("");
      } else {
        setAvisoPass({ tipo: "error", texto: d.message || "No se pudo cambiar la contraseña." });
      }
    } catch {
      setAvisoPass({ tipo: "error", texto: "Error de red al cambiar la contraseña." });
    } finally {
      setCambiando(false);
    }
  };

  const reglas = [
    { ok: nueva.length >= 8, texto: "Al menos 8 caracteres" },
    { ok: nueva !== "" && !/^\d+$/.test(nueva), texto: "No puede ser solo números" },
    { ok: confirmar !== "" && nueva === confirmar, texto: "La confirmación coincide" },
  ];

  const tipoCampo = ver ? "text" : "password";

  const [listo, setListo] = useState(false);
  useEffect(() => setListo(true), []);
  if (!listo) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-slate-900/50 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCerrar();
      }}
    >
      <div className="min-h-full flex items-center justify-center p-4">
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Mi cuenta"
        className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-slate-200 outline-none"
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 className="text-lg font-bold text-slate-800">Mi cuenta</h2>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 px-6 mt-4 border-b border-slate-200">
          {[
            { clave: "datos" as Pestana, texto: "Mis datos", Icono: UserCircle },
            { clave: "password" as Pestana, texto: "Contraseña", Icono: KeyRound },
          ].map(({ clave, texto, Icono }) => (
            <button
              key={clave}
              type="button"
              onClick={() => setPestana(clave)}
              className={`flex items-center gap-2 px-3 py-2.5 text-sm font-semibold border-b-2 -mb-px transition cursor-pointer ${
                pestana === clave
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              <Icono className="w-4 h-4" />
              {texto}
            </button>
          ))}
        </div>

        <div className="p-6">
          {pestana === "datos" ? (
            cargando ? (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" /> Cargando tus datos...
              </div>
            ) : (
              <form onSubmit={guardarDatos} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Nombres</label>
                    <input className={campo} value={perfil?.first_name || ""} disabled readOnly />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Apellidos</label>
                    <input className={campo} value={perfil?.last_name || ""} disabled readOnly />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">DNI (tu usuario)</label>
                    <input className={`${campo} font-mono`} value={perfil?.username || ""} disabled readOnly />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Rol</label>
                    <input className={campo} value={ETIQUETAS_ROL[perfil?.role || ""] || perfil?.role || ""} disabled readOnly />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Correo electrónico</label>
                  <input
                    type="email"
                    required
                    className={campo}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Correo institucional <span className="font-normal text-slate-400">(opcional)</span>
                  </label>
                  <input
                    type="email"
                    className={campo}
                    placeholder="apellido.nombre@cidie.edu.pe"
                    value={correoInst}
                    onChange={(e) => setCorreoInst(e.target.value)}
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Si el instituto ya te creó uno, escríbelo aquí: te llegarán los avisos a ambos correos.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Celular (9 dígitos)</label>
                  <input
                    inputMode="numeric"
                    maxLength={9}
                    className={`${campo} font-mono`}
                    value={celular}
                    onChange={(e) => setCelular(e.target.value.replace(/\D/g, ""))}
                  />
                </div>

                <p className="text-[11px] text-slate-400">
                  Tus nombres y tu DNI no se pueden editar aquí. Si tienen un error, comunícate con el INDI.
                </p>
                <Mensaje aviso={avisoDatos} />

                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={onCerrar} className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    disabled={guardando}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer"
                  >
                    {guardando ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              </form>
            )
          ) : (
            <form onSubmit={cambiarPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña actual</label>
                <input
                  type={tipoCampo}
                  required
                  autoComplete="current-password"
                  className={campo}
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nueva contraseña</label>
                <input
                  type={tipoCampo}
                  required
                  autoComplete="new-password"
                  className={campo}
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Repite la nueva contraseña</label>
                <input
                  type={tipoCampo}
                  required
                  autoComplete="new-password"
                  className={campo}
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                />
              </div>

              <button
                type="button"
                onClick={() => setVer(!ver)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 cursor-pointer"
              >
                {ver ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                {ver ? "Ocultar contraseñas" : "Mostrar contraseñas"}
              </button>

              <ul className="space-y-1">
                {reglas.map((r) => (
                  <li key={r.texto} className={`text-xs flex items-center gap-2 ${r.ok ? "text-emerald-600" : "text-slate-400"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${r.ok ? "bg-emerald-500" : "bg-slate-300"}`} />
                    {r.texto}
                  </li>
                ))}
              </ul>

              <Mensaje aviso={avisoPass} />

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onCerrar} className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">
                  Cerrar
                </button>
                <button
                  type="submit"
                  disabled={cambiando}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer"
                >
                  {cambiando ? "Cambiando..." : "Cambiar contraseña"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      </div>
    </div>,
    document.body
  );
}
