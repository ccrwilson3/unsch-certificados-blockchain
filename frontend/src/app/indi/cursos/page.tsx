'use client';

import { useState, useEffect } from 'react';

interface Curso {
  id: number;
  nombre: string;
  language: string;
  level: string;
  subnivel: string;
  periodo: string;
  docente_id: number | null;
  docente_nombre: string;
}

interface Docente {
  id: number;
  first_name: string;
  last_name: string;
  username: string;
}

export default function GestionCursosINDI() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [docentes, setDocentes] = useState<Docente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mensajeExito, setMensajeExito] = useState('');

  // Estados del formulario
  const [language, setLanguage] = useState('Inglés');
  const [level, setLevel] = useState('Básico');
  const [subnivel, setSubnivel] = useState('Nivel I');
  const [periodo, setPeriodo] = useState('2026-I');
  const [docenteId, setDocenteId] = useState('');

  const nombreAutogenerado = `${language} ${level} - ${subnivel}`;

  useEffect(() => {
    fetchCursos();
  }, []);

  // Cada vez que cambie el idioma seleccionado, cargamos los docentes aptos para ese idioma
  useEffect(() => {
    fetchDocentesPorIdioma(language);
  }, [language]);

  const fetchCursos = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/cursos/');
      const data = await res.json();
      if (res.ok) setCursos(data);
    } catch (err) {
      setError('No se pudo conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const fetchDocentesPorIdioma = async (idiomaSeleccionado: string) => {
    try {
      const token = localStorage.getItem('token') || 'admin';
      const res = await fetch(`http://127.0.0.1:8000/api/docentes/?idioma=${encodeURIComponent(idiomaSeleccionado)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setDocentes(data);
        setDocenteId(''); // Resetear selección de docente al cambiar de idioma
      }
    } catch (err) {
      console.error('Error al cargar docentes filtrados', err);
    }
  };

  const handleCrearCurso = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMensajeExito('');
    const token = localStorage.getItem('token') || 'admin';

    try {
      const res = await fetch('http://127.0.0.1:8000/api/cursos/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          nombre: nombreAutogenerado,
          language,
          level,
          subnivel,
          periodo,
          docente_id: docenteId ? parseInt(docenteId) : null
        })
      });

      const data = await res.json();
      if (res.ok) {
        setMensajeExito('¡Curso creado, habilitado y docente asignado exitosamente!');
        setDocenteId('');
        fetchCursos();
      } else {
        setError(data.message || 'Error al procesar la solicitud.');
      }
    } catch (err) {
      setError('Error en la red al intentar crear el curso.');
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">📚 Gestión de Cursos y Asignación de Docentes (INDI)</h1>

      {mensajeExito && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-medium">
          {mensajeExito}
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg text-sm font-medium">
          {error}
        </div>
      )}

      {/* Formulario para Crear Curso */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200 space-y-4">
        <div className="border-b pb-3 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-indigo-700">Aperturar Nuevo Curso / Grupo</h2>
          <span className="text-xs bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full font-medium border border-indigo-100">
            Curso a generar: <strong className="font-semibold">{nombreAutogenerado}</strong>
          </span>
        </div>

        <form onSubmit={handleCrearCurso} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Idioma</label>
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value)} 
              className="w-full p-2.5 border rounded-md text-sm bg-white"
            >
              <option value="Inglés">Inglés</option>
              <option value="Francés">Francés</option>
              <option value="Portugués">Portugués</option>
              <option value="Quechua">Quechua</option>
              <option value="Italiano">Italiano</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nivel</label>
            <select value={level} onChange={(e) => setLevel(e.target.value)} className="w-full p-2.5 border rounded-md text-sm bg-white">
              <option value="Básico">Básico</option>
              <option value="Intermedio">Intermedio</option>
              <option value="Avanzado">Avanzado</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Subnivel</label>
            <select value={subnivel} onChange={(e) => setSubnivel(e.target.value)} className="w-full p-2.5 border rounded-md text-sm bg-white">
              <option value="Nivel I">Nivel I</option>
              <option value="Nivel II">Nivel II</option>
              <option value="Nivel III">Nivel III</option>
              <option value="Nivel IV">Nivel IV</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Período Académico</label>
            <input 
              type="text" 
              value={periodo} 
              onChange={(e) => setPeriodo(e.target.value)}
              required
              className="w-full p-2.5 border rounded-md text-sm font-mono"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Docente Disponible ({language})
            </label>
            <select 
              value={docenteId} 
              onChange={(e) => setDocenteId(e.target.value)} 
              className="w-full p-2.5 border rounded-md text-sm bg-white"
            >
              <option value="">-- Seleccionar docente calificado --</option>
              {docentes.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.first_name} {d.last_name}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3 flex justify-end pt-2">
            <button type="submit" className="bg-indigo-600 text-white px-6 py-2.5 rounded-md hover:bg-indigo-700 font-medium text-sm transition shadow-sm">
              Guardar y Habilitar en Matrícula
            </button>
          </div>
        </form>
      </div>

      {/* Lista de Cursos Habilitados */}
      <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
        <h2 className="text-lg font-semibold mb-4 text-gray-800">Cursos Habilitados en el Sistema ({cursos.length})</h2>
        {loading ? (
          <p className="text-gray-500 text-sm">Cargando cursos...</p>
        ) : cursos.length === 0 ? (
          <p className="text-gray-500 text-sm">No hay cursos registrados todavía.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b text-xs uppercase text-gray-600">
                  <th className="p-3">Curso / Programa</th>
                  <th className="p-3">Idioma / Nivel</th>
                  <th className="p-3">Período</th>
                  <th className="p-3">Docente Asignado</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y">
                {cursos.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition">
                    <td className="p-3 text-gray-800 font-medium">{c.nombre}</td>
                    <td className="p-3 text-gray-600">{c.language} - {c.level} ({c.subnivel})</td>
                    <td className="p-3 text-gray-600 font-mono text-xs">{c.periodo}</td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${c.docente_id ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                        {c.docente_nombre}
                      </span>
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