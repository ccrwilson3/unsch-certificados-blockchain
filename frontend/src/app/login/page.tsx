"use client";

import { useEffect, useRef, useState } from "react";
import DosPasosLogin from "../../components/DosPasosLogin";
import { useRouter } from "next/navigation";

type Modo = "dni" | "correo" | "usuario";

interface Reciente {
  modo: Modo;
  valor: string;
  nombre: string;
}

const CLAVE_RECIENTES = "login_recientes"; // solo se guardan datos de acceso públicos, nunca la contraseña
const MAX_RECIENTES = 6;

const MODOS: { id: Modo; etiqueta: string; titulo: string; ejemplo: string }[] = [
  { id: "dni", etiqueta: "DNI", titulo: "Número de DNI", ejemplo: "12345678" },
  { id: "correo", etiqueta: "Correo", titulo: "Correo electrónico", ejemplo: "nombre@correo.com" },
  { id: "usuario", etiqueta: "Usuario", titulo: "Nombre de usuario", ejemplo: "usuario" },
];

const leerRecientes = (): Reciente[] => {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_RECIENTES) || "[]");
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
};

const guardarRecientes = (lista: Reciente[]) => {
  try {
    localStorage.setItem(CLAVE_RECIENTES, JSON.stringify(lista));
  } catch {
    /* sin almacenamiento disponible: no pasa nada */
  }
};

