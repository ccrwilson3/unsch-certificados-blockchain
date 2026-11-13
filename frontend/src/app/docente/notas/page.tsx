'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const API = 'http://127.0.0.1:8000/api';

interface Curso {
  id: number;
  nombre: string;
  language: string;
  level: string;
  subnivel: string;
  periodo: string;
  total_matriculados: number;
}

export default function NotasIndexPage() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const cargarCursos = async () => {
      try {
        const res = await fetch(`${API}/docente/cursos/`);
        const data = await res.json();
        if (res.ok && Array.isArray(data)) {
          setCursos(data);
        } else {
          setError(data.message || 'No se pudieron cargar tus cursos.');
        }
      } catch (err) {
        setError('No se pudo conectar con el servidor.');
      } finally {
        setLoading(false);
      }
    };
    cargarCursos();
  }, []);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">📝 Registro de Notas</h1>
        <p className="text-sm text-gray-500 mt-1">
          Elige el curso para registrar o corregir las notas de tus estudiantes matriculados.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl text-sm font-medium bg-rose-50 text-rose-700 border border-rose-200">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Cargando tus cursos...</p>
      ) : cursos.length === 0 && !error ? (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <p className="text-gray-700 font-medium">No tienes cursos asignados actualmente.</p>
          <p className="text-sm text-gray-500 mt-1">
            Cuando el INDI te asigne un curso, aparecerá aquí.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {cursos.map((c) => (
            <div key={c.id} className="bg-white p-5 rounded-lg shadow-md border border-gray-200 flex flex-col">
              <h3 className="font-bold text-gray-800">{c.nombre}</h3>
              <p className="text-sm text-gray-600 mt-1">
                {c.language} - {c.level} ({c.subnivel})
              </p>
              <p className="text-xs text-indigo-600 mt-2 font-medium">Período: {c.periodo}</p>
              <p className="text-xs text-gray-500 mt-1">
                👥 {c.total_matriculados}{' '}
                {c.total_matriculados === 1 ? 'estudiante matriculado' : 'estudiantes matriculados'}
              </p>

              <div className="mt-4 pt-4 border-t border-gray-100 flex gap-2">
                <Link
                  href={`/docente/notas/${c.id}`}
                  className="flex-1 px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-md hover:bg-emerald-700 transition text-center"
                >
                  Registrar notas
                </Link>
                <Link
                  href="/docente/cursos"
                  className="px-3 py-2 border border-gray-200 text-gray-600 text-sm font-medium rounded-md hover:bg-gray-50 transition text-center"
                  title="Definir las evaluaciones y sus pesos"
                >
                  Evaluaciones
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}