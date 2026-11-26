"use client";

import { ETIQUETAS_NIVEL, ORDEN, type Nivel } from "../../lib/permisos";

export interface ModuloCatalogo {
  clave: string;
  etiqueta: string;
  descripcion: string;
  defecto: Nivel;
  maximo: Nivel;
}

const OPCIONES: Nivel[] = ["NINGUNO", "VER", "EDITAR"];

/** Lo que resulta de aplicar una capa de cambios sobre una base (misma regla que el servidor). */
export function aplicarCapa(
  modulos: ModuloCatalogo[], base: Record<string, Nivel>, capa: Record<string, Nivel | "">,
): Record<string, Nivel> {
  const r: Record<string, Nivel> = {};
  for (const m of modulos) {
    const v = capa[m.clave];
    r[m.clave] = v ? (ORDEN[v] > ORDEN[m.maximo] ? m.maximo : v) : base[m.clave] ?? m.defecto;
  }
  return r;
}

const colorNivel: Record<Nivel, string> = {
  NINGUNO: "bg-rose-600 text-white border-rose-600",
  VER: "bg-amber-500 text-white border-amber-500",
  EDITAR: "bg-emerald-600 text-white border-emerald-600",
};

/**
 * Una fila por módulo con un selector: «Heredado» (lo que ya da el rol o la plantilla) o un nivel
 * concreto. Es un componente de módulo (no se declara dentro de otro) para que los campos no
 * pierdan el foco al escribir.
 */
export default function SelectorModulos({
  modulos, valores, heredado, etiquetaHeredado, onCambiar, deshabilitado,
}: {
  modulos: ModuloCatalogo[];
  valores: Record<string, Nivel | "">;
  heredado: Record<string, Nivel>;
  etiquetaHeredado: string;
  onCambiar: (clave: string, nivel: Nivel | "") => void;
  deshabilitado?: boolean;
}) {
  return (
    <ul className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
      {modulos.map((m) => {
        const elegido = (valores[m.clave] || "") as Nivel | "";
        const final = elegido || heredado[m.clave] || m.defecto;
        return (
          <li key={m.clave} className="p-3 bg-white">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 sm:max-w-[48%]">
                <p className="text-sm font-semibold text-slate-800">{m.etiqueta}</p>
                <p className="text-[11px] text-slate-500 leading-snug">{m.descripcion}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <div role="group" aria-label={`Acceso a ${m.etiqueta}`} className="inline-flex rounded-lg overflow-hidden border border-slate-200 text-[11px] font-semibold">
                  <button
                    type="button" disabled={deshabilitado} aria-pressed={elegido === ""}
                    onClick={() => onCambiar(m.clave, "")}
                    className={`px-2.5 py-1.5 cursor-pointer ${elegido === "" ? "bg-slate-700 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                  >
                    {etiquetaHeredado}
                  </button>
                  {OPCIONES.filter((n) => ORDEN[n] <= ORDEN[m.maximo]).map((n) => (
                    <button
                      key={n} type="button" disabled={deshabilitado} aria-pressed={elegido === n}
                      onClick={() => onCambiar(m.clave, n)}
                      className={`px-2.5 py-1.5 border-l border-slate-200 cursor-pointer ${elegido === n ? colorNivel[n] : "bg-white text-slate-600 hover:bg-slate-50"}`}
                    >
                      {ETIQUETAS_NIVEL[n]}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500">
                  Resultado: <b className={final === "NINGUNO" ? "text-rose-700" : final === "VER" ? "text-amber-700" : "text-emerald-700"}>{ETIQUETAS_NIVEL[final]}</b>
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
