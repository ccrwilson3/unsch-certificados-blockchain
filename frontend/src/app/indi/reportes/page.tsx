'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '../../../lib/abrirArchivo';
import { BarChart3, FileSpreadsheet, Users, Wallet } from 'lucide-react';

interface Resumen {
  matriculas: { cantidad: number; total: number };
  certificados: { cantidad: number; total: number };
  total_general: number;
  por_curso: { curso: string; matriculados: number; ingresos: number }[];
}

interface CursoLista {
  id: number;
  nombre: string;
  language: string;
  idioma?: string;
  periodo: string;
  horario?: string;
}

const soles = (n: number) => `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReportesIndiPage() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cargando, setCargando] = useState(true);
  const [descargando, setDescargando] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const [cursos, setCursos] = useState<CursoLista[]>([]);
  const [idioma, setIdioma] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [cursoId, setCursoId] = useState('');

  const consulta = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    Object.entries(extra).forEach(([k, v]) => v && p.set(k, v));
    const q = p.toString();
    return q ? `?${q}` : '';
  };

  const cargarResumen = async () => {
    setCargando(true);
    setMensaje(null);
    try {
      const res = await fetch(`${API_URL}/reportes/resumen/${consulta({ desde, hasta })}`);
      const data = await res.json();
      if (res.ok) setResumen(data);
      else setMensaje({ tipo: 'error', texto: data.message || 'No se pudo cargar el resumen.' });
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo conectar con el servidor.' });
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargarResumen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/docente/cursos/`);
        const data = await res.json();
        if (res.ok && Array.isArray(data)) setCursos(data);
      } catch {
        /* los filtros quedan vacíos; el reporte completo sigue disponible */
      }
    })();
  }, []);

  const idiomas = Array.from(new Map(cursos.map((c) => [c.language, c.idioma || c.language])).entries());
  const periodos = Array.from(new Set(cursos.map((c) => c.periodo))).sort();
  const cursosFiltrados = cursos.filter(
    (c) => (!idioma || c.language === idioma) && (!periodo || c.periodo === periodo)
  );

  const descargar = async (clave: string, ruta: string, nombre: string) => {
    if (descargando) return;
    setDescargando(clave);
    setMensaje(null);
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`${API_URL}${ruta}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        let texto = 'No se pudo generar el Excel.';
        try { texto = (await res.json()).message || texto; } catch { /* sin JSON */ }
        setMensaje({ tipo: 'error', texto });
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red al descargar el Excel.' });
    } finally {
      setDescargando('');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5">
          <BarChart3 className="w-6 h-6 text-amber-600 shrink-0" />Reportes
        </h1>
        <p className="text-sm text-gray-500 mt-1">Ingresos validados y estudiantes matriculados, con descarga en Excel.</p>
      </div>

      {mensaje && (
        <div className={`p-4 rounded-xl text-sm font-medium border ${mensaje.tipo === 'exito' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
          {mensaje.texto}
        </div>
      )}

      <section className="bg-white p-5 rounded-lg shadow-md border border-gray-200 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Wallet className="w-5 h-5 text-amber-600" />Ingresos</h2>
            <p className="text-xs text-gray-500 mt-0.5">Matrículas aprobadas y certificados con pago validado. Sin fechas = todo el historial.</p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="p-2 border rounded-md text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="p-2 border rounded-md text-sm" />
            </div>
            <button
              type="button"
              onClick={() => descargar('ingresos', `/reportes/ingresos/excel/${consulta({ desde, hasta })}`, 'ingresos_indi.xlsx')}
              disabled={!!descargando}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />{descargando === 'ingresos' ? 'Generando...' : 'Excel de ingresos'}
            </button>
          </div>
        </div>

        {cargando ? (
          <p className="text-sm text-gray-500">Calculando...</p>
        ) : resumen && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-xl bg-amber-50 p-4"><p className="text-xs text-gray-500">Matrículas ({resumen.matriculas.cantidad})</p><p className="text-xl font-bold text-amber-700">{soles(resumen.matriculas.total)}</p></div>
              <div className="rounded-xl bg-sky-50 p-4"><p className="text-xs text-gray-500">Certificados ({resumen.certificados.cantidad})</p><p className="text-xl font-bold text-sky-700">{soles(resumen.certificados.total)}</p></div>
              <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs text-gray-500">Total</p><p className="text-xl font-bold text-emerald-700">{soles(resumen.total_general)}</p></div>
            </div>
            {resumen.por_curso.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b text-xs uppercase text-gray-600">
                      <th className="p-3">Curso</th>
                      <th className="p-3 text-right">Matriculados</th>
                      <th className="p-3 text-right">Ingresos por matrícula</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y">
                    {resumen.por_curso.map((c) => (
                      <tr key={c.curso}>
                        <td className="p-3 text-gray-800">{c.curso}</td>
                        <td className="p-3 text-right text-gray-600">{c.matriculados}</td>
                        <td className="p-3 text-right font-medium text-gray-800">{soles(c.ingresos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>

      <section className="bg-white p-5 rounded-lg shadow-md border border-gray-200 space-y-4">
        <div>
          <h2 className="font-semibold text-gray-800 flex items-center gap-2"><Users className="w-5 h-5 text-amber-600" />Estudiantes matriculados</h2>
          <p className="text-xs text-gray-500 mt-0.5">Una hoja por curso, con DNI, correos, celular y fecha de matrícula. Sin filtros = todos los cursos.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Idioma</label>
            <select value={idioma} onChange={(e) => { setIdioma(e.target.value); setCursoId(''); }} className="w-full p-2 border rounded-md text-sm bg-white">
              <option value="">Todos</option>
              {idiomas.map(([codigo, nombre]) => <option key={codigo} value={codigo}>{nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Período</label>
            <select value={periodo} onChange={(e) => { setPeriodo(e.target.value); setCursoId(''); }} className="w-full p-2 border rounded-md text-sm bg-white">
              <option value="">Todos</option>
              {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Curso</label>
            <select value={cursoId} onChange={(e) => setCursoId(e.target.value)} className="w-full p-2 border rounded-md text-sm bg-white">
              <option value="">Todos</option>
              {cursosFiltrados.map((c) => <option key={c.id} value={c.id}>{c.nombre} · {c.horario || 'sin horario'}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={() => descargar('matriculados', `/reportes/matriculados/excel/${consulta({ idioma, periodo, curso_id: cursoId })}`, 'matriculados_indi.xlsx')}
            disabled={!!descargando}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />{descargando === 'matriculados' ? 'Generando...' : 'Excel de matriculados'}
          </button>
        </div>
      </section>
    </div>
  );
}
