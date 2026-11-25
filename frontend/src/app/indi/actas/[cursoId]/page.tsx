"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { API_URL } from "../../../../lib/abrirArchivo";
import type { ActaDatos } from "../../../../lib/actas";
import ActaPanel from "../../../../components/ActaPanel";
import ActaTabla from "../../../../components/ActaTabla";

function Contenido() {
  const params = useParams();
  const cursoId = params?.cursoId as string;
  const [datos, setDatos] = useState<ActaDatos | null>(null);
  const [error, setError] = useState("");

  const cargar = async () => {
    try {
      const res = await fetch(`${API_URL}/cursos/${cursoId}/acta/`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || "No se pudo cargar el acta.");
        return;
      }
      setError("");
      setDatos(data);
    } catch {
      setError("No se pudo conectar con el servidor.");
    }
  };

  useEffect(() => {
    if (cursoId) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursoId]);

  return (
    <main className="p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <Link href="/indi/actas" className="text-xs text-amber-700 hover:underline">← Volver a las actas</Link>
        <h1 className="text-2xl font-bold text-slate-800 mt-1">
          {datos ? `Acta: ${datos.tabla.curso.nombre}` : "Acta de notas"}
        </h1>
        {datos && (
          <p className="text-sm text-slate-500 mt-1">
            {datos.tabla.curso.idioma} · {datos.tabla.curso.nivel} - {datos.tabla.curso.subnivel} · {datos.tabla.curso.periodo} ·
            Docente: {datos.tabla.docente || "sin asignar"}
          </p>
        )}
      </div>

      {error && <div className="p-4 rounded-xl text-sm bg-rose-50 text-rose-700 border border-rose-200">{error}</div>}
      {datos && (
        <>
          <ActaPanel cursoId={cursoId} datos={datos} onCambio={cargar} />
          <ActaTabla tabla={datos.tabla} firmada={datos.tabla_es_firmada} />
        </>
      )}
    </main>
  );
}

export default function ActaDetallePage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-500">Cargando acta...</div>}>
      <Contenido />
    </Suspense>
  );
}
