'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

const API = 'http://127.0.0.1:8000/api';

interface Evaluacion {
  id: number;
  titulo: string;
  peso: number;
  fecha: string | null;
}

interface Estudiante {
  id: number;
  dni: string;
  nombre: string;
  notas: Record<string, number | null>;
  acumulado: number;
  promedio: number | null;
  aprobado: boolean | null;
}

interface DatosNotas {
  curso: { id: number; nombre: string };
  evaluaciones: Evaluacion[];
  peso_total: number;
  nota_minima_aprobatoria: number;
  estudiantes: Estudiante[];
}

// Muestra 15 en vez de 15.00 y 14.25 tal cual
const fmt = (n: number) => Number(n.toFixed(2)).toString();
const clave = (estudianteId: number, evaluacionId: number) => `${estudianteId}-${evaluacionId}`;

function RegistroNotasContenido() {
  const params = useParams();
  const cursoId = params?.cursoId as string;

  const [datos, setDatos] = useState<DatosNotas | null>(null);
  const [valores, setValores] = useState<Record<string, string>>({});
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    if (cursoId) cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursoId]);

  const cargar = async () => {
    try {
      const res = await fetch(`${API}/cursos/${cursoId}/notas/`);
      const data = await res.json();

      if (!res.ok) {
        setMensaje({ tipo: 'error', texto: data.message || 'No se pudieron cargar las notas.' });
        return;
      }

      setDatos(data);

      // Valores iniciales de la tabla: la nota registrada o vacío
      const inicial: Record<string, string> = {};
      (data.estudiantes as Estudiante[]).forEach((est) => {
        (data.evaluaciones as Evaluacion[]).forEach((ev) => {
          const nota = est.notas[String(ev.id)];
          inicial[clave(est.id, ev.id)] = nota === null || nota === undefined ? '' : String(nota);
        });
      });
      setValores(inicial);
      setOriginal(inicial);
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'No se pudo conectar con el servidor.' });
    } finally {
      setLoading(false);
    }
  };

  // Celdas modificadas respecto a lo guardado
  const celdasModificadas = Object.keys(valores).filter((k) => valores[k] !== original[k]);
  const hayCambios = celdasModificadas.length > 0;

  // Promedio en vivo, con la misma fórmula que usa el servidor
  const resumen = (est: Estudiante) => {
    if (!datos) return { acumulado: 0, promedio: null as number | null };
    let acumulado = 0;
    let completo = datos.evaluaciones.length > 0;

    for (const ev of datos.evaluaciones) {
      const texto = valores[clave(est.id, ev.id)];
      const num = texto === '' || texto === undefined ? NaN : parseFloat(texto);
      if (isNaN(num)) {
        completo = false;
        continue;
      }
      acumulado += (num * ev.peso) / 100;
    }

    if (Math.abs(datos.peso_total - 100) > 0.001) completo = false;
    const redondeado = Math.round(acumulado * 100) / 100;
    return { acumulado: redondeado, promedio: completo ? redondeado : null };
  };

  const handleGuardar = async () => {
    if (!datos || !hayCambios) return;
    setMensaje(null);

    // Validación en la página (el servidor vuelve a validar)
    for (const k of celdasModificadas) {
      const texto = valores[k];
      if (texto === '') continue;
      const num = parseFloat(texto);
      if (isNaN(num) || num < 0 || num > 20) {
        setMensaje({ tipo: 'error', texto: 'Todas las notas deben estar entre 0 y 20.' });
        return;
      }
    }

    const notas = celdasModificadas.map((k) => {
      const [estudianteId, evaluacionId] = k.split('-');
      return {
        estudiante_id: Number(estudianteId),
        evaluacion_id: Number(evaluacionId),
        nota: valores[k] === '' ? null : parseFloat(valores[k]),
      };
    });

    setGuardando(true);
    try {
      const res = await fetch(`${API}/cursos/${cursoId}/notas/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notas }),
      });
      const data = await res.json();

      if (res.ok) {
        setMensaje({ tipo: 'exito', texto: data.message || 'Notas guardadas.' });
        await cargar();
      } else {
        setMensaje({ tipo: 'error', texto: data.message || 'No se pudieron guardar las notas.' });
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error de red al guardar las notas.' });
    } finally {
      setGuardando(false);
    }
  };

  const descartarCambios = () => {
    setValores(original);
    setMensaje(null);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <Link href="/docente/cursos" className="text-xs text-indigo-600 hover:underline">
            ← Volver a Mis Cursos
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">
            📝 Registro de Notas{datos ? `: ${datos.curso.nombre}` : ''}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Escala de 0 a 20. El promedio final se calcula con los pesos de cada evaluación.
          </p>
          {datos && (
            <p className="text-xs text-gray-400 mt-1">
              👥 {datos.estudiantes.length}{' '}
              {datos.estudiantes.length === 1 ? 'estudiante matriculado' : 'estudiantes matriculados'} · Curso #{datos.curso.id}
            </p>
          )}
        </div>
      </div>

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

      {loading ? (
        <p className="text-gray-500">Cargando notas...</p>
      ) : !datos ? null : datos.estudiantes.length === 0 ? (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 space-y-2">
          <p className="text-gray-700 font-medium">Este curso todavía no tiene estudiantes matriculados.</p>
          <p className="text-sm text-gray-500">
            Aparecerán aquí cuando el INDI apruebe sus matrículas en <strong>{datos.curso.nombre}</strong>.
            Si un estudiante ya aparece matriculado en otro curso, revisa que sea este y no otro con nombre parecido.
          </p>
        </div>
      ) : datos.evaluaciones.length === 0 ? (
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-sm">
            Este curso todavía no tiene evaluaciones. Define las evaluaciones y sus pesos en{' '}
            <Link href="/docente/cursos" className="font-semibold underline">
              Mis Cursos y Evaluaciones
            </Link>{' '}
            para poder registrar notas.
          </div>

          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50 text-sm font-semibold text-gray-700">
              Estudiantes matriculados ({datos.estudiantes.length})
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b text-xs uppercase text-gray-600">
                  <th className="p-3">DNI</th>
                  <th className="p-3">Estudiante</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y">
                {datos.estudiantes.map((est) => (
                  <tr key={est.id} className="hover:bg-gray-50">
                    <td className="p-3 font-mono text-xs text-gray-600">{est.dni}</td>
                    <td className="p-3 font-medium text-gray-800">{est.nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {Math.abs(datos.peso_total - 100) > 0.001 && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-md text-sm">
              Las evaluaciones suman {fmt(datos.peso_total)}%. El promedio final solo se calcula cuando suman 100%;
              mientras tanto se muestra el puntaje acumulado.
            </div>
          )}

          <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b text-xs uppercase text-gray-600">
                    <th className="p-3">DNI</th>
                    <th className="p-3">Estudiante</th>
                    {datos.evaluaciones.map((ev) => (
                      <th key={ev.id} className="p-3 text-center whitespace-nowrap">
                        <div>{ev.titulo}</div>
                        <div className="font-normal normal-case text-gray-400">{fmt(ev.peso)}%</div>
                      </th>
                    ))}
                    <th className="p-3 text-center">Promedio</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y">
                  {datos.estudiantes.map((est) => {
                    const { acumulado, promedio } = resumen(est);
                    return (
                      <tr key={est.id} className="hover:bg-gray-50">
                        <td className="p-3 font-mono text-xs text-gray-600">{est.dni}</td>
                        <td className="p-3 font-medium text-gray-800">{est.nombre}</td>
                        {datos.evaluaciones.map((ev) => {
                          const k = clave(est.id, ev.id);
                          const modificada = valores[k] !== original[k];
                          return (
                            <td key={ev.id} className="p-2 text-center">
                              <input
                                type="number"
                                min="0"
                                max="20"
                                step="0.01"
                                value={valores[k] ?? ''}
                                onChange={(e) => setValores({ ...valores, [k]: e.target.value })}
                                className={`w-20 p-1.5 text-center border rounded-md bg-white ${
                                  modificada ? 'border-amber-400 bg-amber-50' : 'border-gray-200'
                                }`}
                              />
                            </td>
                          );
                        })}
                        <td className="p-3 text-center whitespace-nowrap">
                          {promedio !== null ? (
                            <span
                              className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                                promedio >= datos.nota_minima_aprobatoria
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'
                              }`}
                            >
                              {fmt(promedio)} · {promedio >= datos.nota_minima_aprobatoria ? 'Aprobado' : 'Desaprobado'}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">{fmt(acumulado)} (parcial)</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-xs text-gray-500">
              Nota mínima aprobatoria: {fmt(datos.nota_minima_aprobatoria)}. Deja una casilla vacía para borrar esa nota.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={descartarCambios}
                disabled={!hayCambios || guardando}
                className="px-4 py-2 border border-gray-200 bg-white text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Descartar cambios
              </button>
              <button
                type="button"
                onClick={handleGuardar}
                disabled={!hayCambios || guardando}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-md hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                {guardando
                  ? 'Guardando...'
                  : hayCambios
                  ? `Guardar notas (${celdasModificadas.length})`
                  : 'Guardar notas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// useParams() lee el número del curso desde la dirección. En una ruta con parámetro,
// Next.js exige que ese dato se lea dentro de <Suspense>.
export default function RegistroNotasPage() {
  return (
    <Suspense fallback={<div className="p-6 text-gray-500">Cargando notas...</div>}>
      <RegistroNotasContenido />
    </Suspense>
  );
}