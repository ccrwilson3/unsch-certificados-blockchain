'use client';

import { useState, useEffect } from 'react';
import { abrirArchivoProtegido, API_URL } from '../../../lib/abrirArchivo';
import Paginador, { usePaginacion } from '../../../components/ui/Paginador';
import { ClipboardList, Receipt, X } from "lucide-react";

interface Matricula {
  id: number;
  estudiante: string;
  estudiante_dni: string;
  curso_nombre: string;
  modalidad: string;
  horario: string;
  periodo: string;
  tipo_postulante: string;
  monto: number;
  estado: string;
  tiene_voucher: boolean;
  fecha: string;
}

const ESTADOS: Record<string, { texto: string; clase: string }> = {
  ESPERANDO_PAGO: { texto: 'Esperando pago', clase: 'bg-amber-50 text-amber-700 border-amber-200' },
  PENDIENTE: { texto: 'Por validar', clase: 'bg-sky-50 text-sky-700 border-sky-200' },
  APROBADA: { texto: 'Matriculado', clase: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  RECHAZADA: { texto: 'Rechazada', clase: 'bg-rose-50 text-rose-700 border-rose-200' },
};

const FILTROS = [
  { clave: 'PENDIENTE', texto: 'Por validar' },
  { clave: 'ESPERANDO_PAGO', texto: 'Esperando pago' },
  { clave: 'APROBADA', texto: 'Matriculados' },
  { clave: 'RECHAZADA', texto: 'Rechazadas' },
  { clave: 'TODAS', texto: 'Todas' },
];

export default function GestionMatriculasINDI() {
  const [matriculas, setMatriculas] = useState<Matricula[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('PENDIENTE');
  const [busqueda, setBusqueda] = useState('');
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [procesando, setProcesando] = useState<number | null>(null);
  const [confirmandoRechazo, setConfirmandoRechazo] = useState<number | null>(null);

  const fetchMatriculas = async () => {
    try {
      const res = await fetch(`${API_URL}/matriculas/`);
      const data = await res.json();
      if (res.ok) setMatriculas(data);
      else setMensaje({ tipo: 'error', texto: data.message || 'Error al cargar las matrículas.' });
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudo conectar con el servidor.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMatriculas();
  }, []);

  const handleAccion = async (id: number, accion: 'aprobar' | 'rechazar') => {
    setProcesando(id);
    setConfirmandoRechazo(null);
    try {
      const res = await fetch(`${API_URL}/matriculas/${id}/aprobar/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion }),
      });
      const data = await res.json();
      setMensaje({ tipo: res.ok ? 'exito' : 'error', texto: data.message || (res.ok ? 'Listo.' : 'No se pudo procesar.') });
      if (res.ok) fetchMatriculas();
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red al procesar la matrícula.' });
    } finally {
      setProcesando(null);
    }
  };

  const verVoucher = async (id: number) => {
    const error = await abrirArchivoProtegido(`/matriculas/${id}/voucher/`);
    if (error) setMensaje({ tipo: 'error', texto: error });
  };

  const contar = (clave: string) =>
    clave === 'TODAS' ? matriculas.length : matriculas.filter((m) => m.estado === clave).length;

  const texto = busqueda.trim().toLowerCase();
  const visibles = matriculas.filter(
    (m) =>
      (filtro === 'TODAS' || m.estado === filtro) &&
      (!texto ||
        m.estudiante.toLowerCase().includes(texto) ||
        m.estudiante_dni.includes(texto) ||
        m.curso_nombre.toLowerCase().includes(texto))
  );

  const pg = usePaginacion(visibles, 10, `${filtro}|${busqueda}`);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2.5"><ClipboardList className="w-6 h-6 text-amber-600 shrink-0" />Gestión de Matrículas</h1>
        <p className="text-sm text-slate-500 mt-1">
          Revisa el voucher de cada estudiante y confirma su matrícula.
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

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="flex flex-wrap gap-2">
          {FILTROS.map((f) => (
            <button
              key={f.clave}
              type="button"
              onClick={() => setFiltro(f.clave)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                filtro === f.clave
                  ? 'bg-amber-600 text-white border-amber-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.texto} ({contar(f.clave)})
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar por nombre, DNI o curso..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="w-full md:w-72 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="p-6 text-gray-500 text-sm">Cargando solicitudes...</p>
        ) : visibles.length === 0 ? (
          <p className="p-8 text-center text-gray-400 text-sm">No hay matrículas en esta vista.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b text-xs uppercase text-gray-600">
                  <th className="p-3">Estudiante</th>
                  <th className="p-3">Curso solicitado</th>
                  <th className="p-3">Pago</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y">
                {pg.items.map((m) => {
                  const est = ESTADOS[m.estado] || { texto: m.estado, clase: 'bg-slate-50 text-slate-700 border-slate-200' };
                  return (
                    <tr key={m.id} className="hover:bg-gray-50 transition">
                      <td className="p-3">
                        <div className="font-medium text-gray-800">{m.estudiante}</div>
                        <div className="text-xs text-gray-400">
                          DNI {m.estudiante_dni} · {m.tipo_postulante === 'UNSCH' ? 'Estudiante UNSCH' : 'Público general'}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-gray-800">{m.curso_nombre}</div>
                        <div className="text-xs text-gray-400">
                          {m.modalidad === 'VIRTUAL' ? 'Virtual' : 'Presencial'} · {m.horario || 'Sin horario'} · {m.periodo}
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="text-gray-700 font-medium">S/ {m.monto.toFixed(2)}</div>
                        {m.tiene_voucher ? (
                          <button
                            type="button"
                            onClick={() => verVoucher(m.id)}
                            className="mt-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            <Receipt className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />Ver voucher
                          </button>
                        ) : (
                          <div className="text-xs text-gray-400 mt-1">Sin voucher</div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${est.clase}`}>{est.texto}</span>
                      </td>
                      <td className="p-3 text-center whitespace-nowrap">
                        {m.estado === 'PENDIENTE' && (
                          confirmandoRechazo === m.id ? (
                            <span className="space-x-2">
                              <span className="text-xs text-slate-500">¿Rechazar?</span>
                              <button
                                onClick={() => handleAccion(m.id, 'rechazar')}
                                className="bg-rose-600 text-white px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer"
                              >
                                Sí
                              </button>
                              <button
                                onClick={() => setConfirmandoRechazo(null)}
                                className="px-3 py-1 rounded-lg text-xs border cursor-pointer"
                              >
                                No
                              </button>
                            </span>
                          ) : (
                            <span className="space-x-2">
                              <button
                                disabled={procesando === m.id}
                                onClick={() => handleAccion(m.id, 'aprobar')}
                                className="bg-emerald-600 text-white px-3 py-1 rounded-lg text-xs hover:bg-emerald-700 transition font-semibold disabled:opacity-50 cursor-pointer"
                              >
                                Aprobar
                              </button>
                              <button
                                disabled={procesando === m.id}
                                onClick={() => setConfirmandoRechazo(m.id)}
                                className="bg-rose-50 text-rose-700 border border-rose-200 px-3 py-1 rounded-lg text-xs hover:bg-rose-100 transition font-semibold disabled:opacity-50 cursor-pointer"
                              >
                                Rechazar
                              </button>
                            </span>
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
        {!loading && <Paginador pg={pg} acento="amber" />}
      </div>
    </div>
  );
}
