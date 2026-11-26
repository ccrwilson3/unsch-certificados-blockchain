"use client";

import { useEffect, useState } from "react";
import CodigosRespaldo from "./ui/CodigosRespaldo";
import ConfigurarQR from "./ui/ConfigurarQR";

type Fase = "codigo" | "qr" | "respaldo";

/**
 * Segundo paso del ingreso. Dos casos:
 *  - "verificar": el usuario ya tiene la verificación en dos pasos y escribe su código.
 *  - "configurar": su rol la exige y aún no la tiene: se le muestra el QR para activarla.
 */
export default function DosPasosLogin({
  modo, token, apiUrl, onCompleto, onVolver,
}: {
  modo: "verificar" | "configurar";
  token: string;
  apiUrl: string;
  onCompleto: (datos: any) => void;
  onVolver: () => void;
}) {
  const [fase, setFase] = useState<Fase>(modo === "verificar" ? "codigo" : "qr");
  const [codigo, setCodigo] = useState("");
  const [usarRespaldo, setUsarRespaldo] = useState(false);
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [qr, setQr] = useState("");
  const [secreto, setSecreto] = useState("");
  const [pendiente, setPendiente] = useState<any>(null);
  const [guardados, setGuardados] = useState(false);

  useEffect(() => {
    if (modo !== "configurar") return;
    (async () => {
      try {
        const res = await fetch(`${apiUrl}/auth/2fa/configurar/iniciar/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token_2fa: token }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || "No se pudo preparar la configuración.");
          return;
        }
        setQr(data.qr);
        setSecreto(data.secreto);
      } catch {
        setError("No se pudo conectar con el servidor.");
      }
    })();
  }, [modo, token, apiUrl]);

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setEnviando(true);
    try {
      const ruta = modo === "verificar" ? "verificar" : "configurar/confirmar";
      const res = await fetch(`${apiUrl}/auth/2fa/${ruta}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token_2fa: token, codigo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "El código no es correcto.");
        if (res.status === 401) setTimeout(onVolver, 1800); // la verificación venció
        return;
      }
      if (data.codigos_respaldo) {
        setPendiente(data);
        setFase("respaldo");
      } else {
        onCompleto(data);
      }
    } catch {
      setError("No se pudo conectar con el servidor.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs text-center font-medium">{error}</div>
      )}

      {fase === "respaldo" && pendiente ? (
        <>
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-800">Verificación activada</h2>
            <p className="text-xs text-slate-500 mt-1">
              Guarda estos códigos de respaldo en un lugar seguro. Si pierdes tu celular, cada uno te permite entrar una vez.
              <b> No se volverán a mostrar.</b>
            </p>
          </div>
          <CodigosRespaldo codigos={pendiente.codigos_respaldo} />
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={guardados} onChange={(e) => setGuardados(e.target.checked)} />
            Ya guardé mis códigos de respaldo
          </label>
          <button type="button" disabled={!guardados} onClick={() => onCompleto(pendiente)}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
            Continuar
          </button>
        </>
      ) : (
        <form onSubmit={enviar} className="space-y-4">
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-800">
              {modo === "verificar" ? "Verificación en dos pasos" : "Activa la verificación en dos pasos"}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {modo === "verificar"
                ? usarRespaldo
                  ? "Escribe uno de tus códigos de respaldo (sirve una sola vez)."
                  : "Escribe el código de 6 dígitos de tu aplicación autenticadora."
                : "Tu rol exige este paso extra de seguridad. Solo lo configuras una vez."}
            </p>
          </div>

          {modo === "configurar" && (qr ? <ConfigurarQR qr={qr} secreto={secreto} /> : !error && <p className="text-center text-xs text-slate-400">Preparando código QR...</p>)}

          <input
            type="text"
            inputMode={usarRespaldo ? "text" : "numeric"}
            autoComplete="one-time-code"
            autoFocus
            required
            maxLength={usarRespaldo ? 11 : 6}
            value={codigo}
            onChange={(e) => setCodigo(usarRespaldo ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder={usarRespaldo ? "XXXXX-XXXXX" : "000000"}
            className="w-full px-4 py-3 text-center text-xl tracking-[0.3em] font-mono border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button type="submit" disabled={enviando || (modo === "configurar" && !qr)}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 cursor-pointer">
            {enviando ? "Verificando..." : modo === "verificar" ? "Verificar" : "Activar y entrar"}
          </button>

          <div className="flex items-center justify-between text-xs">
            <button type="button" onClick={onVolver} className="text-slate-500 hover:text-slate-800 cursor-pointer">← Volver</button>
            {modo === "verificar" && (
              <button type="button" onClick={() => { setUsarRespaldo(!usarRespaldo); setCodigo(""); setError(""); }}
                className="text-blue-600 hover:underline cursor-pointer">
                {usarRespaldo ? "Usar el código de la aplicación" : "Usar un código de respaldo"}
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
