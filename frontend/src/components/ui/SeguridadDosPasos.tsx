"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { API_URL } from "../../lib/abrirArchivo";
import CodigosRespaldo from "./CodigosRespaldo";
import ConfigurarQR from "./ConfigurarQR";

interface Estado {
  activo: boolean;
  obligatorio: boolean;
  codigos_restantes: number;
  activado_en: string | null;
}

type Vista = "estado" | "activar_clave" | "activar_qr" | "codigos" | "desactivar" | "renovar";

const campo =
  "w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500";

const post = async (ruta: string, cuerpo: object) => {
  const res = await fetch(`${API_URL}${ruta}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
};

export default function SeguridadDosPasos() {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [vista, setVista] = useState<Vista>("estado");
  const [password, setPassword] = useState("");
  const [codigo, setCodigo] = useState("");
  const [qr, setQr] = useState("");
  const [secreto, setSecreto] = useState("");
  const [codigosNuevos, setCodigosNuevos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);

  const cargar = async () => {
    try {
      const res = await fetch(`${API_URL}/2fa/estado/`, { cache: "no-store" });
      if (res.ok) setEstado(await res.json());
    } catch {
      setError("No se pudo conectar con el servidor.");
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const volver = () => {
    setVista("estado");
    setPassword("");
    setCodigo("");
    setError("");
  };

  const accion = async (e: React.FormEvent, paso: "iniciar" | "confirmar" | "desactivar" | "renovar") => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      if (paso === "iniciar") {
        const r = await post("/2fa/activar/iniciar/", { password });
        if (!r.ok) return setError(r.data.message || "No se pudo iniciar.");
        setQr(r.data.qr);
        setSecreto(r.data.secreto);
        setPassword("");
        setVista("activar_qr");
      } else if (paso === "confirmar") {
        const r = await post("/2fa/activar/confirmar/", { codigo });
        if (!r.ok) return setError(r.data.message || "Código incorrecto.");
        setCodigosNuevos(r.data.codigos_respaldo);
        setCodigo("");
        setVista("codigos");
        cargar();
      } else if (paso === "desactivar") {
        const r = await post("/2fa/desactivar/", { password, codigo });
        if (!r.ok) return setError(r.data.message || "No se pudo desactivar.");
        setAviso("Verificación en dos pasos desactivada.");
        volver();
        cargar();
      } else {
        const r = await post("/2fa/codigos/", { password, codigo });
        if (!r.ok) return setError(r.data.message || "No se pudieron renovar los códigos.");
        setCodigosNuevos(r.data.codigos_respaldo);
        setPassword("");
        setCodigo("");
        setVista("codigos");
        cargar();
      }
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  };

  if (!estado) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Cargando...
      </div>
    );
  }

  const mostrarError = () => (error ? <div role="status" className="p-3 rounded-xl text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">{error}</div> : null);
  const boton = (texto: string, color = "bg-indigo-600 hover:bg-indigo-700") => (
    <button type="submit" disabled={enviando} className={`px-4 py-2 text-white rounded-xl text-xs font-semibold disabled:opacity-50 cursor-pointer ${color}`}>
      {enviando ? "Procesando..." : texto}
    </button>
  );
  const cancelar = () => (
    <button type="button" onClick={volver} className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer">Cancelar</button>
  );
  const campoCodigo = () => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">Código de tu aplicación (6 dígitos)</label>
      <input className={campo} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={codigo}
        onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))} />
    </div>
  );
  const campoClave = () => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">Tu contraseña</label>
      <input type="password" autoComplete="current-password" className={campo} required value={password} onChange={(e) => setPassword(e.target.value)} />
    </div>
  );

  return (
    <div className="space-y-4">
      {vista === "estado" && (
        <>
          {aviso && <div role="status" className="p-3 rounded-xl text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">{aviso}</div>}
          <div className={`flex items-start gap-3 p-4 rounded-xl border ${estado.activo ? "bg-emerald-50 border-emerald-200" : "bg-slate-50 border-slate-200"}`}>
            <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 ${estado.activo ? "text-emerald-600" : "text-slate-400"}`} />
            <div className="text-xs">
              <p className="font-semibold text-slate-800">
                Verificación en dos pasos: {estado.activo ? "activada" : "desactivada"}
              </p>
              <p className="text-slate-600 mt-0.5">
                {estado.activo
                  ? `Al ingresar se pide, además de tu contraseña, un código de tu celular. Códigos de respaldo disponibles: ${estado.codigos_restantes}.`
                  : "Añade un código de tu celular al ingresar. Protege tu cuenta aunque alguien conozca tu contraseña."}
              </p>
              {estado.obligatorio && <p className="text-indigo-700 font-semibold mt-1">Tu rol exige este paso: no se puede desactivar.</p>}
            </div>
          </div>
          {!estado.activo ? (
            <button type="button" onClick={() => { setAviso(""); setVista("activar_clave"); }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer">
              Activar verificación en dos pasos
            </button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => { setAviso(""); setVista("renovar"); }}
                className="px-4 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                Generar códigos de respaldo nuevos
              </button>
              {!estado.obligatorio && (
                <button type="button" onClick={() => { setAviso(""); setVista("desactivar"); }}
                  className="px-4 py-2 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer">
                  Desactivar
                </button>
              )}
            </div>
          )}
        </>
      )}

      {vista === "activar_clave" && (
        <form onSubmit={(e) => accion(e, "iniciar")} className="space-y-3">
          <p className="text-xs text-slate-600">Por seguridad, confirma tu contraseña para continuar.</p>
          {campoClave()}{mostrarError()}
          <div className="flex justify-end gap-2">{cancelar()}{boton("Continuar")}</div>
        </form>
      )}

      {vista === "activar_qr" && (
        <form onSubmit={(e) => accion(e, "confirmar")} className="space-y-3">
          <ConfigurarQR qr={qr} secreto={secreto} />
          {campoCodigo()}{mostrarError()}
          <div className="flex justify-end gap-2">{cancelar()}{boton("Activar")}</div>
        </form>
      )}

      {vista === "codigos" && (
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            Guarda estos códigos de respaldo en un lugar seguro. Cada uno sirve <b>una sola vez</b> si pierdes tu celular.
            <b> No se volverán a mostrar.</b>
          </p>
          <CodigosRespaldo codigos={codigosNuevos} />
          <div className="flex justify-end">
            <button type="button" onClick={() => { setCodigosNuevos([]); volver(); }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold cursor-pointer">Ya los guardé</button>
          </div>
        </div>
      )}

      {vista === "desactivar" && (
        <form onSubmit={(e) => accion(e, "desactivar")} className="space-y-3">
          <p className="text-xs text-slate-600">Para desactivarla confirma tu contraseña y un código de tu aplicación.</p>
          {campoClave()}{campoCodigo()}{mostrarError()}
          <div className="flex justify-end gap-2">{cancelar()}{boton("Desactivar", "bg-rose-600 hover:bg-rose-700")}</div>
        </form>
      )}

      {vista === "renovar" && (
        <form onSubmit={(e) => accion(e, "renovar")} className="space-y-3">
          <p className="text-xs text-slate-600">Los códigos de respaldo anteriores dejarán de servir. Confirma tu contraseña y un código de tu aplicación.</p>
          {campoClave()}{campoCodigo()}{mostrarError()}
          <div className="flex justify-end gap-2">{cancelar()}{boton("Generar códigos")}</div>
        </form>
      )}
    </div>
  );
}
