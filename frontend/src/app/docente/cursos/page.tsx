'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface Curso {
  id: number;
  nombre: string;
  language: string;
  level: string;
  subnivel: string;
  periodo: string;
  modalidad?: string;
  horario?: string;
  total_matriculados: number;
}

interface Evaluacion {
  id: number;
  titulo: string;
  peso: number;
  fecha: string | null;
}

const API = 'http://127.0.0.1:8000/api';

// Muestra 30 en vez de 30.00 y 33.33 tal cual
const fmt = (n: number) => Number(n.toFixed(2)).toString();

export default function PanelDocente() {
  const [cursosAsignados, setCursosAsignados] = useState<Curso[]>([]);
  const [cursoSeleccionado, setCursoSeleccionado] = useState<Curso | null>(null);
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([]);
  const [pesoTotal, setPesoTotal] = useState(0);

  // Formulario para nueva evaluación
  const [tituloEval, setTituloEval] = useState('');
  const [pesoEval, setPesoEval] = useState('');
  const [fechaEval, setFechaEval] = useState('');
  const [errorForm, setErrorForm] = useState('');
  const [enviando, setEnviando] = useState(false);

  const [loading, setLoading] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  // Porcentaje que todavía se puede asignar en el curso seleccionado
  const disponible = Math.max(0, 100 - pesoTotal);
  const completo = pesoTotal >= 100;

  useEffect(() => {
    fetchCursosDocente();
  }, []);

  const fetchCursosDocente = async () => {
    try {
      const res = await fetch(`${API}/docente/cursos/`);
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setCursosAsignados(data);
      } else {
        setMensaje({ tipo: 'error', texto: data.message || 'No se pudieron cargar tus cursos.' });
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'No se pudo conectar con el servidor.' });
    } finally {
      setLoading(false);
    }
  };

  const cargarEvaluaciones = async (cursoId: number) => {
    try {
      const res = await fetch(`${API}/cursos/${cursoId}/evaluaciones/`);
      const data = await res.json();
      if (res.ok) {
        setEvaluaciones(data.evaluaciones || []);
        setPesoTotal(data.peso_total || 0);
      } else {
        setMensaje({ tipo: 'error', texto: data.message || 'No se pudieron cargar las evaluaciones.' });
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error de red al cargar las evaluaciones.' });
    }
  };

  const seleccionarCurso = async (curso: Curso) => {
    setCursoSeleccionado(curso);
    setMensaje(null);
    setErrorForm('');
    setEvaluaciones([]);
    setPesoTotal(0);
    await cargarEvaluaciones(curso.id);
  };

  const handleCrearEvaluacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cursoSeleccionado || enviando) return;
    setMensaje(null);
    setErrorForm('');

    // Validación inmediata en la página (el servidor vuelve a validar)
    const pesoNum = parseFloat(pesoEval);
    if (isNaN(pesoNum)) {
      setErrorForm('Ingresa el peso como un número.');
      return;
    }
    if (pesoNum < 1) {
      setErrorForm('El peso se escribe en porcentaje: escribe 30 para un 30% (no 0.30). El mínimo es 1%.');
      return;
    }
    if (pesoNum > disponible + 0.001) {
      setErrorForm(
        `El peso (${fmt(pesoNum)}%) supera el porcentaje disponible (${fmt(disponible)}%). La suma de las evaluaciones no puede pasar de 100%.`
      );
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch(`${API}/cursos/${cursoSeleccionado.id}/evaluaciones/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: tituloEval,
          peso: pesoNum,
          fecha: fechaEval || null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMensaje({ tipo: 'exito', texto: 'Evaluación creada correctamente.' });
        setTituloEval('');
        setPesoEval('');
        setFechaEval('');
        await cargarEvaluaciones(cursoSeleccionado.id);
      } else {
        setErrorForm(data.message || 'No se pudo crear la evaluación.');
      }
    } catch (err) {
      setErrorForm('Error de red al crear la evaluación.');
    } finally {
      setEnviando(false);
    }
  };

  const handleEliminarEvaluacion = async (ev: Evaluacion) => {
    if (!cursoSeleccionado) return;
    if (!confirm(`¿Eliminar la evaluación "${ev.titulo}"?`)) return;
    setMensaje(null);
    setErrorForm('');

    try {
      const res = await fetch(`${API}/cursos/${cursoSeleccionado.id}/evaluaciones/`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ev.id }),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMensaje({ tipo: 'exito', texto: 'Evaluación eliminada.' });
        await cargarEvaluaciones(cursoSeleccionado.id);
      } else {
        setMensaje({ tipo: 'error', texto: data.message || 'No se pudo eliminar la evaluación.' });
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error de red al eliminar la evaluación.' });
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">👨‍🏫 Panel del Docente - Gestión de Notas y Evaluaciones</h1>

      {mensaje && (
        <div
          className={`p-4 rounded-xl text-sm font-medium ${
            mensaje.tipo === 'exito'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      {/* Listado de Cursos del Docente */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h2 className="text-lg font-semibold mb-4 text-indigo-700">Mis Cursos Asignados</h2>
        {loading ? (
          <p className="text-gray-500">Cargando tus cursos...</p>
        ) : cursosAsignados.length === 0 ? (
          <p className="text-gray-500">No tienes cursos asignados actualmente.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {cursosAsignados.map((c) => (
              <div
                key={c.id}
                onClick={() => seleccionarCurso(c)}
                className={`p-4 border rounded-lg cursor-pointer transition ${
                  cursoSeleccionado?.id === c.id ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'hover:border-gray-400'
                }`}
              >
                <h3 className="font-bold text-gray-800">{c.nombre}</h3>
                <p className="text-sm text-gray-600">{c.language} - {c.level} ({c.subnivel})</p>
                <p className="text-xs text-indigo-600 mt-2 font-medium">Período: {c.periodo}</p>
                <p className="text-xs text-gray-500 mt-1">
                  👥 {c.total_matriculados} {c.total_matriculados === 1 ? 'estudiante matriculado' : 'estudiantes matriculados'}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gestión de Evaluaciones para el Curso Seleccionado */}
      {cursoSeleccionado && (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-800">
              Administrar Evaluaciones para: <span className="text-indigo-600">{cursoSeleccionado.nombre}</span>
            </h2>
            <Link
              href={`/docente/notas/${cursoSeleccionado.id}`}
              className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-md hover:bg-emerald-700 transition text-center"
            >
              📝 Registrar notas ({cursoSeleccionado.total_matriculados})
            </Link>
          </div>

          {/* Control de pesos */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-medium text-gray-600">
              <span>Peso asignado: {fmt(pesoTotal)}% de 100%</span>
              <span className={completo ? 'text-emerald-600' : 'text-amber-600'}>
                {completo ? '✓ Evaluación completa' : `Disponible: ${fmt(disponible)}%`}
              </span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className={`h-2 rounded-full ${completo ? 'bg-emerald-500' : 'bg-indigo-600'}`}
                style={{ width: `${Math.min(pesoTotal, 100)}%` }}
              />
            </div>
          </div>

          {/* Formulario para registrar nueva evaluación */}
          <div className="space-y-3">
            <form onSubmit={handleCrearEvaluacion} className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-md">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Título de la Evaluación</label>
                <input
                  type="text"
                  placeholder="Ej: Examen Parcial"
                  value={tituloEval}
                  onChange={(e) => { setTituloEval(e.target.value); setErrorForm(''); }}
                  required
                  disabled={completo}
                  className="w-full p-2 border rounded-md bg-white disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Peso (%) {!completo && <span className="text-xs text-gray-400">máx. {fmt(disponible)}</span>}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1"
                  max={completo ? undefined : Number(disponible.toFixed(2))}
                  placeholder="Ej: 30"
                  value={pesoEval}
                  onChange={(e) => { setPesoEval(e.target.value); setErrorForm(''); }}
                  required
                  disabled={completo}
                  className="w-full p-2 border rounded-md bg-white disabled:bg-gray-100 disabled:text-gray-400"
                />
                <p className="text-xs text-gray-400 mt-1">Escribe 30 para un 30% (no 0.30).</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Fecha (opcional)</label>
                <input
                  type="date"
                  value={fechaEval}
                  onChange={(e) => setFechaEval(e.target.value)}
                  disabled={completo}
                  className="w-full p-2 border rounded-md bg-white disabled:bg-gray-100 disabled:text-gray-400"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={completo || enviando}
                  className="w-full bg-indigo-600 text-white py-2 rounded-md hover:bg-indigo-700 font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {enviando ? 'Guardando...' : 'Agregar Evaluación'}
                </button>
              </div>
            </form>

            {completo && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-md text-sm">
                Este curso ya tiene el 100% asignado. Elimina una evaluación si necesitas agregar otra.
              </div>
            )}

            {errorForm && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-md text-sm font-medium">
                ⚠️ {errorForm}
              </div>
            )}
          </div>

          {/* Listado de Evaluaciones */}
          <div>
            <h3 className="text-md font-semibold mb-3 text-gray-700">Evaluaciones Registradas</h3>
            {evaluaciones.length === 0 ? (
              <p className="text-gray-500">No hay evaluaciones configuradas para este curso.</p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b">
                    <th className="p-3 text-sm font-semibold text-gray-600">Evaluación</th>
                    <th className="p-3 text-sm font-semibold text-gray-600">Peso</th>
                    <th className="p-3 text-sm font-semibold text-gray-600">Fecha</th>
                    <th className="p-3 text-sm font-semibold text-gray-600 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluaciones.map((ev) => (
                    <tr key={ev.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-gray-800 font-medium">{ev.titulo}</td>
                      <td className="p-3 text-gray-600">{fmt(ev.peso)}%</td>
                      <td className="p-3 text-gray-500 text-sm">
                        {ev.fecha ? new Date(ev.fecha + 'T00:00:00').toLocaleDateString() : '—'}
                      </td>
                      <td className="p-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleEliminarEvaluacion(ev)}
                          className="px-3 py-1 bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100 transition"
                        >
                          Eliminar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}