export default function LoginPage() {
  const [modo, setModo] = useState<Modo>("dni");
  const [recientes, setRecientes] = useState<Reciente[]>([]);
  const claveRef = useRef<HTMLInputElement>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false); // nuevo
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
  // Segundo paso del ingreso (verificación en dos pasos)
  const [dosPasos, setDosPasos] = useState<{ modo: "verificar" | "configurar"; token: string } | null>(null);

  // Cargar el historial y el último modo usado (solo en el navegador)
  useEffect(() => {
    setRecientes(leerRecientes());
    try {
      const ultimo = localStorage.getItem("login_modo") as Modo | null;
      if (ultimo === "dni" || ultimo === "correo" || ultimo === "usuario") setModo(ultimo);
    } catch {
      /* ignorar */
    }
  }, []);

  const cambiarModo = (nuevo: Modo) => {
    setModo(nuevo);
    setUsername("");
    setError("");
  };

  const usarReciente = (r: Reciente) => {
    setModo(r.modo);
    setUsername(r.valor);
    setError("");
    claveRef.current?.focus();
  };

  const quitarReciente = (r: Reciente) => {
    const nueva = recientes.filter((x) => !(x.modo === r.modo && x.valor === r.valor));
    setRecientes(nueva);
    guardarRecientes(nueva);
  };

  const borrarHistorial = () => {
    setRecientes([]);
    guardarRecientes([]);
  };

  // Guarda la sesión y entra a la pantalla que corresponde al rol
  const finalizarLogin = (data: any) => {
    // Recordar este acceso en el historial (el más reciente primero, sin repetidos)
    const nombre = `${data.first_name || ""} ${data.last_name || ""}`.trim();
    const nuevo: Reciente = { modo, valor: username, nombre };
    guardarRecientes([nuevo, ...recientes.filter((x) => !(x.modo === modo && x.valor === username))].slice(0, MAX_RECIENTES));
    try {
      localStorage.setItem("login_modo", modo);
    } catch {
      /* ignorar */
    }

    // Guardamos la sesión localmente
    // (los códigos de respaldo se mostraron una vez y NO se guardan en el navegador)
    const { codigos_respaldo, codigos_restantes, token_2fa, ...sesion } = data;
    void codigos_respaldo; void codigos_restantes; void token_2fa;
    localStorage.setItem("token", sesion.token);
    localStorage.setItem("user", JSON.stringify(sesion));

    // Normalizar el rol a mayúsculas
    const role = (data.role || "").toUpperCase();

    // Redirección Dinámica alineada con tus carpetas reales en Next.js
    if (role === "ADMIN") {
      router.push("/admin/usuarios");
    } else if (role === "INDI") {
      router.push("/indi/aprobar-solicitudes"); // Ruta exacta según tu imagen
    } else if (role === "GRADOS_TITULOS") {
      router.push("/grados-titulos/validar-requisitos"); // Ruta exacta según tu imagen
    } else if (role == 'DOCENTE') {
      router.push('/docente/cursos');
    } else {
      router.push("/estudiante/solicitudes"); // Ruta exacta según tu imagen
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (modo === "dni" && !/^\d{8}$/.test(username)) {
      setError("El DNI debe tener exactamente 8 dígitos.");
      return;
    }
    setLoading(true);

    try {
      const res = await fetch(`${apiUrl}/login/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || data.error || "Credenciales incorrectas.");
        return;
      }

      if (data.requiere_2fa) {
        setDosPasos({ modo: "verificar", token: data.token_2fa });
        return;
      }
      if (data.requiere_configurar_2fa) {
        setDosPasos({ modo: "configurar", token: data.token_2fa });
        return;
      }

      finalizarLogin(data);
    } catch (err) {
      setError("Error al conectar con el servidor de autenticación.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 border border-slate-200">
        
        <div className="text-center mb-8">
          <span className="text-xs font-semibold px-3 py-1 bg-blue-50 text-blue-600 rounded-full">
            UNSCH - INDI
          </span>
          <h1 className="text-2xl font-bold text-slate-800 mt-2">
            Sistema de Certificados Blockchain
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Ingresa tus credenciales institucionales
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs text-center font-medium">
            {error}
          </div>
        )}

        {dosPasos ? (
          <DosPasosLogin
            modo={dosPasos.modo}
            token={dosPasos.token}
            apiUrl={apiUrl}
            onCompleto={finalizarLogin}
            onVolver={() => { setDosPasos(null); setPassword(""); setError(""); }}
          />
        ) : (
        <>
        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5">Ingresar con</label>
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-xl mb-3" role="tablist">
              {MODOS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={modo === m.id}
                  onClick={() => cambiarModo(m.id)}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    modo === m.id ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {m.etiqueta}
                </button>
              ))}
            </div>

            <label className="block text-xs font-semibold text-slate-600 mb-1">
              {MODOS.find((m) => m.id === modo)?.titulo}
            </label>
            <input
              key={modo}
              type={modo === "correo" ? "email" : "text"}
              inputMode={modo === "dni" ? "numeric" : modo === "correo" ? "email" : "text"}
              required
              maxLength={modo === "dni" ? undefined : 100}
              autoComplete="username"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(modo === "dni" ? e.target.value.replace(/\D/g, "").slice(0, 8) : e.target.value.trim())}
              placeholder={`Ej. ${MODOS.find((m) => m.id === modo)?.ejemplo}`}
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Contraseña
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"} // <--- Cambia dinámicamente según el estado
                required
                ref={claveRef}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none"
              >
                {showPassword ? (
                  /* Icono de Ojo tachado (Ocultar) */
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  /* Icono de Ojo normal (Mostrar) */
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <div className="text-right -mt-2">
            <a href="/recuperar" className="text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline">
              ¿Olvidaste tu contraseña?
            </a>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {loading ? "Iniciando Sesión..." : "Iniciar Sesión"}
          </button>
        </form>

        {recientes.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500">Accesos recientes en este equipo</span>
              <button
                type="button"
                onClick={borrarHistorial}
                className="text-[11px] text-slate-400 hover:text-rose-600 hover:underline"
              >
                Borrar historial
              </button>
            </div>
            <ul className="space-y-1.5">
              {recientes.map((r) => (
                <li key={`${r.modo}:${r.valor}`} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => usarReciente(r)}
                    className="flex-1 min-w-0 text-left px-3 py-2 text-xs rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-200 transition-colors"
                  >
                    <span className="block font-medium text-slate-700 truncate">{r.nombre || r.valor}</span>
                    <span className="block text-slate-400 font-mono truncate">
                      {MODOS.find((m) => m.id === r.modo)?.etiqueta}: {r.valor}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => quitarReciente(r)}
                    aria-label={`Quitar ${r.valor} del historial`}
                    className="px-2 py-1 text-slate-300 hover:text-rose-600"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        </>
        )}

        <div className="mt-6 text-center border-t border-slate-100 pt-4">
          <a href="/" className="text-xs text-slate-500 hover:text-slate-800 transition-colors">
            ← Ir a Verificación Pública de Certificados
          </a>
        </div>
      </div>
    </main>
  );
}