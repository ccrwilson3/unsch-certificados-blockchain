'use client';

import { useState, useEffect } from 'react';

interface Solicitud {
  id: number;
  curso_nombre: string;
  estado: string;
  fecha_solicitud: string;
}

export default function EstudianteDashboard() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [solicitudSeleccionada, setSolicitudSeleccionada] = useState('');
  const [voucher, setVoucher] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSolicitudes();
  }, []);

  const fetchSolicitudes = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;

      const res = await fetch('http://127.0.0.1:8000/api/matriculas/', {
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}` 
        }
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data)) {
        setSolicitudes(data);
        // Si hay una sola solicitud esperando pago, la seleccionamos por defecto para evitar campos innecesarios
        const pendientes = data.filter(s => s.estado === 'ESPERANDO_PAGO');
        if (pendientes.length === 1) {
          setSolicitudSeleccionada(pendientes[0].id.toString());
        }
      }
    } catch (err) {
      console.error('Error al cargar solicitudes', err);
    }
  };

  const handleSubirVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!solicitudSeleccionada || !voucher) {
      setMensaje({ tipo: 'error', texto: 'Selecciona la orden y adjunta el archivo del voucher.' });
      return;
    }

    setLoading(true);
    setMensaje(null);

    const formData = new FormData();
    formData.append('solicitud_id', solicitudSeleccionada);
    formData.append('voucher_pago', voucher);

    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch('http://127.0.0.1:8000/api/auth/subir-voucher/', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
        body: formData
      });
      const data = await res.json();

      if (res.ok) {
        setMensaje({ tipo: 'exito', texto: '¡Voucher enviado con éxito! En revisión por el INDI.' });
        setVoucher(null);
        fetchSolicitudes();
      } else {
        setMensaje({ tipo: 'error', texto: data.message || 'Error al subir el voucher.' });
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error de red al enviar el comprobante.' });
    } finally {
      setLoading(false);
    }
  };

  const pendientesPago = solicitudes.filter(s => s.estado === 'ESPERANDO_PAGO');

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h1 className="text-xl font-bold text-slate-800">💳 Órdenes de Pago y Validación de Comprobantes</h1>
          <p className="text-sm text-slate-500 mt-1">Descarga tu orden generada y adjunta tu voucher de pago de Interbank para completar tu matrícula.</p>
        </div>

        {mensaje && (
          <div className={`p-4 rounded-xl text-sm font-medium ${mensaje.tipo === 'exito' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
            {mensaje.texto}
          </div>
        )}

        {/* Sección para subir voucher */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-md font-semibold text-indigo-700">Subir Voucher de Pago (Interbank)</h2>
          
          <form onSubmit={handleSubirVoucher} className="space-y-4">
            {pendientesPago.length > 1 && (
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Seleccionar Orden de Pago</label>
                <select
                  value={solicitudSeleccionada}
                  onChange={(e) => setSolicitudSeleccionada(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
                >
                  <option value="">-- Selecciona tu orden pendiente --</option>
                  {pendientesPago.map(s => (
                    <option key={s.id} value={s.id}>
                      Orden #{s.id} - {s.curso_nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Archivo del Voucher (Imagen o PDF)</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => setVoucher(e.target.files ? e.target.files[0] : null)}
                required
                className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
              />
            </div>

            <button
              type="submit"
              disabled={loading || pendientesPago.length === 0}
              className="py-2.5 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-50"
            >
              {loading ? 'Enviando...' : 'Enviar Voucher para Validación'}
            </button>
          </form>
        </div>

        {/* Historial */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <h2 className="text-md font-semibold text-slate-800 mb-3">Historial de Órdenes y Pagos</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b text-xs uppercase text-slate-500">
                  <th className="p-3">Curso</th>
                  <th className="p-3">Fecha</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-center">Acción / Orden PDF</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y">
                {solicitudes.map(s => (
                  <tr key={s.id}>
                    <td className="p-3 font-medium text-slate-800">{s.curso_nombre}</td>
                    <td className="p-3 text-slate-500 text-xs">{new Date(s.fecha_solicitud).toLocaleDateString()}</td>
                    <td className="p-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                        s.estado === 'APROBADA' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}>
                        {s.estado}
                      </span>
                    </td>
                    <td className="p-3 text-center">
                      {s.estado === 'ESPERANDO_PAGO' ? (
                        <a
                          href={`http://127.0.0.1:8000/api/solicitudes/${s.id}/pdf/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold transition"
                        >
                          📄 Descargar Orden PDF
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">Procesado</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}