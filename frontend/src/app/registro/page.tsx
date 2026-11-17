'use client';

import { useState, useEffect } from 'react';
import SelectorCurso, { CursoCatalogo } from '../../components/SelectorCurso';
import { abrirArchivoProtegido, API_URL } from '../../lib/abrirArchivo';

type Mensaje = { tipo: 'exito' | 'error' | 'info'; texto: string } | null;

export default function RegistroMatriculaPublica() {
  const [cursos, setCursos] = useState<CursoCatalogo[]>([]);

  // Datos personales y de contacto
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [celular, setCelular] = useState('');
  const [email, setEmail] = useState('');

  // Datos académicos
  const [tipoPostulante, setTipoPostulante] = useState('PUBLICO');
  const [codigoUni, setCodigoUni] = useState('');
  const [cursoId, setCursoId] = useState('');

  // Resultado del registro
  const [solicitudIdCreada, setSolicitudIdCreada] = useState<number | null>(null);
  const [montoCreado, setMontoCreado] = useState<number | null>(null);

  const [mensaje, setMensaje] = useState<Mensaje>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/cursos/`)
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setCursos(data);
      })
      .catch(() =>
        setMensaje({ tipo: 'error', texto: 'No se pudo cargar la lista de cursos. Actualiza la página.' })
      );
  }, []);

  const handleRegistro = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensaje(null);

    if (!cursoId) {
      setMensaje({ tipo: 'error', texto: 'Elige tu curso: idioma, modalidad, horario y nivel.' });
      return;
    }
    if (dni.length !== 8) {
      setMensaje({ tipo: 'error', texto: 'El DNI debe contener exactamente 8 dígitos numéricos.' });
      return;
    }
    if (password.length < 8) {
      setMensaje({ tipo: 'error', texto: 'La contraseña debe tener al menos 8 caracteres.' });
      return;
    }
    if (tipoPostulante === 'UNSCH' && codigoUni.length !== 8) {
      setMensaje({ tipo: 'error', texto: 'El código de estudiante UNSCH debe contener exactamente 8 dígitos.' });
      return;
    }
    if (celular.length !== 9) {
      setMensaje({ tipo: 'error', texto: 'El número de celular debe contener exactamente 9 dígitos.' });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/registro-orden-pago/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: dni,
          password,
          first_name: nombres,
          last_name: apellidos,
          email,
          celular,
          tipo_postulante: tipoPostulante,
          codigo_universitario: tipoPostulante === 'UNSCH' ? codigoUni : '',
          curso_id: cursoId,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        // La sesión queda iniciada: así puede descargar su orden y luego subir su voucher
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify({ ...data.user, token: data.token }));
        setSolicitudIdCreada(data.solicitud_id);
        setMontoCreado(data.monto);
        setMensaje(null);
      } else if (res.status === 400 && String(data.message || '').includes('ya se encuentra registrado')) {
        setMensaje({
          tipo: 'info',
          texto: 'Este DNI ya cuenta con una cuenta. Inicia sesión y usa "Inscripción a Cursos" para matricularte.',
        });
      } else {
        setMensaje({ tipo: 'error', texto: data.message || 'Ocurrió un error al procesar el registro.' });
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'Error de red al conectar con el servidor.' });
    } finally {
      setLoading(false);
    }
  };

  const descargarOrden = async () => {
    const error = await abrirArchivoProtegido(`/solicitudes/${solicitudIdCreada}/pdf/`);
    if (error) setMensaje({ tipo: 'error', texto: error });
  };

  const campo = 'w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white p-8 rounded-2xl shadow-md border border-slate-200 space-y-6">
        <div>
          <span className="text-xs font-bold px-2.5 py-1 bg-indigo-600 rounded-full text-white">INDI - UNSCH</span>
          <h1 className="text-2xl font-bold text-slate-800 mt-3">Matrícula en línea</h1>
          <p className="text-sm text-slate-500 mt-1">
            Crea tu cuenta, elige tu curso y obtén tu orden de pago para abonar en Interbank.
          </p>
        </div>

        {mensaje && (
          <div
            className={`p-4 rounded-xl text-sm font-medium ${
              mensaje.tipo === 'exito'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : mensaje.tipo === 'info'
                ? 'bg-sky-50 text-sky-700 border border-sky-200'
                : 'bg-rose-50 text-rose-700 border border-rose-200'
            }`}
          >
            {mensaje.texto}
            {mensaje.tipo === 'info' && (
              <div className="mt-2">
                <a href="/login" className="underline font-bold text-indigo-700">Ir a Iniciar Sesión</a>
              </div>
            )}
          </div>
        )}

        {solicitudIdCreada ? (
          <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl space-y-4">
            <h3 className="font-bold text-emerald-800 text-lg text-center">¡Cuenta creada y matrícula registrada!</h3>
            <ol className="text-sm text-emerald-900 space-y-2 list-decimal list-inside">
              <li>
                Descarga tu orden de pago
                {montoCreado !== null && <> (monto a pagar: <strong>S/ {montoCreado.toFixed(2)}</strong>)</>}.
              </li>
              <li>Paga en cualquier agente Interbank con tu DNI y la orden de pago.</li>
              <li>Ingresa a tu panel y sube la foto o el PDF de tu voucher. El INDI validará tu pago.</li>
            </ol>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <button
                type="button"
                onClick={descargarOrden}
                className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm transition shadow-sm cursor-pointer"
              >
                📄 Descargar Orden de Pago N° {String(solicitudIdCreada).padStart(5, '0')}
              </button>
              <a
                href="/estudiante/dashboard"
                className="px-6 py-3 bg-white hover:bg-emerald-100 text-emerald-800 font-semibold rounded-xl text-sm border border-emerald-300 text-center transition"
              >
                Ir a subir mi voucher →
              </a>
            </div>
            <p className="text-xs text-emerald-700 text-center">
              Tu usuario es tu DNI y tu contraseña es la que acabas de crear.
            </p>
          </div>
        ) : (
          <form onSubmit={handleRegistro} className="space-y-6">
            <section className="space-y-3">
              <h2 className="text-sm font-bold text-slate-800">1. Elige tu curso</h2>
              <SelectorCurso cursos={cursos} value={cursoId} onChange={setCursoId} />
            </section>

            <section className="space-y-4">
              <h2 className="text-sm font-bold text-slate-800">2. Tus datos</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">DNI (será tu usuario)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={8}
                    placeholder="Ej: 71234567"
                    value={dni}
                    onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                    required
                    className={`${campo} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Crear contraseña (mínimo 8)</label>
                  <div className="relative">
                    <input
                      type={mostrarPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className={`${campo} pr-14`}
                    />
                    <button
                      type="button"
                      onClick={() => setMostrarPassword(!mostrarPassword)}
                      className="absolute right-3 top-2.5 text-xs font-semibold text-slate-500 hover:text-indigo-600 cursor-pointer"
                    >
                      {mostrarPassword ? 'Ocultar' : 'Ver'}
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombres</label>
                  <input type="text" value={nombres} onChange={(e) => setNombres(e.target.value)} required className={campo} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Apellidos</label>
                  <input type="text" value={apellidos} onChange={(e) => setApellidos(e.target.value)} required className={campo} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Celular (9 dígitos)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={9}
                    placeholder="Ej: 987654321"
                    value={celular}
                    onChange={(e) => setCelular(e.target.value.replace(/\D/g, ''))}
                    required
                    className={`${campo} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Correo electrónico (ahí recibirás tu certificado)
                  </label>
                  <input
                    type="email"
                    placeholder="correo@ejemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className={campo}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de postulante</label>
                  <select
                    value={tipoPostulante}
                    onChange={(e) => setTipoPostulante(e.target.value)}
                    className={`${campo} bg-white`}
                  >
                    <option value="PUBLICO">Público general — S/ 120.00</option>
                    <option value="UNSCH">Estudiante UNSCH — S/ 90.00</option>
                  </select>
                </div>
                {tipoPostulante === 'UNSCH' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Código universitario (8 dígitos)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={8}
                      placeholder="Ej: 16123456"
                      value={codigoUni}
                      onChange={(e) => setCodigoUni(e.target.value.replace(/\D/g, ''))}
                      required
                      className={`${campo} font-mono`}
                    />
                  </div>
                )}
              </div>
            </section>

            <div className="bg-sky-50 border border-sky-200 p-4 rounded-xl text-xs text-sky-800">
              💡 Al registrarte se genera tu orden de pago con los datos del banco <strong>Interbank</strong>.
            </div>

            <button
              type="submit"
              disabled={loading || !cursoId}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {loading ? 'Creando tu cuenta...' : 'Registrarme y obtener mi orden de pago'}
            </button>
          </form>
        )}

        <div className="text-center pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            ¿Ya tienes cuenta?{' '}
            <a href="/login" className="text-indigo-600 font-semibold hover:underline">Inicia sesión</a>
          </p>
        </div>
      </div>
    </div>
  );
}
