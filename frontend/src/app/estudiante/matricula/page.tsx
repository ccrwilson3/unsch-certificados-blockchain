'use client';

import { useState, useEffect } from 'react';

interface Curso {
  id: number;
  nombre: string;
  language: string;
  level: string;
  subnivel: string;
  periodo: string;
  docente_nombre: string;
}

interface Matricula {
  id: number;
  curso_nombre: string;
  status: string;
  voucher_pago: string;
  fecha: string;
}

export default function InscripcionCursosPage() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [misMatriculas, setMisMatriculas] = useState<Matricula[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCurso, setSelectedCurso] = useState<number | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    cargarDatos();
  }, []);

  const cargarDatos = async () => {
    const token = localStorage.getItem('token') || '';
    try {
      const resCursos = await fetch('http://127.0.0.1:8000/api/cursos/');
      const dataCursos = await resCursos.json();
      if (resCursos.ok) setCursos(dataCursos);

      const resMatriculas = await fetch('http://127.0.0.1:8000/api/matriculas/', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const dataMatriculas = await resMatriculas.json();
      if (resMatriculas.ok) setMisMatriculas(dataMatriculas);
    } catch (err) {
      console.error('Error al conectar con la API', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInscribirse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCurso) {
      setMensaje({ tipo: 'error', texto: 'Por favor selecciona un curso.' });
      return;
    }

    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch('http://127.0.0.1:8000/api/matriculas/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ curso_id: selectedCurso })
      });

      const data = await res.json();
      if (res.ok) {
        setMensaje({ tipo: 'exito', texto: '¡Inscripción registrada con éxito! Ya puedes descargar tu orden de pago.' });
        setSelectedCurso(null);
        cargarDatos();
      } else {
        setMensaje({ tipo: 'error', texto: data.message || 'Ocurrió un error al procesar la inscripción.' });
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error de red al intentar inscribirte.' });
    }
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-xl font-bold text-slate-800">✏️ Inscripción a Nuevos Cursos</h1>
        <p className="text-sm text-slate-500 mt-1">Selecciona el curso de idiomas de tu preferencia para generar tu orden de pago institucional.</p>
      </div>

      {mensaje && (
        <div className={`p-4 rounded-xl text-sm font-medium ${mensaje.tipo === 'exito' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
          {mensaje.texto}
        </div>
      )}

      {/* Formulario de Selección */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-md font-semibold text-indigo-700 mb-4">Seleccionar Curso Disponible</h2>
        <form onSubmit={handleInscribirse} className="space-y-4">
          <div>
            <select
              value={selectedCurso || ''}
              onChange={(e) => setSelectedCurso(Number(e.target.value))}
              required
              className="w-full p-3 border border-slate-200 rounded-xl text-sm bg-white"
            >
              <option value="">-- Elige un curso del INDI --</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} ({c.language} - {c.level}) | Período: {c.periodo} | Docente: {c.docente_nombre}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition shadow-sm"
          >
            Inscribirme y Generar Orden de Pago
          </button>
        </form>
      </div>

      {/* Mis Inscripciones Recientes */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-md font-semibold text-slate-800 mb-4">Mis Cursos Inscritos</h2>
        {loading ? (
          <p className="text-slate-500 text-sm">Cargando...</p>
        ) : misMatriculas.length === 0 ? (
          <p className="text-slate-500 text-sm">Aún no te has inscrito en ningún curso.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b text-xs uppercase text-slate-500">
                  <th className="p-3">Curso</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-center">Orden de Pago</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y">
                {misMatriculas.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50">
                    <td className="p-3 font-medium text-slate-800">{m.curso_nombre}</td>
                    <td className="p-3 text-slate-500 text-xs">{m.fecha ? new Date(m.fecha).toLocaleDateString() : 'N/A'}</td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        m.status === 'APROBADA' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {m.status === 'ESPERANDO_PAGO' ? 'Esperando Pago' : m.status}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {m.status === 'ESPERANDO_PAGO' && (
                        <a
                          href={`http://127.0.0.1:8000/api/solicitudes/${m.id}/pdf/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition"
                        >
                          📄 Descargar Orden PDF
                        </a>
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