'use client';

import { useState, useEffect } from 'react';

interface Matricula {
  id: number;
  estudiante: string;
  curso_id: number;
  curso_nombre: string;
  status: string;
  voucher_pago: string;
  fecha: string;
}

export default function GestionMatriculasINDI() {
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchMatriculas();
  }, []);

  const fetchMatriculas = async () => {
    try {
      const token = localStorage.getItem('token') || 'admin';
      const res = await fetch('http://127.0.0.1:8000/api/matriculas/', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      if (res.ok) {
        setMatriculas(data);
      } else {
        setError('Error al cargar las solicitudes de matrícula.');
      }
    } catch (err) {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleAccionMatricula = async (id: number, accion: 'aprobar' | 'rechazar') => {
    const token = localStorage.getItem('token') || 'admin';
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/matriculas/${id}/aprobar/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ accion })
      });

      const data = await res.json();
      if (res.ok) {
        alert(data.message);
        fetchMatriculas(); // Actualizar tabla
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (err) {
      alert('Error de red al procesar la matrícula.');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-6 text-gray-800">📝 Gestión de Solicitudes de Matrícula (INDI)</h1>

      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">Listado de Solicitudes de Matrícula</h2>
        {loading ? (
          <p className="text-gray-500">Cargando solicitudes...</p>
        ) : error ? (
          <p className="text-red-500">{error}</p>
        ) : matriculas.length === 0 ? (
          <p className="text-gray-500">No hay solicitudes de matrícula registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-100 border-b text-xs uppercase text-gray-600">
                  <th className="p-3">Estudiante</th>
                  <th className="p-3">Curso Solicitado</th>
                  <th className="p-3">Voucher / Pago</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y">
                {matriculas.map((m) => (
                  <tr key={m.id} className="border-b hover:bg-gray-50 transition">
                    <td className="p-3 text-gray-800 font-medium">{m.estudiante}</td>
                    <td className="p-3 text-gray-600">{m.curso_nombre}</td>
                    <td className="p-3 text-gray-600">
                      {m.voucher_pago ? (
                        <a 
                          href={m.voucher_pago} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-indigo-600 underline text-xs font-semibold"
                        >
                          Ver Voucher
                        </a>
                      ) : (
                        'S/N'
                      )}
                    </td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        m.status === 'APROBADA' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        m.status === 'REJECTED' || m.status === 'RECHAZADA' ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        m.status === 'PENDIENTE' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-sky-50 text-sky-700 border border-sky-200'
                      }`}>
                        {m.status === 'ESPERANDO_PAGO' ? 'Esperando Pago' :
                         m.status === 'PENDIENTE' ? 'Pendiente de Revisión' :
                         m.status === 'APROBADA' ? 'Matriculado' : 
                         m.status === 'RECHAZADA' || m.status === 'REJECTED' ? 'Rechazado' : m.status}
                      </span>
                    </td>
                    <td className="p-3 text-center space-x-2">
                      {m.status === 'PENDIENTE' && (
                        <>
                          <button 
                            onClick={() => handleAccionMatricula(m.id, 'aprobar')}
                            className="bg-emerald-600 text-white px-3 py-1 rounded text-xs hover:bg-emerald-700 transition font-semibold"
                          >
                            Aprobar
                          </button>
                          <button 
                            onClick={() => handleAccionMatricula(m.id, 'rechazar')}
                            className="bg-rose-600 text-white px-3 py-1 rounded text-xs hover:bg-rose-700 transition font-semibold"
                          >
                            Rechazar
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}