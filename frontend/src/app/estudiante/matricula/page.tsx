'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import SelectorCurso, { CursoCatalogo } from '../../../components/SelectorCurso';
import { abrirArchivoProtegido, API_URL } from '../../../lib/abrirArchivo';
import Paginador, { usePaginacion } from '../../../components/ui/Paginador';
import { FileText, PlusCircle, Receipt } from "lucide-react";

interface Inscripcion {
  id: number;
  curso_nombre: string;
  modalidad: string;
  horario: string;
  periodo: string;
  monto: number;
  estado: string;
  tiene_voucher: boolean;
  motivo_rechazo?: string;
  fecha: string;
}

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  ESPERANDO_PAGO: { texto: 'Esperando pago', clase: 'bg-amber-50 text-amber-700 border-amber-200' },
  PENDIENTE: { texto: 'Pago en revisión', clase: 'bg-sky-50 text-sky-700 border-sky-200' },
  APROBADA: { texto: 'Matriculado', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  RECHAZADA: { texto: 'Rechazada', clase: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export default function InscripcionCursosPage() {
  const [cursos, setCursos] = useState<CursoCatalogo[]>([]);
  const [inscripciones, setInscripciones] = useState<Inscripcion[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursoId, setCursoId] = useState('');
  const [tipo, setTipo] = useState('PUBLICO');
  const [codigoUni, setCodigoUni] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [nuevaOrden, setNuevaOrden] = useState<number | null>(null);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState<number | null>(null);

  const cancelarInscripcion = async (id: number) => {
    setMensaje(null);
    try {
      const res = await fetch(`${API_URL}/matriculas/${id}/cancelar/`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setConfirmandoCancelar(null);
      setMensaje({ tipo: res.ok ? 'exito' : 'error', texto: data.message || (res.ok ? 'Inscripción cancelada.' : 'No se pudo cancelar.') });
      if (res.ok) {
        setNuevaOrden(null);
        await cargarDatos();
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red al cancelar.' });
    }
  };

  const cargarDatos = async () => {
    try {
      const [rc, rm, rp] = await Promise.all([
        fetch(`${API_URL}/cursos/`),
        fetch(`${API_URL}/matriculas/`),
        fetch(`${API_URL}/perfil/`),
      ]);
      if (rc.ok) setCursos(await rc.json());
      if (rm.ok) setInscripciones(await rm.json());
      if (rp.ok) {
        // Se usan los datos que dio al registrarse
        const perfil = await rp.json();
        setTipo(perfil.tipo_postulante || 'PUBLICO');
        setCodigoUni(perfil.codigo_universitario || '');
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo conectar con el servidor.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    cargarDatos();
  }, []);

  const handleInscribirse = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje(null);
    setNuevaOrden(null);

    if (!cursoId) {
      setMensaje({ tipo: 'error', texto: 'Elige tu curso: idioma, modalidad, horario y nivel.' });
      return;
    }
    if (tipo === 'UNSCH' && codigoUni.length !== 8) {
      setMensaje({ tipo: 'error', texto: 'El código de estudiante UNSCH debe tener 8 dígitos.' });
      return;
    }

    setEnviando(true);
    try {
      const res = await fetch(`${API_URL}/matriculas/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          curso_id: Number(cursoId),
          tipo_postulante: tipo,
          codigo_universitario: tipo === 'UNSCH' ? codigoUni : '',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMensaje({ tipo: 'exito', texto: data.message });
        setNuevaOrden(data.solicitud_id);
        setCursoId('');
        cargarDatos();
      } else {
        setMensaje({ tipo: 'error', texto: data.message || 'No se pudo procesar la inscripción.' });
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red al intentar inscribirte.' });
    } finally {
      setEnviando(false);
    }
  };

  const abrir = async (ruta: string) => {
    const error = await abrirArchivoProtegido(ruta);
    if (error) setMensaje({ tipo: 'error', texto: error });
  };

  const campo = 'w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500';

  const pg = usePaginacion(inscripciones, 8);

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2.5"><PlusCircle className="w-6 h-6 text-indigo-600 shrink-0" />Inscripción a Nuevos Cursos</h1>
        <p className="text-sm text-slate-500 mt-1">
          Elige idioma, modalidad, horario y nivel. Se generará tu orden de pago.
        </p>
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
          {nuevaOrden && (
            <div className="flex flex-wrap gap-3 mt-3">
              <button
                type="button"
                onClick={() => abrir(`/solicitudes/${nuevaOrden}/pdf/`)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                <FileText className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />Descargar orden de pago
              </button>
              <Link
                href="/estudiante/dashboard"
                className="px-4 py-2 bg-white border border-emerald-300 text-emerald-800 rounded-lg text-xs font-semibold"
              >
                Subir mi voucher →
              </Link>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleInscribirse} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-6">
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-slate-800">1. Elige tu curso</h2>
          <SelectorCurso cursos={cursos} value={cursoId} onChange={setCursoId} />
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold text-slate-800">2. Tipo de postulante</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={`${campo} bg-white`}>
                <option value="PUBLICO">Público general — S/ 120.00</option>
                <option value="UNSCH">Estudiante UNSCH — S/ 90.00</option>
              </select>
            </div>
            {tipo === 'UNSCH' && (
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={8}
                  placeholder="Código universitario (8 dígitos)"
                  value={codigoUni}
                  onChange={(e) => setCodigoUni(e.target.value.replace(/\D/g, ''))}
                  className={`${campo} font-mono`}
                />
              </div>
            )}
          </div>
        </section>

        <button
          type="submit"
          disabled={enviando || !cursoId}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold text-sm transition shadow-sm disabled:opacity-50 cursor-pointer"
        >
          {enviando ? 'Procesando...' : 'Inscribirme y generar orden de pago'}
        </button>
      </form>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <h2 className="text-md font-semibold text-slate-800 mb-4">Mis inscripciones</h2>
        {loading ? (
          <p className="text-slate-500 text-sm">Cargando...</p>
        ) : inscripciones.length === 0 ? (
          <p className="text-slate-500 text-sm">Aún no te has inscrito en ningún curso.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b text-xs uppercase text-slate-500">
                  <th className="p-3">Curso</th>
                  <th className="p-3">Monto</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-center">Documentos</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y">
                {pg.items.map((m) => {
                  const est = ESTADOS[m.estado] || { texto: m.estado, clase: 'bg-slate-50 text-slate-700 border-slate-200' };
                  return (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="p-3">
                        <div className="font-medium text-slate-800">{m.curso_nombre}</div>
                        <div className="text-xs text-slate-400">
                          {m.modalidad === 'VIRTUAL' ? 'Virtual' : 'Presencial'} · {m.horario || 'Horario por definir'} · {m.periodo}
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">S/ {m.monto.toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${est.clase}`}>{est.texto}</span>
                        {m.estado === 'RECHAZADA' && m.motivo_rechazo && (
                          <p className="mt-1.5 text-xs text-rose-600 max-w-[220px]">Motivo: {m.motivo_rechazo}</p>
                        )}
                      </td>
                      <td className="p-3 text-center space-x-2 whitespace-nowrap">
                        {(m.estado === 'ESPERANDO_PAGO' || m.estado === 'PENDIENTE') && (
                          <button
                            type="button"
                            onClick={() => abrir(`/solicitudes/${m.id}/pdf/`)}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            <FileText className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />Orden
                          </button>
                        )}
                        {m.tiene_voucher && (
                          <button
                            type="button"
                            onClick={() => abrir(`/matriculas/${m.id}/voucher/`)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 cursor-pointer"
                          >
                            <Receipt className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />Mi voucher
                          </button>
                        )}
                        {m.estado === 'ESPERANDO_PAGO' && (
                          <Link
                            href="/estudiante/dashboard"
                            className="inline-block px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-semibold border border-indigo-200"
                          >
                            Subir voucher
                          </Link>
                        )}
                        {m.estado === 'RECHAZADA' && (
                          <Link
                            href="/estudiante/dashboard"
                            className="inline-block px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold"
                          >
                            Corregir y reenviar
                          </Link>
                        )}
                        {m.estado === 'ESPERANDO_PAGO' && !m.tiene_voucher && (
                          confirmandoCancelar === m.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-xs text-slate-500">¿Cancelar?</span>
                              <button
                                type="button"
                                onClick={() => cancelarInscripcion(m.id)}
                                className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-xs font-semibold cursor-pointer"
                              >
                                Sí
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmandoCancelar(null)}
                                className="px-2.5 py-1 border border-slate-200 rounded-lg text-xs cursor-pointer"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmandoCancelar(m.id)}
                              className="px-3 py-1.5 text-slate-500 hover:text-rose-600 text-xs font-medium underline cursor-pointer"
                            >
                              Cancelar
                            </button>
                          )
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {!loading && <Paginador pg={pg} className="-mx-6 -mb-6 mt-4 rounded-b-2xl" />}
      </div>
    </div>
  );
}
