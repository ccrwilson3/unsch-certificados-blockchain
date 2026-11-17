'use client';

import { useState, useEffect } from 'react';
import { abrirArchivoProtegido, API_URL } from '../../../lib/abrirArchivo';
import { CalendarDays, FileText, FolderOpen, Link2 } from "lucide-react";

interface Material {
  id: number;
  tipo: string;
  tipo_nombre: string;
  titulo: string;
  descripcion: string;
  enlace: string;
  tiene_archivo: boolean;
  semana: number | null;
  fecha: string | null;
}

interface CursoConMateriales {
  id: number;
  nombre: string;
  idioma: string;
  nivel: string;
  subnivel: string;
  periodo: string;
  modalidad: string;
  horario: string;
  docente_nombre: string;
  materiales: Material[];
}

const ETIQUETA_TIPO: Record<string, string> = {
  SILABO: 'bg-violet-50 text-violet-700 border-violet-200',
  ENLACE_CLASE: 'bg-sky-50 text-sky-700 border-sky-200',
  CRONOGRAMA: 'bg-amber-50 text-amber-700 border-amber-200',
  MATERIAL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  AVISO: 'bg-rose-50 text-rose-700 border-rose-200',
};

const fechaLegible = (f: string) =>
  new Date(f + 'T00:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' });

export default function MaterialesEstudiantePage() {
  const [cursos, setCursos] = useState<CursoConMateriales[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hoy, setHoy] = useState('');

  useEffect(() => {
    // La fecha de hoy se calcula en el navegador, ya con la página cargada
    setHoy(new Date().toISOString().slice(0, 10));
    fetch(`${API_URL}/estudiante/materiales/`)
      .then(async (r) => {
        const data = await r.json();
        if (r.ok) setCursos(data);
        else setError(data.message || 'No se pudieron cargar tus materiales.');
      })
      .catch(() => setError('No se pudo conectar con el servidor.'))
      .finally(() => setLoading(false));
  }, []);

  const verArchivo = async (id: number) => {
    const msg = await abrirArchivoProtegido(`/materiales/${id}/archivo/`);
    if (msg) setError(msg);
  };

  // Fechas que vienen (clases y evaluaciones), de todos mis cursos
  const proximas = !hoy ? [] : cursos
    .flatMap((c) => c.materiales.filter((m) => m.fecha && m.fecha >= hoy).map((m) => ({ ...m, curso: c.nombre })))
    .sort((a, b) => (a.fecha! < b.fecha! ? -1 : 1))
    .slice(0, 5);

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2.5"><FolderOpen className="w-6 h-6 text-indigo-600 shrink-0" />Materiales de mis cursos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Aquí encuentras el sílabo, los enlaces de clase, el cronograma de evaluaciones y el material que publica tu docente.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl text-sm font-medium bg-rose-50 text-rose-700 border border-rose-200">{error}</div>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Cargando...</p>
      ) : cursos.length === 0 ? (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-1">
          <p className="text-sm text-slate-600">Todavía no estás matriculado en ningún curso.</p>
          <p className="text-xs text-slate-400">
            Cuando el INDI valide tu pago y apruebe tu matrícula, tus materiales aparecerán aquí.
          </p>
        </div>
      ) : (
        <>
          {proximas.length > 0 && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
              <h2 className="text-sm font-bold text-indigo-800 mb-3"><CalendarDays className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />Próximas fechas</h2>
              <ul className="space-y-2">
                {proximas.map((m) => (
                  <li key={m.id} className="text-sm text-indigo-900 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold capitalize">{fechaLegible(m.fecha!)}</span>
                    <span>{m.titulo}</span>
                    <span className="text-xs text-indigo-600">{m.curso}</span>
                    {m.enlace && (
                      <a href={m.enlace} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold underline">
                        Abrir enlace
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cursos.map((c) => {
            const grupos = [null, 1, 2, 3, 4]
              .map((s) => ({ semana: s, items: c.materiales.filter((m) => m.semana === s) }))
              .filter((g) => g.items.length > 0);
            return (
              <div key={c.id} className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-5 border-b bg-slate-50">
                  <h2 className="text-lg font-bold text-slate-800">{c.nombre}</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    {c.modalidad === 'VIRTUAL' ? 'Virtual' : 'Presencial'} · {c.horario || 'Horario por definir'} · Período {c.periodo} · Docente: {c.docente_nombre}
                  </p>
                </div>

                <div className="p-5 space-y-5">
                  {grupos.length === 0 && (
                    <p className="text-sm text-slate-400">Tu docente aún no ha publicado materiales en este curso.</p>
                  )}
                  {grupos.map((g) => (
                    <div key={String(g.semana)}>
                      <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">
                        {g.semana ? `Semana ${g.semana}` : 'General'}
                      </h3>
                      <ul className="space-y-2">
                        {g.items.map((m) => (
                          <li key={m.id} className="border rounded-xl p-3 flex flex-col md:flex-row md:items-center gap-3 justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${ETIQUETA_TIPO[m.tipo] || ''}`}>
                                  {m.tipo_nombre}
                                </span>
                                <span className="text-sm font-medium text-slate-800">{m.titulo}</span>
                              </div>
                              {m.fecha && (
                                <p className="text-xs text-indigo-600 mt-1 capitalize">{fechaLegible(m.fecha)}</p>
                              )}
                              {m.descripcion && (
                                <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{m.descripcion}</p>
                              )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {m.enlace && (
                                <a
                                  href={m.enlace}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white rounded-lg text-xs font-semibold"
                                >
                                  <Link2 className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />Abrir enlace
                                </a>
                              )}
                              {m.tiene_archivo && (
                                <button
                                  type="button"
                                  onClick={() => verArchivo(m.id)}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                                >
                                  <FileText className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />Ver archivo
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
