"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { API_URL } from "./abrirArchivo";

export type Nivel = "NINGUNO" | "VER" | "EDITAR";
export const ORDEN: Record<Nivel, number> = { NINGUNO: 0, VER: 1, EDITAR: 2 };
export const ETIQUETAS_NIVEL: Record<Nivel, string> = {
  NINGUNO: "Sin acceso",
  VER: "Solo ver",
  EDITAR: "Ver y editar",
};

interface Estado {
  cargado: boolean;
  modulos: Record<string, Nivel>;
  maximos: Record<string, Nivel>;
}

interface Valor extends Estado {
  /** Nivel del usuario en un módulo. Mientras carga, o si no se pudo consultar, no oculta nada: el servidor es quien decide. */
  nivel: (modulo?: string) => Nivel;
  puedeVer: (modulo?: string) => boolean;
  puedeEditar: (modulo?: string) => boolean;
}

const Contexto = createContext<Valor | null>(null);

export function PermisosProvider({ children }: { children: React.ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ cargado: false, modulos: {}, maximos: {} });

  useEffect(() => {
    let activo = true;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/mis-permisos/`, { cache: "no-store" });
        if (!res.ok) throw new Error("sin permisos");
        const d = await res.json();
        if (activo) setEstado({ cargado: true, modulos: d.modulos || {}, maximos: d.maximos || {} });
      } catch {
        // Sin conexión: se muestran los menús y el servidor sigue aplicando los permisos reales.
        if (activo) setEstado({ cargado: true, modulos: {}, maximos: {} });
      }
    })();
    return () => {
      activo = false;
    };
  }, []);

  const valor = useMemo<Valor>(() => {
    const nivel = (m?: string): Nivel => (!m || !(m in estado.modulos) ? "EDITAR" : estado.modulos[m]);
    return {
      ...estado,
      nivel,
      puedeVer: (m) => ORDEN[nivel(m)] >= ORDEN.VER,
      puedeEditar: (m) => ORDEN[nivel(m)] >= ORDEN.EDITAR,
    };
  }, [estado]);

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

const POR_DEFECTO: Valor = {
  cargado: true, modulos: {}, maximos: {},
  nivel: () => "EDITAR", puedeVer: () => true, puedeEditar: () => true,
};

export function usePermisos(): Valor {
  return useContext(Contexto) || POR_DEFECTO;
}
