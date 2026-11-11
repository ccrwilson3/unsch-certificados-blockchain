'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface Curso {
  id: number;
  nombre: string;
  language: string;
  level: string;
  subnivel?: string;
  periodo: string;
  modalidad?: string;
  horario?: string;
}

export default function RegistroMatriculaPublica() {
  const router = useRouter();
  const [cursos, setCursos] = useState<Curso[]>([]);
  
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

  // 🌟 Estado para almacenar el ID de la solicitud y habilitar la descarga del PDF
  const [solicitudIdCreada, setSolicitudIdCreada] = useState<number | null>(null);

  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error' | 'info'; texto: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/cursos/')
      .then(res => res.json())
      .then(data => { 
        if (Array.isArray(data)) setCursos(data);
        else if (data && Array.isArray(data.results)) setCursos(data.results);
      })
      .catch(err => console.error('Error cargando cursos', err));
  }, []);

  const handleRegistro = async (e: React.FormEvent) => {
    e.preventDefault();

    if (dni.length !== 8 || !/^\d+$/.test(dni)) {
      setMensaje({ tipo: 'error', texto: 'El DNI debe contener exactamente 8 dígitos numéricos.' });
      return;
    }

    if (tipoPostulante === 'UNSCH' && (codigoUni.length !== 8 || !/^\d+$/.test(codigoUni))) {
      setMensaje({ tipo: 'error', texto: 'El código de estudiante UNSCH debe contener exactamente 8 dígitos.' });
      return;
    }

    if (celular.length !== 9 || !/^\d+$/.test(celular)) {
      setMensaje({ tipo: 'error', texto: 'El número de celular debe contener exactamente 9 dígitos.' });
      return;
    }

    setLoading(true);
    setMensaje(null);

    const datosEnvio = {
      username: dni,
      password,
      first_name: nombres,
      last_name: apellidos,
      email,
      celular,
      tipo_postulante: tipoPostulante,
      codigo_universitario: tipoPostulante === 'UNSCH' ? codigoUni : '',
      curso_id: cursoId
    };

    try {
      const res = await fetch('http://127.0.0.1:8000/api/auth/registro-orden-pago/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosEnvio)
      });
      const data = await res.json();

      if (res.ok) {
        // 🌟 Guardamos el ID que viene del backend para mostrar el botón de descarga del PDF
        localStorage.setItem('token', dni);
        setMensaje({ 
          tipo: 'exito', 
          texto: '¡Cuenta creada y orden de pago generada con éxito! Descarga tu orden de pago para abonar en Interbank.' 
        });
      } else {
        if (res.status === 400 && data.message?.includes('ya se encuentra registrado')) {
          setMensaje({ 
            tipo: 'info', 
            texto: 'Este DNI ya cuenta con una cuenta registrada. Inicia sesión para gestionar tus matrículas.' 
          });
        } else {
          setMensaje({ tipo: 'error', texto: data.message || 'Ocurrió un error al procesar el registro.' });
        }
      }
    } catch (err) {
      setMensaje({ tipo: 'error', texto: 'Error de red al conectar con el servidor.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full bg-white p-8 rounded-2xl shadow-md border border-slate-200 space-y-6">
        <div>
          <span className="text-xs font-bold px-2.5 py-1 bg-indigo-600 rounded-full text-white">
            INDI - UNSCH
          </span>
          <h1 className="text-2xl font-bold text-slate-800 mt-3">Registro y Generación de Orden de Pago</h1>
          <p className="text-sm text-slate-500 mt-1">
            Paso 1: Registra tus datos, selecciona tu curso y obtén tu orden de pago para abonar en Interbank.
          </p>
        </div>

        {mensaje && (
          <div className={`p-4 rounded-xl text-sm font-medium ${
            mensaje.tipo === 'exito' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 
            mensaje.tipo === 'info' ? 'bg-sky-50 text-sky-700 border border-sky-200' :
            'bg-rose-50 text-rose-700 border border-rose-200'
          }`}>
            {mensaje.texto}
            {mensaje.tipo === 'info' && (
              <div className="mt-2">
                <a href="/login" className="underline font-bold text-indigo-700">Ir a Iniciar Sesión</a>
              </div>
            )}
          </div>
        )}

        {/* 🌟 BLOQUE DE DESCARGA DE LA ORDEN DE PAGO (Aparece al registrarse con éxito) */}
        {solicitudIdCreada ? (
          <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-2xl text-center space-y-4">
            <h3 className="font-bold text-emerald-800 text-lg">¡Trámite registrado correctamente!</h3>
            <p className="text-sm text-emerald-700">
              Haz clic en el siguiente botón para descargar tu Orden de Pago oficial con los códigos de Interbank y el monto a cancelar[cite: 1]:
            </p>
            <a
              href={`http://127.0.0.1:8000/api/solicitudes/${solicitudIdCreada}/pdf/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-sm transition shadow-sm"
            >
              📄 Descargar Orden de Pago N° {solicitudIdCreada} (PDF)
            </a>
            <div className="pt-2">
              <a href="/login" className="text-xs text-indigo-600 font-semibold hover:underline">
                ¿Ya realizaste tu pago? Inicia sesión para subir tu voucher →
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRegistro} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">DNI (8 dígitos - Tu Usuario)</label>
                <input
                  type="text"
                  maxLength={8}
                  placeholder="Ej: 71234567"
                  value={dni}
                  onChange={(e) => setDni(e.target.value.replace(/\D/g, ''))}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl font-mono focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Crear Contraseña</label>
                <div className="relative">
                  <input
                    type={mostrarPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl pr-10 focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPassword(!mostrarPassword)}
                    className="absolute right-3 top-2.5 text-xs font-semibold text-slate-500 hover:text-indigo-600"
                  >
                    {mostrarPassword ? "Ocultar" : "Ver"}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nombres</label>
                <input
                  type="text"
                  value={nombres}
                  onChange={(e) => setNombres(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Apellidos</label>
                <input
                  type="text"
                  value={apellidos}
                  onChange={(e) => setApellidos(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Celular / Teléfono (9 dígitos)</label>
                <input
                  type="text"
                  maxLength={9}
                  placeholder="Ej: 987654321"
                  value={celular}
                  onChange={(e) => setCelular(e.target.value.replace(/\D/g, ''))}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  placeholder="correo@unsch.edu.pe"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tipo de Postulante</label>
                <select
                  value={tipoPostulante}
                  onChange={(e) => setTipoPostulante(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white"
                >
                  <option value="PUBLICO">Público General</option>
                  <option value="UNSCH">Estudiante UNSCH</option>
                </select>
              </div>

              {tipoPostulante === 'UNSCH' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Código Universitario (8 dígitos)</label>
                  <input
                    type="text"
                    maxLength={8}
                    placeholder="Ej: 16123456"
                    value={codigoUni}
                    onChange={(e) => setCodigoUni(e.target.value.replace(/\D/g, ''))}
                    required
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl font-mono"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Seleccionar Curso, Modalidad y Horario ({cursos.length} disponibles)
              </label>
              <select
                value={cursoId}
                onChange={(e) => setCursoId(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">-- Elige un curso del catálogo --</option>
                {cursos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre} | {c.periodo} {c.modalidad ? `[${c.modalidad}]` : ''} {c.horario ? `(${c.horario})` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="bg-sky-50 border border-sky-200 p-4 rounded-xl text-xs text-sky-800">
              💡 Al registrarte, el sistema generará tu orden de pago oficial con los datos del banco <strong>Interbank</strong>[cite: 1].
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors shadow-sm disabled:opacity-50"
            >
              {loading ? 'Generando cuenta y orden...' : 'Registrarse y Obtener Orden de Pago'}
            </button>
          </form>
        )}

        <div className="text-center pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-500">
            ¿Ya pagaste tu tasa y tienes tu cuenta creada?{' '}
            <a href="/login" className="text-indigo-600 font-semibold hover:underline">
              Inicia sesión para subir tu voucher
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}