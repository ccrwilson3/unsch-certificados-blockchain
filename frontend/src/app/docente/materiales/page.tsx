'use client';

import { useState, useEffect, useRef } from 'react';
import { abrirArchivoProtegido, API_URL } from '../../../lib/abrirArchivo';
import { FileText, Link2, Paperclip, X } from "lucide-react";

interface Curso {
  id: number;
  nombre: string;
  idioma?: string;
  nivel?: string;
  subnivel: string;
  periodo: string;
  modalidad: string;
  horario: string;
  total_matriculados: number;
}

interface Material {
  id: number;
  tipo: string;
  tipo_nombre: string;
  titulo: string;
  descripcion: string;
  enlace: string;
  tiene_archivo: boolean;
  archivo_nombre: string;
  semana: number | null;
  fecha: string | null;
  creado: string;
}

const TIPOS = [
  { valor: 'SILABO', texto: 'Sílabo', ayuda: 'Sube el PDF del sílabo del curso.' },
  { valor: 'ENLACE_CLASE', texto: 'Enlace de clase', ayuda: 'Pega el enlace de Meet, Zoom o Teams y la fecha de la clase.' },
  { valor: 'CRONOGRAMA', texto: 'Cronograma de evaluaciones', ayuda: 'Sube el cronograma o descríbelo en el texto.' },
  { valor: 'MATERIAL', texto: 'Material de estudio', ayuda: 'Presentaciones, lecturas, ejercicios, audios...' },
  { valor: 'AVISO', texto: 'Aviso', ayuda: 'Un mensaje corto para todos tus estudiantes.' },
];

