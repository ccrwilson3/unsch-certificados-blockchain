'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '../../../lib/abrirArchivo';
import { CalendarCheck } from 'lucide-react';

type Riesgo = 'AL_DIA' | 'ATENCION' | 'EN_RIESGO';

interface Registro {
  fecha: string;
  estado: 'PRESENTE' | 'FALTA' | 'JUSTIFICADA';
  observacion: string;
}

interface CursoAsistencia {
  curso_id: number;
  curso_nombre: string;
  idioma: string;
  periodo: string;
  horario: string;
  faltas_permitidas: number;
  clases_registradas: number;
  presentes: number;
  faltas: number;
  justificadas: number;
  porcentaje: number | null;
  riesgo: Riesgo;
  detalle: Registro[];
}

const RIESGO: Record<Riesgo, { texto: string; clase: string; mensaje: string }> = {
  AL_DIA: { texto: 'Al día', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200', mensaje: '' },
  ATENCION: {
    texto: 'Límite de faltas',
    clase: 'bg-amber-50 text-amber-700 border-amber-200',
    mensaje: 'Llegaste al máximo de faltas permitidas. Una falta más sin justificar te pone en riesgo de desaprobar el curso.',
  },
  EN_RIESGO: {
    texto: 'En riesgo',
    clase: 'bg-rose-50 text-rose-700 border-rose-200',
    mensaje: 'Superaste las faltas permitidas. Si no presentas una justificación, podrías desaprobar el curso. Habla con tu docente o con el INDI.',
  },
};

const ESTADO: Record<Registro['estado'], { texto: string; clase: string }> = {
  PRESENTE: { texto: 'Presente', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  FALTA: { texto: 'Falta', clase: 'bg-rose-50 text-rose-700 border-rose-200' },
  JUSTIFICADA: { texto: 'Justificada', clase: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

export default function MiAsistenciaPage() {
  const [cursos, setCursos] = useState<CursoAsistencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/mi-asistencia/`);
        const data = await res.json();
        if (res.ok && Array.isArray(data)) setCursos(data);
        else setError(data.message || 'No se pudo cargar tu asistencia.');
      } catch {
        setError('No se pudo conectar con el servidor.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2.5">
          <CalendarCheck className="w-6 h-6 text-indigo-600 shrink-0" />Mi Asistencia
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Tu docente registra la asistencia en cada clase. Recuerda que el INDI exige asistir a todas las clases para aprobar el curso.
        </p>
      </div>

      {error && <div className="p-4 rounded-xl text-sm font-medium bg-rose-50 text-rose-700 border border-rose-200">{error}</div>}

      {loading ? (
        <p className="text-slate-500">Cargando...</p>
      ) : cursos.length === 0 && !error ? (
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-slate-700 font-medium">Aún no estás matriculado en ningún curso.</p>
          <p className="text-sm text-slate-500 mt-1">Cuando el INDI apruebe tu matrícula, aquí verás tu asistencia.</p>
        </div>
      ) : (
        cursos.map((c) => {
          const r = RIESGO[c.riesgo];
          return (
            <div key={c.curso_id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-bold text-slate-800">{c.curso_nombre}</h2>
                  <p className="text-xs text-slate-400 mt-0.5">{c.horario || 'Horario por definir'} · {c.periodo}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${r.clase}`}>{r.texto}</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 text-center">
                <div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-bold text-slate-800">{c.clases_registradas}</p><p className="text-xs text-slate-500">Clases registradas</p></div>
                <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xl font-bold text-emerald-700">{c.presentes}</p><p className="text-xs text-slate-500">Asistencias</p></div>
                <div className="rounded-xl bg-rose-50 p-3"><p className="text-xl font-bold text-rose-700">{c.faltas}<span className="text-sm font-medium text-rose-400"> / {c.faltas_permitidas}</span></p><p className="text-xs text-slate-500">Faltas (permitidas {c.faltas_permitidas})</p></div>
                <div className="rounded-xl bg-amber-50 p-3"><p className="text-xl font-bold text-amber-700">{c.justificadas}</p><p className="text-xs text-slate-500">Justificadas</p></div>
              </div>

              {c.porcentaje !== null && <p className="text-xs text-slate-500 mt-3">Asistencia: <strong>{c.porcentaje}%</strong></p>}
              {r.mensaje && <p className={`mt-3 text-sm rounded-xl border p-3 ${r.clase}`}>{r.mensaje}</p>}

              {c.detalle.length > 0 && (
                <div className="mt-4">
                  <button type="button" onClick={() => setAbierto(abierto === c.curso_id ? null : c.curso_id)} className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer">
                    {abierto === c.curso_id ? 'Ocultar detalle' : 'Ver detalle por día'}
                  </button>
                  {abierto === c.curso_id && (
                    <ul className="mt-2 divide-y divide-slate-100 border border-slate-100 rounded-xl">
                      {c.detalle.map((d) => (
                        <li key={d.fecha} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                          <span className="text-slate-700">{fechaLarga(d.fecha)}</span>
                          <span className="flex items-center gap-2">
                            {d.observacion && <span className="text-xs text-slate-400">{d.observacion}</span>}
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${ESTADO[d.estado].clase}`}>{ESTADO[d.estado].texto}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
