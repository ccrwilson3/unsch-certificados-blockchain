'use client';

import { useState, useEffect } from 'react';
import Paginador, { usePaginacion } from '../../../components/ui/Paginador';
import { BookOpen, Pencil, Search } from "lucide-react";

const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000/api';

interface Curso {
  id: number;
  nombre: string;
  language: string;
  idioma?: string;
  nivel?: string;
  level: string;
  subnivel: string;
  periodo: string;
  modalidad?: string;
  horario?: string;
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

  // Estados del formulario para crear un curso
  const [language, setLanguage] = useState('Inglés');
  const [level, setLevel] = useState('Básico');
  const [subnivel, setSubnivel] = useState('Nivel I');
  const [periodo, setPeriodo] = useState('2026-I');
  const [docenteId, setDocenteId] = useState('');
  const [modalidad, setModalidad] = useState('PRESENCIAL');
  const [dias, setDias] = useState('L-V');
  const [horaInicio, setHoraInicio] = useState('08:00');
  const [horaFin, setHoraFin] = useState('10:00');

  // El horario se arma con un formato único para que el registro pueda agrupar los cursos
  const horarioArmado = `${dias} ${horaInicio} - ${horaFin}`;

  // Estados del modal para editar un curso existente
  const [cursoEditando, setCursoEditando] = useState<Curso | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [editDocenteId, setEditDocenteId] = useState('');
  const [editPeriodo, setEditPeriodo] = useState('');
  const [editModalidad, setEditModalidad] = useState('PRESENCIAL');
  const [editHorario, setEditHorario] = useState('');
  const [errorEditar, setErrorEditar] = useState('');
  const [guardandoEdit, setGuardandoEdit] = useState(false);

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
      const res = await fetch(`${API}/cursos/`);
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
      const res = await fetch(`${API}/docentes/?idioma=${encodeURIComponent(idiomaSeleccionado)}`);
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

