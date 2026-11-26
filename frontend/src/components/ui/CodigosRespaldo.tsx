"use client";

import { useState } from "react";

/** Muestra los códigos de respaldo (solo se ven esta vez) con opción de copiar o descargar. */
export default function CodigosRespaldo({ codigos }: { codigos: string[] }) {
  const [copiado, setCopiado] = useState(false);

  const texto =
    "Códigos de respaldo - Sistema de Certificados INDI UNSCH\n" +
    "Cada código sirve una sola vez, en lugar del código de la aplicación.\n\n" +
    codigos.join("\n") + "\n";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigos.join("\n"));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      /* el usuario puede seleccionarlos a mano */
    }
  };

  const descargar = () => {
    const blob = new Blob([texto], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "codigos-respaldo-indi.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
        {codigos.map((c) => (
          <code key={c} className="text-sm font-mono font-semibold text-slate-800 text-center select-all">{c}</code>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={copiar}
          className="flex-1 px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 cursor-pointer">
          {copiado ? "¡Copiados!" : "Copiar"}
        </button>
        <button type="button" onClick={descargar}
          className="flex-1 px-3 py-2 text-xs font-semibold border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 cursor-pointer">
          Descargar .txt
        </button>
      </div>
    </div>
  );
}
