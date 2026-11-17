"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

/**
 * Paginación del lado del cliente.
 *   const pg = usePaginacion(listaFiltrada, 10, `${filtro}|${busqueda}`);
 *   pg.items.map(...)   y debajo   <Paginador pg={pg} />
 * Cuando cambia `clave` (por ejemplo, el filtro o la búsqueda) vuelve a la página 1.
 */
export function usePaginacion<T>(items: T[], porPagina = 10, clave = "") {
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    setPagina(1);
  }, [clave]);

  const total = Math.max(1, Math.ceil(items.length / porPagina));
  const actual = Math.min(pagina, total);
  const visibles = useMemo(
    () => items.slice((actual - 1) * porPagina, actual * porPagina),
    [items, actual, porPagina]
  );

  return {
    items: visibles,
    pagina: actual,
    total,
    cantidad: items.length,
    porPagina,
    irA: setPagina,
  };
}

export type Paginacion<T> = ReturnType<typeof usePaginacion<T>>;

/** Números de página con puntos suspensivos: 1 … 4 5 6 … 20 */
function numeros(actual: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const set = new Set([1, total, actual, actual - 1, actual + 1]);
  const lista = Array.from(set).filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const salida: (number | "…")[] = [];
  lista.forEach((n, i) => {
    if (i > 0 && n - lista[i - 1] > 1) salida.push("…");
    salida.push(n);
  });
  return salida;
}

export default function Paginador<T>({ pg, acento = "indigo", className = "" }: { pg: Paginacion<T>; acento?: "indigo" | "amber" | "emerald" | "violet"; className?: string }) {
  if (pg.cantidad === 0) return null;

  const desde = (pg.pagina - 1) * pg.porPagina + 1;
  const hasta = Math.min(pg.pagina * pg.porPagina, pg.cantidad);

  const activo = {
    indigo: "bg-indigo-600 text-white border-indigo-600",
    amber: "bg-amber-600 text-white border-amber-600",
    emerald: "bg-emerald-600 text-white border-emerald-600",
    violet: "bg-violet-600 text-white border-violet-600",
  }[acento];

  const boton =
    "min-w-9 h-9 px-2 inline-flex items-center justify-center rounded-lg border text-xs font-semibold transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-slate-200 bg-slate-50/70 ${className}`}>
      <p className="text-xs text-slate-500">
        Mostrando <span className="font-semibold text-slate-700">{desde}–{hasta}</span> de{" "}
        <span className="font-semibold text-slate-700">{pg.cantidad}</span>
      </p>

      {pg.total > 1 && (
        <nav className="flex items-center gap-1" aria-label="Paginación">
          <button
            type="button"
            onClick={() => pg.irA(pg.pagina - 1)}
            disabled={pg.pagina === 1}
            className={`${boton} bg-white border-slate-200 text-slate-600 hover:bg-slate-100`}
            aria-label="Página anterior"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {numeros(pg.pagina, pg.total).map((n, i) =>
            n === "…" ? (
              <span key={`p${i}`} className="px-1 text-slate-400 text-xs">…</span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => pg.irA(n)}
                aria-current={n === pg.pagina ? "page" : undefined}
                className={`${boton} ${n === pg.pagina ? activo : "bg-white border-slate-200 text-slate-600 hover:bg-slate-100"}`}
              >
                {n}
              </button>
            )
          )}

          <button
            type="button"
            onClick={() => pg.irA(pg.pagina + 1)}
            disabled={pg.pagina === pg.total}
            className={`${boton} bg-white border-slate-200 text-slate-600 hover:bg-slate-100`}
            aria-label="Página siguiente"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </nav>
      )}
    </div>
  );
}
