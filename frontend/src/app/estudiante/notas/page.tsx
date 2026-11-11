'use client';

import { useState, useEffect } from 'react';

interface CalificacionItem {
  evaluacion: string;
  peso: number;
  nota: number;
}

interface CursoNotas {
  curso_id: number;
  curso_nombre: string;
  docente: string;
  calificaciones: CalificacionItem[];
  promedio_final: number;
}

export default function NotasEstudiante() {
  const [misNotas, setMisNotas] = useState<CursoNotas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchNotas();
  }, []);

  const fetchNotas = async () => {
    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch('http://127.0.0.1:8000/api/estudiante/notas/', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setMisNotas(data);
      } else {
        setError('Error al cargar las calificaciones.');
      }
    } catch (err) {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">📊 Mis Calificaciones y Promedios</h1>

      {loading ? (
        <p className="text-gray-500">Cargando tus notas...</p>
      ) : error ? (
        <p className="text-red-500">{error}</p>
      ) : misNotas.length === 0 ? (
        <p className="text-gray-500">No cuentas con calificaciones registradas en tus cursos matriculados.</p>
      ) : (
        <div className="space-y-6">
          {misNotas.map((item, idx) => (
            <div key={idx} className="bg-white p-6 rounded-lg shadow-md border border-gray-200 space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <div>
                  <h2 className="text-lg font-semibold text-indigo-700">{item.curso_nombre}</h2>
                  <p className="text-sm text-gray-600">Docente: {item.docente}</p>
                </div>
                <div className="text-right">
                  <span className="text-sm text-gray-500 block">Promedio Final</span>
                  <span className={`text-xl font-bold ${item.promedio_final >= 11 ? 'text-green-600' : 'text-red-600'}`}>
                    {item.promedio_final.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Tabla de evaluaciones */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b">
                      <th className="p-2 text-xs font-semibold text-gray-600">Evaluación</th>
                      <th className="p-2 text-xs font-semibold text-gray-600">Peso (%)</th>
                      <th className="p-2 text-xs font-semibold text-gray-600">Nota Obtenida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.calificaciones.map((cal, index) => (
                      <tr key={index} className="border-b hover:bg-gray-50">
                        <td className="p-2 text-sm text-gray-800">{cal.evaluacion}</td>
                        <td className="p-2 text-sm text-gray-600">{cal.peso}%</td>
                        <td className="p-2 text-sm font-semibold text-gray-800">{cal.nota}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}