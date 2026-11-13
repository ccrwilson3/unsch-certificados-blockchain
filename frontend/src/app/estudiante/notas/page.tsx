'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = 'http://127.0.0.1:8000/api';

interface CalificacionItem {
  evaluacion: string;
  peso: number;
  nota: number | null;
  fecha: string | null;
}

interface CursoNotas {
  curso_id: number;
  curso_nombre: string;
  periodo: string;
  docente: string;
  calificaciones: CalificacionItem[];
  total_evaluaciones: number;
  notas_registradas: number;
  peso_total: number;
  acumulado: number;
  promedio_final: number | null;
  aprobado: boolean | null;
  nota_minima_aprobatoria: number;
}

// Muestra 15 en vez de 15.00 y 14.25 tal cual
const fmt = (n: number) => Number(n.toFixed(2)).toString();

export default function NotasEstudiante() {
  const [misNotas, setMisNotas] = useState<CursoNotas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchNotas = async () => {
      try {
        const res = await fetch(`${API}/estudiante/notas/`);
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          setMisNotas(data);
        } else {
          setError(data.message || 'Error al cargar las calificaciones.');
        }
      } catch (err) {
        setError('No se pudo conectar con el servidor.');
      } finally {
        setLoading(false);
      }
    };
    fetchNotas();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">📊 Mis Calificaciones y Promedios</h1>
        <p className="text-sm text-gray-500 mt-1">
          Aquí ves las notas que registran tus docentes. El promedio final aparece cuando todas las evaluaciones tienen nota.
        </p>
      </div>

      {loading ? (
        <p className="text-gray-500">Cargando tus notas...</p>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
          {error}
        </div>
      ) : misNotas.length === 0 ? (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <p className="text-gray-700 font-medium">Todavía no estás matriculado en ningún curso.</p>
          <p className="text-sm text-gray-500 mt-1">
            Tus cursos aparecerán aquí cuando el INDI apruebe tu matrícula. Puedes inscribirte en{' '}
            <Link href="/estudiante/matricula" className="text-indigo-600 hover:underline">
              Inscripción a Cursos
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {misNotas.map((item) => {
            const aprobado = item.aprobado === true;
            const desaprobado = item.aprobado === false;
            const enCurso = item.promedio_final === null;

            return (
              <div key={item.curso_id} className="bg-white p-6 rounded-lg shadow-md border border-gray-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3 border-b pb-3">
                  <div>
                    <h2 className="text-lg font-semibold text-indigo-700">{item.curso_nombre}</h2>
                    <p className="text-sm text-gray-600">Docente: {item.docente}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Período: {item.periodo}</p>
                  </div>

                  <div className="sm:text-right">
                    {enCurso ? (
                      <>
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold border bg-amber-50 text-amber-700 border-amber-200">
                          En curso
                        </span>
                        <p className="text-xs text-gray-500 mt-2">
                          Acumulado parcial: <span className="font-semibold text-gray-700">{fmt(item.acumulado)}</span>
                        </p>
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-gray-500 block">Promedio Final</span>
                        <span className={`text-2xl font-bold ${aprobado ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {fmt(item.promedio_final as number)}
                        </span>
                        <span
                          className={`ml-2 px-2.5 py-1 rounded-full text-xs font-bold border align-middle ${
                            aprobado
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {aprobado ? 'Aprobado' : 'Desaprobado'}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Tabla de evaluaciones */}
                {item.calificaciones.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    El docente todavía no ha definido las evaluaciones de este curso.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="p-2 text-xs font-semibold text-gray-600">Evaluación</th>
                          <th className="p-2 text-xs font-semibold text-gray-600">Peso</th>
                          <th className="p-2 text-xs font-semibold text-gray-600 text-center">Nota</th>
                        </tr>
                      </thead>
                      <tbody>
                        {item.calificaciones.map((cal, index) => (
                          <tr key={index} className="border-b hover:bg-gray-50">
                            <td className="p-2 text-sm text-gray-800">{cal.evaluacion}</td>
                            <td className="p-2 text-sm text-gray-600">{fmt(cal.peso)}%</td>
                            <td className="p-2 text-sm font-semibold text-center">
                              {cal.nota === null ? (
                                <span className="text-xs font-medium text-gray-400">Pendiente</span>
                              ) : (
                                <span className={cal.nota >= item.nota_minima_aprobatoria ? 'text-gray-800' : 'text-rose-600'}>
                                  {fmt(cal.nota)}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Mensajes de estado */}
                {item.calificaciones.length > 0 && enCurso && (
                  <p className="text-xs text-gray-500">
                    {item.notas_registradas} de {item.total_evaluaciones} notas registradas.
                    {Math.abs(item.peso_total - 100) > 0.001
                      ? ' El docente aún está completando las evaluaciones del curso.'
                      : ' El promedio final se mostrará cuando se registren todas las notas.'}
                  </p>
                )}

                {aprobado && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-sm text-emerald-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span>🎓 Aprobaste este curso. Ya puedes solicitar tu certificado.</span>
                    <Link
                      href="/estudiante/solicitudes"
                      className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-md hover:bg-emerald-700 transition text-center"
                    >
                      Solicitar certificado
                    </Link>
                  </div>
                )}

                {desaprobado && (
                  <p className="text-xs text-rose-600">
                    La nota mínima aprobatoria es {fmt(item.nota_minima_aprobatoria)}.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}