    if (horaFin <= horaInicio) {
      setError('La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }

    try {
      const res = await fetch(`${API}/cursos/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: nombreAutogenerado,
          language,
          level,
          subnivel,
          periodo,
          modalidad,
          horario: horarioArmado,
          docente_id: docenteId ? parseInt(docenteId) : null,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setMensajeExito('¡Curso lanzado! Ya aparece en el registro y en la inscripción de los estudiantes.');
        setDocenteId('');
        fetchCursos();
      } else {
        setError(data.message || 'Error al procesar la solicitud.');
      }
    } catch (err) {
      setError('Error en la red al intentar crear el curso.');
    }
  };

  // Abrir el modal de edición con los datos actuales del curso
  const abrirEditar = (c: Curso) => {
    setCursoEditando(c);
    setEditNombre(c.nombre);
    setEditDocenteId(c.docente_id ? String(c.docente_id) : '');
    setEditPeriodo(c.periodo);
    setEditModalidad(c.modalidad || 'PRESENCIAL');
    setEditHorario(c.horario || '');
    setErrorEditar('');
  };

  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cursoEditando) return;
    setGuardandoEdit(true);
    setErrorEditar('');

    try {
      const res = await fetch(`${API}/cursos/${cursoEditando.id}/`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nombre: editNombre,
          docente_id: editDocenteId ? parseInt(editDocenteId) : null,
          periodo: editPeriodo,
          modalidad: editModalidad,
          horario: editHorario,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setCursoEditando(null);
        setError('');
        setMensajeExito(data.message || 'Curso actualizado correctamente.');
        fetchCursos();
      } else {
        setErrorEditar(data.message || 'No se pudo actualizar el curso.');
      }
    } catch (err) {
      setErrorEditar('Error de red al guardar los cambios.');
    } finally {
      setGuardandoEdit(false);
    }
  };

  const [busquedaCurso, setBusquedaCurso] = useState('');
  const cursosFiltrados = cursos.filter((c) =>
    `${c.nombre} ${c.periodo} ${c.docente_nombre || ''}`.toLowerCase().includes(busquedaCurso.trim().toLowerCase())
  );
  const pg = usePaginacion(cursosFiltrados, 10, busquedaCurso);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5"><BookOpen className="w-6 h-6 text-amber-600 shrink-0" />Gestión de Cursos y Asignación de Docentes (INDI)</h1>

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
            Curso a generar: <strong className="font-semibold">{nombreAutogenerado}</strong> · {modalidad === 'VIRTUAL' ? 'Virtual' : 'Presencial'}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Modalidad</label>
            <select
              value={modalidad}
              onChange={(e) => setModalidad(e.target.value)}
              className="w-full p-2.5 border rounded-md text-sm bg-white"
            >
              <option value="PRESENCIAL">Presencial</option>
              <option value="VIRTUAL">Virtual</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Horario: <span className="font-mono text-indigo-700">{horarioArmado}</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <select value={dias} onChange={(e) => setDias(e.target.value)} className="p-2.5 border rounded-md text-sm bg-white">
                <option value="L-V">Lunes a viernes</option>
                <option value="L-M-V">Lun - Mié - Vie</option>
                <option value="M-J">Mar - Jue</option>
                <option value="Sábados">Sábados</option>
                <option value="Domingos">Domingos</option>
                <option value="Sáb-Dom">Sáb y Dom</option>
              </select>
              <input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} required className="p-2.5 border rounded-md text-sm" />
              <input type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} required className="p-2.5 border rounded-md text-sm" />
            </div>
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-gray-800">Cursos Habilitados en el Sistema ({cursos.length})</h2>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por curso, período o docente..."
              value={busquedaCurso}
              onChange={(e) => setBusquedaCurso(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>
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
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y">
                {pg.items.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50 transition">
                    <td className="p-3 text-gray-800 font-medium">
                      <div>{c.nombre}</div>
                      <div className="text-xs text-gray-400 font-normal">
                        {c.modalidad === 'VIRTUAL' ? 'Virtual' : 'Presencial'} · {c.horario || 'Sin horario'}
                      </div>
                    </td>
                    <td className="p-3 text-gray-600">{c.idioma || c.language} - {c.nivel || c.level} ({c.subnivel})</td>
                    <td className="p-3 text-gray-600 font-mono text-xs">{c.periodo}</td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${c.docente_id ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                        {c.docente_nombre}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <button
                        type="button"
                        onClick={() => abrirEditar(c)}
                        className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium transition border border-gray-200"
                      >
                        <Pencil className="w-3.5 h-3.5 inline-block -mt-0.5 mr-1" />Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {cursosFiltrados.length === 0 && (
              <p className="p-6 text-center text-sm text-gray-400">Ningún curso coincide con la búsqueda.</p>
            )}
          </div>
        )}
        {!loading && cursos.length > 0 && <Paginador pg={pg} acento="amber" className="-mx-6 -mb-6 mt-4 rounded-b-lg" />}
      </div>

      {/* MODAL EDITAR CURSO */}
      {cursoEditando && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50" style={{ marginTop: 0 }}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full p-6 border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-1">Editar Curso</h2>
            <p className="text-xs text-slate-500 mb-4">
              {cursoEditando.idioma || cursoEditando.language} - {cursoEditando.nivel || cursoEditando.level} ({cursoEditando.subnivel}).
              Aquí puedes corregir el nombre, el horario, la modalidad y el docente.
            </p>

            {errorEditar && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">
                {errorEditar}
              </div>
            )}

            <form onSubmit={handleGuardarEdicion} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombre del curso</label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={editNombre}
                  onChange={(e) => setEditNombre(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Docente asignado</label>
                <select
                  value={editDocenteId}
                  onChange={(e) => setEditDocenteId(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">-- Sin docente asignado --</option>
                  {docentes.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.first_name} {d.last_name} ({d.username})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Período</label>
                  <input
                    type="text"
                    required
                    maxLength={20}
                    value={editPeriodo}
                    onChange={(e) => setEditPeriodo(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Modalidad</label>
                  <select
                    value={editModalidad}
                    onChange={(e) => setEditModalidad(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                  >
                    <option value="PRESENCIAL">Presencial</option>
                    <option value="VIRTUAL">Virtual</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Horario</label>
                <input
                  type="text"
                  maxLength={100}
                  placeholder="Ej: L-V 08:00 - 10:00 (mismo formato que al crear)"
                  value={editHorario}
                  onChange={(e) => setEditHorario(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCursoEditando(null)}
                  className="px-4 py-2 border rounded-xl text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardandoEdit}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                >
                  {guardandoEdit ? 'Guardando...' : 'Guardar cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
