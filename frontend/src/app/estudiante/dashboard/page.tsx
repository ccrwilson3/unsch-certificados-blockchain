'use client';

import { useState, useEffect } from 'react';
import { abrirArchivoProtegido, API_URL } from '../../../lib/abrirArchivo';
import Paginador, { usePaginacion } from '../../../components/ui/Paginador';
import { CreditCard, FileText, Receipt } from "lucide-react";

interface Solicitud {
  id: number;
  curso_nombre: string;
  modalidad: string;
  horario: string;
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

const MAX_BYTES = 5 * 1024 * 1024;

export default function EstudianteDashboard() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState('');
  const [voucher, setVoucher] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSolicitudes = async () => {
    try {
      const res = await fetch(`${API_URL}/matriculas/`);
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setSolicitudes(data);
        // Si hay una sola orden por pagar o por corregir, queda elegida
        const porPagar = data.filter((s: Solicitud) => s.estado === 'ESPERANDO_PAGO' || s.estado === 'RECHAZADA');
        const unicaSubible = data.filter((s: Solicitud) => ['ESPERANDO_PAGO', 'PENDIENTE', 'RECHAZADA'].includes(s.estado));
        if (porPagar.length === 1) setSolicitudSeleccionada(String(porPagar[0].id));
        else if (unicaSubible.length === 1) setSolicitudSeleccionada(String(unicaSubible[0].id));
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'No se pudieron cargar tus órdenes.' });
    }
  };

  useEffect(() => {
    fetchSolicitudes();
  }, []);

  const elegirArchivo = (archivo: File | null) => {
    setMensaje(null);
    if (archivo) {
      const ext = archivo.name.split('.').pop()?.toLowerCase() || '';
      if (!['jpg', 'jpeg', 'png', 'pdf'].includes(ext)) {
        setMensaje({ tipo: 'error', texto: 'El voucher debe ser una imagen JPG o PNG, o un PDF.' });
        setVoucher(null);
        return;
      }
      if (archivo.size > MAX_BYTES) {
        setMensaje({ tipo: 'error', texto: 'El archivo es demasiado grande (máximo 5 MB).' });
        setVoucher(null);
        return;
      }
    }
    setVoucher(archivo);
  };

  const handleSubirVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!solicitudSeleccionada || !voucher) {
      setMensaje({ tipo: 'error', texto: 'Elige la orden y adjunta el archivo del voucher.' });
      return;
    }

    setLoading(true);
    setMensaje(null);
    const formData = new FormData();
    formData.append('solicitud_id', solicitudSeleccionada);
    formData.append('voucher_pago', voucher);

    try {
      const res = await fetch(`${API_URL}/auth/subir-voucher/`, { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setMensaje({ tipo: 'exito', texto: data.message || '¡Voucher enviado! El INDI lo revisará y te matriculará.' });
        setVoucher(null);
        setSolicitudSeleccionada('');
        fetchSolicitudes();
      } else {
        setMensaje({ tipo: 'error', texto: data.message || 'Error al subir el voucher.' });
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red al enviar el comprobante.' });
    } finally {
      setLoading(false);
    }
  };

  const abrir = async (ruta: string) => {
    const error = await abrirArchivoProtegido(ruta);
    if (error) setMensaje({ tipo: 'error', texto: error });
  };

  // Se puede subir voucher mientras la orden espera pago o está en revisión (para corregirlo)
  const subibles = solicitudes.filter((s) => ['ESPERANDO_PAGO', 'PENDIENTE', 'RECHAZADA'].includes(s.estado));
  const elegida = solicitudes.find((s) => String(s.id) === solicitudSeleccionada);

  const pg = usePaginacion(solicitudes, 8);

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2.5"><CreditCard className="w-6 h-6 text-indigo-600 shrink-0" />Órdenes de Pago y Vouchers</h1>
          <p className="text-sm text-slate-500 mt-1">
            Descarga tu orden, paga en Interbank y sube aquí la foto o el PDF de tu voucher.
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
          </div>
        )}

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-md font-semibold text-indigo-700">Subir voucher de pago</h2>

          {subibles.length === 0 ? (
            <p className="text-sm text-slate-500">No tienes órdenes pendientes de pago.</p>
          ) : (
            <form onSubmit={handleSubirVoucher} className="space-y-4">
              {subibles.length > 1 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">¿Para qué orden es este voucher?</label>
                  <select
                    value={solicitudSeleccionada}
                    onChange={(e) => setSolicitudSeleccionada(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="">-- Elige tu orden --</option>
                    {subibles.map((s) => (
                      <option key={s.id} value={s.id}>
                        Orden #{String(s.id).padStart(5, '0')} · {s.curso_nombre} · S/ {s.monto.toFixed(2)}
                        {s.estado === 'PENDIENTE' ? ' (reemplazar voucher)' : ''}
                        {s.estado === 'RECHAZADA' ? ' (corregir y reenviar)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {elegida?.estado === 'RECHAZADA' && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                  <p className="font-semibold">El INDI rechazó esta matrícula</p>
                  <p className="mt-0.5">Motivo: {elegida.motivo_rechazo || 'No se especificó un motivo.'}</p>
                  <p className="mt-1 text-rose-700">Corrige el problema y sube un voucher correcto: tu matrícula volverá a revisión.</p>
                </div>
              )}
              {elegida?.estado === 'PENDIENTE' && (
                <p className="text-xs text-slate-500">
                  Esta orden ya tiene un voucher en revisión. Si te equivocaste, súbelo de nuevo y reemplazará al anterior.
                </p>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Archivo del voucher (JPG, PNG o PDF, máximo 5 MB)
                </label>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf,image/*,application/pdf"
                  onChange={(e) => elegirArchivo(e.target.files ? e.target.files[0] : null)}
                  required
                  className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !voucher}
                className="py-2.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Enviando...' : elegida?.estado === 'RECHAZADA' ? 'Enviar corrección' : 'Enviar voucher para validación'}
              </button>
            </form>
          )}
        </div>

        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-md font-semibold text-slate-800 mb-3">Historial de órdenes</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b text-xs uppercase text-slate-500">
                  <th className="p-3">Orden / Curso</th>
                  <th className="p-3">Monto</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-center">Documentos</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y">
                {solicitudes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-400">Aún no tienes órdenes.</td>
                  </tr>
                )}
                {pg.items.map((s) => {
                  const est = ESTADOS[s.estado] || { texto: s.estado, clase: 'bg-slate-50 text-slate-700 border-slate-200' };
                  return (
                    <tr key={s.id}>
                      <td className="p-3">
                        <div className="font-medium text-slate-800">{s.curso_nombre}</div>
                        <div className="text-xs text-slate-400">
                          Orden #{String(s.id).padStart(5, '0')} · {s.fecha ? new Date(s.fecha).toLocaleDateString() : ''}
                        </div>
                      </td>
                      <td className="p-3 text-slate-600">S/ {s.monto.toFixed(2)}</td>
                      <td className="p-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${est.clase}`}>{est.texto}</span>
                        {s.estado === 'RECHAZADA' && s.motivo_rechazo && (
                          <p className="mt-1.5 text-xs text-rose-600 max-w-[220px]">Motivo: {s.motivo_rechazo}</p>
                        )}
                      </td>
                      <td className="p-3 text-center space-x-2 whitespace-nowrap">
                        {(s.estado === 'ESPERANDO_PAGO' || s.estado === 'PENDIENTE') && (
                          <button
                            type="button"
                            onClick={() => abrir(`/solicitudes/${s.id}/pdf/`)}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            <FileText className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />Orden PDF
                          </button>
                        )}
                        {s.estado === 'RECHAZADA' && (
                          <button
                            type="button"
                            onClick={() => { setSolicitudSeleccionada(String(s.id)); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
                          >
                            Corregir voucher
                          </button>
                        )}
                        {s.tiene_voucher && (
                          <button
                            type="button"
                            onClick={() => abrir(`/matriculas/${s.id}/voucher/`)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 cursor-pointer"
                          >
                            <Receipt className="w-4 h-4 inline-block -mt-0.5 mr-1.5" />Ver mi voucher
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Paginador pg={pg} className="-mx-6 -mb-6 mt-4 rounded-b-2xl" />
        </div>
      </div>
    </div>
  );
}
