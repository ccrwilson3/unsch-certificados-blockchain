'use client';

import { useState, useEffect } from 'react'; // o standard React imports

interface Curso {
  id: number;
  nombre: string;
  language: string;
  level: string;
  subnivel: string;
  periodo: string;
}

interface Evaluacion {
  id: number;
  titulo: string;
  peso: number;
  fecha: string | null;
}

export default function PanelDocente() {
  const [cursosAsignados, setCursosAsignados] = useState<Curso[]>([]);
  const [cursoSeleccionado, setCursoSeleccionado] = useState<Curso | null>(null);
  const [evaluaciones, setEvaluaciones] = useState<Evaluacion[]>([]);
  
  // Formulario para nueva evaluación
  const [tituloEval, setTituloEval] = useState('');
  const [pesoEval, setPesoEval] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCursosDocente();
  }, []);

  const fetchCursosDocente = async () => {
    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch('http://127.0.0.1:8000/api/cursos/', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        // Filtramos o mostramos los cursos donde el usuario actual es el docente
        setCursosAsignados(data);
      }
    } catch (err) {
      console.error('Error al cargar cursos del docente', err);
    } finally {
      setLoading(false);
    }
  };

  const seleccionarCurso = async (curso: Curso) => {
    setCursoSeleccionado(curso);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/cursos/${curso.id}/evaluaciones/`);
      const data = await res.json();
      if (res.ok) {
        setEvaluaciones(data.evaluaciones || []);
      }
    } catch (err) {
      console.error('Error al cargar evaluaciones', err);
    }
  };

  const handleCrearEvaluacion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cursoSeleccionado) return;

    const token = localStorage.getItem('token') || '';
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/cursos/${cursoSeleccionado.id}/evaluaciones/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          titulo: tituloEval,
          peso: parseFloat(pesoEval)
        })
      });

      const data = await res.json();
      if (res.ok) {
        alert('Evaluación creada correctamente.');
        setTituloEval('');
        setPesoEval('');
        seleccionarCurso(cursoSeleccionado);
      } else {
        alert(`Error: ${data.message}`);
      }
    } catch (err) {
      alert('Error de red al crear la evaluación.');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-800">👨‍🏫 Panel del Docente - Gestión de Notas y Evaluaciones</h1>

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
                className={`p-4 border rounded-lg cursor-pointer transition ${cursoSeleccionado?.id === c.id ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'hover:border-gray-400'}`}
              >
                <h3 className="font-bold text-gray-800">{c.nombre}</h3>
                <p className="text-sm text-gray-600">{c.language} - {c.level} ({c.subnivel})</p>
                <p className="text-xs text-indigo-600 mt-2 font-medium">Período: {c.periodo}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Gestión de Evaluaciones para el Curso Seleccionado */}
      {cursoSeleccionado && (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 space-y-6">
          <h2 className="text-lg font-semibold text-gray-800">
            Administrar Evaluaciones para: <span className="text-indigo-600">{cursoSeleccionado.nombre}</span>
          </h2>

          {/* Formulario para registrar nueva evaluación */}
          <form onSubmit={handleCrearEvaluacion} className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50 p-4 rounded-md">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título de la Evaluación</label>
              <input 
                type="text" 
                placeholder="Ej: Examen Parcial" 
                value={tituloEval} 
                onChange={(e) => setTituloEval(e.target.value)}
                required
                className="w-full p-2 border rounded-md bg-white"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Peso (%)</label>
              <input 
                type="number" 
                step="0.01"
                placeholder="Ej: 30.0" 
                value={pesoEval} 
                onChange={(e) => setPesoEval(e.target.value)}
                required
                className="w-full p-2 border rounded-md bg-white"
              />
            </div>
            <div className="flex items-end">
              <button 
                type="submit" 
                className="w-full bg-indigo-600 text-white py-2 rounded-md hover:bg-indigo-700 font-medium transition"
              >
                Agregar Evaluación
              </button>
            </div>
          </form>

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
                    <th className="p-3 text-sm font-semibold text-gray-600">Peso Porcentual</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluaciones.map((ev) => (
                    <tr key={ev.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-gray-800 font-medium">{ev.titulo}</td>
                      <td className="p-3 text-gray-600">{ev.peso}%</td>
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