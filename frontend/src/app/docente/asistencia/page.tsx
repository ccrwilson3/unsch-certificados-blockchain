'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '../../../lib/abrirArchivo';
import { AlertTriangle, CalendarCheck, Check, FileSpreadsheet, Save } from 'lucide-react';

interface CursoDoc {
  id: number;
  nombre: string;
  idioma?: string;
  periodo: string;
  horario?: string;
  total_matriculados: number;
  faltas_permitidas?: number;
}

type Estado = 'PRESENTE' | 'FALTA' | 'JUSTIFICADA';
type Riesgo = 'AL_DIA' | 'ATENCION' | 'EN_RIESGO';

interface Fila {
  id: number;
  nombre: string;
  dni: string;
  estado: Estado | null;
  observacion: string;
  presentes: number;
  faltas: number;
  justificadas: number;
  porcentaje: number | null;
  riesgo: Riesgo;
}

interface Detalle {
  curso: { id: number; nombre: string; faltas_permitidas: number; horario: string };
  fecha: string;
  hoy: string;
  clases_registradas: number;
  fechas: string[];
  ya_registrada: boolean;
  en_riesgo: number;
  estudiantes: Fila[];
}

const RIESGO: Record<Riesgo, { texto: string; clase: string }> = {
  AL_DIA: { texto: 'Al día', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ATENCION: { texto: 'Límite de faltas', clase: 'bg-amber-50 text-amber-700 border-amber-200' },
  EN_RIESGO: { texto: 'En riesgo', clase: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const OPCIONES: { valor: Estado; texto: string; activo: string }[] = [
  { valor: 'PRESENTE', texto: 'Presente', activo: 'bg-emerald-600 text-white border-emerald-600' },
  { valor: 'FALTA', texto: 'Falta', activo: 'bg-rose-600 text-white border-rose-600' },
  { valor: 'JUSTIFICADA', texto: 'Justificada', activo: 'bg-amber-500 text-white border-amber-500' },
];

const fechaLarga = (iso: string) => {
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

export default function AsistenciaDocentePage() {
  const [cursos, setCursos] = useState<CursoDoc[]>([]);
  const [idiomaSel, setIdiomaSel] = useState('');
  const [cursoId, setCursoId] = useState('');
  const [exportando, setExportando] = useState(false);
  const [detalle, setDetalle] = useState<Detalle | null>(null);
  const [fecha, setFecha] = useState('');
  const [filas, setFilas] = useState<Record<number, { estado: Estado; observacion: string }>>({});
  const [loading, setLoading] = useState(true);
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/docente/cursos/`);
        const data = await res.json();
        if (res.ok && Array.isArray(data)) setCursos(data);
        else setMensaje({ tipo: 'error', texto: data.message || 'No se pudieron cargar tus cursos.' });
      } catch {
        setMensaje({ tipo: 'error', texto: 'No se pudo conectar con el servidor.' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const cargar = async (id: string, f?: string) => {
    if (!id) {
      setDetalle(null);
      return;
    }
    setCargando(true);
    try {
      const res = await fetch(`${API_URL}/cursos/${id}/asistencia/${f ? `?fecha=${f}` : ''}`);
      const data = await res.json();
      if (!res.ok) {
        setMensaje({ tipo: 'error', texto: data.message || 'No se pudo cargar la asistencia.' });
        return;
      }
      const d = data as Detalle;
      setDetalle(d);
      setFecha(d.fecha);
      const inicial: Record<number, { estado: Estado; observacion: string }> = {};
      d.estudiantes.forEach((e) => {
        inicial[e.id] = { estado: e.estado || 'PRESENTE', observacion: e.observacion || '' };
      });
      setFilas(inicial);
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red al cargar la asistencia.' });
    } finally {
      setCargando(false);
    }
  };

  const idiomas = Array.from(new Set(cursos.map((c) => c.idioma || 'Sin idioma'))).sort();
  const cursosDelIdioma = cursos.filter((c) => (c.idioma || 'Sin idioma') === idiomaSel);
  useEffect(() => {
    if (idiomas.length === 1 && !idiomaSel) setIdiomaSel(idiomas[0]);
  }, [idiomas, idiomaSel]);

  const elegirIdioma = (v: string) => {
    setIdiomaSel(v);
    setCursoId('');
    setDetalle(null);
    setMensaje(null);
  };

  const exportarExcel = async () => {
    if (!detalle || exportando) return;
    setExportando(true);
    setMensaje(null);
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`${API_URL}/cursos/${detalle.curso.id}/asistencia/excel/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        let texto = 'No se pudo generar el Excel.';
        try { texto = (await res.json()).message || texto; } catch { /* sin cuerpo JSON */ }
        setMensaje({ tipo: 'error', texto });
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `asistencia_${detalle.curso.nombre.replace(/[^A-Za-z0-9_-]+/g, '_')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red al descargar el Excel.' });
    } finally {
      setExportando(false);
    }
  };

  const elegirCurso = (id: string) => {
    setCursoId(id);
    setMensaje(null);
    setDetalle(null);
    if (id) cargar(id);
  };

  const cambiar = (id: number, cambio: Partial<{ estado: Estado; observacion: string }>) =>
    setFilas((prev) => ({ ...prev, [id]: { ...prev[id], ...cambio } }));

  const todosPresentes = () =>
    setFilas((prev) => {
      const n = { ...prev };
      Object.keys(n).forEach((k) => (n[Number(k)] = { estado: 'PRESENTE', observacion: '' }));
      return n;
    });

  const guardar = async () => {
    if (!detalle || guardando) return;
    setMensaje(null);
    const registros = detalle.estudiantes.map((e) => ({
      estudiante_id: e.id,
      estado: filas[e.id]?.estado || 'PRESENTE',
      observacion: filas[e.id]?.observacion || '',
    }));
    const sinMotivo = registros.find((r) => r.estado === 'JUSTIFICADA' && r.observacion.trim().length < 3);
    if (sinMotivo) {
      setMensaje({ tipo: 'error', texto: 'Escribe el motivo de cada falta justificada.' });
      return;
    }
    setGuardando(true);
    try {
      const res = await fetch(`${API_URL}/cursos/${detalle.curso.id}/asistencia/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, registros }),
      });
      const data = await res.json();
      setMensaje({ tipo: res.ok ? 'exito' : 'error', texto: data.message || (res.ok ? 'Asistencia guardada.' : 'No se pudo guardar.') });
      if (res.ok) await cargar(String(detalle.curso.id), fecha);
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red al guardar la asistencia.' });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5">
          <CalendarCheck className="w-6 h-6 text-emerald-600 shrink-0" />Asistencia
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Registra la asistencia de cada clase. Se tolera un número de faltas sin justificar; al pasarlo, el estudiante recibe un aviso de posible desaprobación.
        </p>
      </div>

      {mensaje && (
        <div className={`p-4 rounded-xl text-sm font-medium border ${mensaje.tipo === 'exito' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
          {mensaje.texto}
        </div>
      )}

      <div className="bg-white p-5 rounded-lg shadow-md border border-gray-200">
        {loading ? (
          <p className="text-gray-500 text-sm">Cargando tus cursos...</p>
        ) : cursos.length === 0 ? (
          <p className="text-gray-500 text-sm">No tienes cursos asignados actualmente.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
              <select value={idiomaSel} onChange={(e) => elegirIdioma(e.target.value)} className="w-full p-2.5 border rounded-md text-sm bg-white">
                <option value="">-- Elige el idioma --</option>
                {idiomas.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Curso</label>
              <select value={cursoId} onChange={(e) => elegirCurso(e.target.value)} disabled={!idiomaSel} className="w-full p-2.5 border rounded-md text-sm bg-white disabled:bg-gray-50 disabled:text-gray-400">
                <option value="">{idiomaSel ? '-- Elige el curso --' : 'Primero elige el idioma'}</option>
                {cursosDelIdioma.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} · {c.horario || 'sin horario'} · {c.periodo} ({c.total_matriculados})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {cargando && <p className="text-gray-500 text-sm">Cargando asistencia...</p>}

      {detalle && !cargando && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex flex-wrap items-end gap-4 justify-between">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de la clase</label>
              <input
                type="date"
                value={fecha}
                max={detalle.hoy}
                onChange={(e) => { setFecha(e.target.value); if (e.target.value) cargar(cursoId, e.target.value); }}
                className="p-2.5 border rounded-md text-sm"
              />
              <p className="text-xs mt-1.5 text-gray-500">
                {detalle.ya_registrada ? 'Ya registrada: puedes corregirla.' : 'Aún sin registrar.'} · {detalle.clases_registradas} clase(s) registradas · Faltas permitidas: {detalle.curso.faltas_permitidas}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={exportarExcel}
                disabled={exportando}
                className="px-3 py-2 border border-emerald-200 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-semibold hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 inline-block -mt-0.5 mr-1" />{exportando ? 'Generando...' : 'Exportar Excel'}
              </button>
              <button type="button" onClick={todosPresentes} className="px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold text-gray-700 hover:bg-gray-50 cursor-pointer">
                <Check className="w-4 h-4 inline-block -mt-0.5 mr-1" />Todos presentes
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando || detalle.estudiantes.length === 0 || !fecha}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />{guardando ? 'Guardando...' : 'Guardar asistencia'}
              </button>
            </div>
          </div>

          {detalle.fechas.length > 0 && (
            <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-gray-500 mr-1">Clases registradas:</span>
              {detalle.fechas.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => cargar(cursoId, f)}
                  className={`px-2 py-1 rounded-md border cursor-pointer ${f === fecha ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                >
                  {fechaLarga(f)}
                </button>
              ))}
            </div>
          )}

          {detalle.en_riesgo > 0 && (
            <div className="px-5 py-3 bg-rose-50 border-b border-rose-100 text-sm text-rose-700 font-medium">
              <AlertTriangle className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />
              {detalle.en_riesgo} estudiante(s) superaron las faltas permitidas.
            </div>
          )}

          {detalle.estudiantes.length === 0 ? (
            <p className="p-6 text-gray-500 text-sm">Este curso aún no tiene estudiantes matriculados.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b text-xs uppercase text-gray-600">
                    <th className="p-3">Estudiante</th>
                    <th className="p-3">Asistencia del día</th>
                    <th className="p-3">Acumulado</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y">
                  {detalle.estudiantes.map((e) => {
                    const f = filas[e.id] || { estado: 'PRESENTE' as Estado, observacion: '' };
                    const r = RIESGO[e.riesgo];
                    return (
                      <tr key={e.id} className="align-top">
                        <td className="p-3">
                          <div className="font-medium text-gray-800">{e.nombre}</div>
                          <div className="text-xs text-gray-400">DNI {e.dni}</div>
                        </td>
                        <td className="p-3">
                          <div className="inline-flex rounded-lg overflow-hidden border border-gray-200">
                            {OPCIONES.map((o) => (
                              <button
                                key={o.valor}
                                type="button"
                                onClick={() => cambiar(e.id, { estado: o.valor })}
                                className={`px-3 py-1.5 text-xs font-semibold border-r last:border-r-0 border-gray-200 cursor-pointer ${f.estado === o.valor ? o.activo : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                              >
                                {o.texto}
                              </button>
                            ))}
                          </div>
                          {f.estado !== 'PRESENTE' && (
                            <input
                              type="text"
                              maxLength={200}
                              value={f.observacion}
                              onChange={(ev) => cambiar(e.id, { observacion: ev.target.value })}
                              placeholder={f.estado === 'JUSTIFICADA' ? 'Motivo de la justificación (obligatorio)' : 'Observación (opcional)'}
                              className="mt-2 w-full p-2 border rounded-md text-xs"
                            />
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${r.clase}`}>{r.texto}</span>
                          <div className="text-xs text-gray-500 mt-1.5">
                            Faltas: <strong>{e.faltas}</strong>/{detalle.curso.faltas_permitidas}
                            {e.justificadas > 0 && ` · ${e.justificadas} justificada(s)`}
                            {e.porcentaje !== null && ` · ${e.porcentaje}% asistencia`}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