const ETIQUETA_TIPO: Record<string, string> = {
  SILABO: 'bg-violet-50 text-violet-700 border-violet-200',
  ENLACE_CLASE: 'bg-sky-50 text-sky-700 border-sky-200',
  CRONOGRAMA: 'bg-amber-50 text-amber-700 border-amber-200',
  MATERIAL: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  AVISO: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default function MaterialesDocentePage() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [cursoId, setCursoId] = useState('');
  const [idiomaSel, setIdiomaSel] = useState('');
  const [materiales, setMateriales] = useState<Material[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  const [tipo, setTipo] = useState('MATERIAL');
  const [titulo, setTitulo] = useState('');
  const [semana, setSemana] = useState('');
  const [fecha, setFecha] = useState('');
  const [enlace, setEnlace] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [eliminando, setEliminando] = useState<number | null>(null);
  const inputArchivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${API_URL}/docente/cursos/`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setCursos(data);
          if (data.length === 1) setCursoId(String(data[0].id));
        }
      })
      .catch(() => setMensaje({ tipo: 'error', texto: 'No se pudieron cargar tus cursos.' }))
      .finally(() => setCargando(false));
  }, []);

  const cargarMateriales = async (id: string) => {
    if (!id) {
      setMateriales([]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/cursos/${id}/materiales/`);
      const data = await res.json();
      if (res.ok) setMateriales(data);
      else setMensaje({ tipo: 'error', texto: data.message || 'No se pudieron cargar los materiales.' });
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red al cargar los materiales.' });
    }
  };

  useEffect(() => {
    cargarMateriales(cursoId);
  }, [cursoId]);

  const limpiarFormulario = () => {
    setTitulo('');
    setSemana('');
    setFecha('');
    setEnlace('');
    setDescripcion('');
    setArchivo(null);
    if (inputArchivo.current) inputArchivo.current.value = '';
  };

  const publicar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje(null);
    if (!cursoId) {
      setMensaje({ tipo: 'error', texto: 'Primero elige el curso.' });
      return;
    }
    if (!enlace.trim() && !archivo && !descripcion.trim()) {
      setMensaje({ tipo: 'error', texto: 'Agrega un enlace, un archivo o una descripción.' });
      return;
    }
    if (archivo && archivo.size > 10 * 1024 * 1024) {
      setMensaje({ tipo: 'error', texto: 'El archivo es demasiado grande (máximo 10 MB).' });
      return;
    }

    const datos = new FormData();
    datos.append('tipo', tipo);
    datos.append('titulo', titulo);
    datos.append('semana', semana);
    datos.append('fecha', fecha);
    datos.append('enlace', enlace);
    datos.append('descripcion', descripcion);
    if (archivo) datos.append('archivo', archivo);

    setEnviando(true);
    try {
      const res = await fetch(`${API_URL}/cursos/${cursoId}/materiales/`, { method: 'POST', body: datos });
      const data = await res.json();
      if (res.ok) {
        setMensaje({ tipo: 'exito', texto: data.message });
        limpiarFormulario();
        cargarMateriales(cursoId);
      } else {
        setMensaje({ tipo: 'error', texto: data.message || 'No se pudo publicar el material.' });
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red al publicar.' });
    } finally {
      setEnviando(false);
    }
  };

  const eliminar = async (id: number) => {
    try {
      const res = await fetch(`${API_URL}/materiales/${id}/`, { method: 'DELETE' });
      const data = await res.json();
      setMensaje({ tipo: res.ok ? 'exito' : 'error', texto: data.message || 'Listo.' });
      if (res.ok) cargarMateriales(cursoId);
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red al eliminar.' });
    } finally {
      setEliminando(null);
    }
  };

  const verArchivo = async (id: number) => {
    const error = await abrirArchivoProtegido(`/materiales/${id}/archivo/`);
    if (error) setMensaje({ tipo: 'error', texto: error });
  };

  const cursoActual = cursos.find((c) => String(c.id) === cursoId);
  const ayuda = TIPOS.find((t) => t.valor === tipo)?.ayuda;

  // Agrupa por semana: general, 1, 2, 3, 4
  const grupos = [null, 1, 2, 3, 4]
    .map((s) => ({ semana: s, items: materiales.filter((m) => m.semana === s) }))
    .filter((g) => g.items.length > 0);

  const campo = 'w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500';

  const idiomas = Array.from(new Set(cursos.map((c) => c.idioma || 'Sin idioma'))).sort();
  const cursosDelIdioma = cursos.filter((c) => (c.idioma || 'Sin idioma') === idiomaSel);
  useEffect(() => {
    if (idiomas.length === 1 && !idiomaSel) setIdiomaSel(idiomas[0]);
  }, [idiomas, idiomaSel]);

  const niveles = Array.from(new Set(cursosDelIdioma.map((c) => c.nivel || 'Sin nivel')));

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5"><Paperclip className="w-6 h-6 text-emerald-600 shrink-0" />Materiales para mis estudiantes</h1>
        <p className="text-sm text-slate-500 mt-1">
          Publica el sílabo, el enlace de clase, el cronograma de evaluaciones y tus materiales. Solo los verán los estudiantes matriculados en el curso.
        </p>
      </div>

      {mensaje && (
        <div
          className={`p-3 rounded-xl text-sm font-medium flex justify-between items-center ${
            mensaje.tipo === 'exito'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          <span>{mensaje.texto}</span>
          <button onClick={() => setMensaje(null)} className="ml-4 cursor-pointer opacity-70 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="bg-white p-5 rounded-2xl shadow-sm border border-gray-200">
        <label className="block text-xs font-semibold text-slate-600 mb-1">Curso</label>
        {cargando ? (
          <p className="text-sm text-slate-500">Cargando tus cursos...</p>
        ) : cursos.length === 0 ? (
          <p className="text-sm text-slate-500">No tienes cursos asignados todavía. Pide al INDI que te asigne uno.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">1. Idioma</label>
              <select
                value={idiomaSel}
                onChange={(e) => { setIdiomaSel(e.target.value); setCursoId(''); }}
                className={`${campo} bg-white`}
              >
                <option value="">-- Elige el idioma --</option>
                {idiomas.map((i) => (
                  <option key={i} value={i}>{i}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">2. Curso</label>
              <select
                value={cursoId}
                onChange={(e) => setCursoId(e.target.value)}
                disabled={!idiomaSel}
                className={`${campo} bg-white disabled:bg-slate-50 disabled:text-slate-400`}
              >
                <option value="">{idiomaSel ? '-- Elige el curso --' : 'Primero elige el idioma'}</option>
                {niveles.map((nv) => (
                  <optgroup key={nv} label={nv}>
                    {cursosDelIdioma.filter((c) => (c.nivel || 'Sin nivel') === nv).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.subnivel} · {c.modalidad === 'VIRTUAL' ? 'Virtual' : 'Presencial'} · {c.horario || 'sin horario'} · {c.periodo} ({c.total_matriculados} matriculados)
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {cursoActual && (
        <>
          <form onSubmit={publicar} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-4">
            <h2 className="text-lg font-semibold text-emerald-700">Nuevo material</h2>

            <div className="flex flex-wrap gap-2">
              {TIPOS.map((t) => (
                <button
                  key={t.valor}
                  type="button"
                  onClick={() => setTipo(t.valor)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    tipo === t.valor
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {t.texto}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">{ayuda}</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Título</label>
                <input
                  type="text"
                  required
                  maxLength={150}
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ej: Clase 3 - Present Perfect"
                  className={campo}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">¿A qué semana corresponde?</label>
                <select value={semana} onChange={(e) => setSemana(e.target.value)} className={`${campo} bg-white`}>
                  <option value="">Material general del curso</option>
                  <option value="1">Semana 1</option>
                  <option value="2">Semana 2</option>
                  <option value="3">Semana 3</option>
                  <option value="4">Semana 4</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Fecha (clase o evaluación)</label>
                <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={campo} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Enlace (opcional)</label>
                <input
                  type="url"
                  value={enlace}
                  onChange={(e) => setEnlace(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className={campo}
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Archivo (opcional · PDF, Word, PowerPoint, Excel o imagen · máx. 10 MB)
                </label>
                <input
                  ref={inputArchivo}
                  type="file"
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={(e) => setArchivo(e.target.files ? e.target.files[0] : null)}
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Descripción o indicaciones (opcional)</label>
                <textarea
                  rows={3}
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Ej: Traer diccionario. La evaluación incluye listening."
                  className={campo}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={enviando}
                className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {enviando ? 'Publicando...' : 'Publicar para mis estudiantes'}
              </button>
            </div>
          </form>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 space-y-5">
            <h2 className="text-lg font-semibold text-gray-800">Material publicado ({materiales.length})</h2>
            {grupos.length === 0 && (
              <p className="text-sm text-slate-400">Todavía no has publicado nada en este curso.</p>
            )}
            {grupos.map((g) => (
              <div key={String(g.semana)}>
                <h3 className="text-xs font-bold uppercase text-slate-500 mb-2">
                  {g.semana ? `Semana ${g.semana}` : 'General'}
                </h3>
                <ul className="divide-y border rounded-xl">
                  {g.items.map((m) => (
                    <li key={m.id} className="p-3 flex flex-col md:flex-row md:items-center gap-3 justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${ETIQUETA_TIPO[m.tipo] || ''}`}>
                            {m.tipo_nombre}
                          </span>
                          <span className="text-sm font-medium text-gray-800">{m.titulo}</span>
                          {m.fecha && (
                            <span className="text-xs text-slate-400">
                              {new Date(m.fecha + 'T00:00:00').toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {m.descripcion && <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{m.descripcion}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {m.enlace && (
                          <a
                            href={m.enlace}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 bg-sky-50 text-sky-700 border border-sky-200 rounded-lg text-xs font-semibold"
                          >
                            <Link2 className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />Enlace
                          </a>
                        )}
                        {m.tiene_archivo && (
                          <button
                            type="button"
                            onClick={() => verArchivo(m.id)}
                            className="px-3 py-1.5 bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            <FileText className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />Archivo
                          </button>
                        )}
                        {eliminando === m.id ? (
                          <>
                            <button
                              onClick={() => eliminar(m.id)}
                              className="px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold cursor-pointer"
                            >
                              Sí, eliminar
                            </button>
                            <button
                              onClick={() => setEliminando(null)}
                              className="px-3 py-1.5 border rounded-lg text-xs cursor-pointer"
                            >
                              Cancelar
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setEliminando(m.id)}
                            className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            Eliminar
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
