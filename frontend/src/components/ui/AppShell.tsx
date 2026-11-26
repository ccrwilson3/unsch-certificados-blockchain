"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown, ExternalLink, GraduationCap, KeyRound, Lock, LogOut, Menu, ShieldCheck, UserCircle, X,
  type LucideIcon,
} from "lucide-react";
import { PermisosProvider, usePermisos } from "../../lib/permisos";
import CuentaDialog from "./CuentaDialog";
import {
  ETIQUETAS_ROL, cerrarSesion, iniciales, leerUsuario, nombreCompleto, type UsuarioSesion,
} from "../../lib/sesion";

export interface ItemNav {
  href: string;
  texto: string;
  Icono: LucideIcon;
  /** Módulo de permisos que da acceso a esta página. Sin módulo, la ven todos los de ese portal. */
  modulo?: string;
}

type Color = "indigo" | "amber" | "emerald" | "violet" | "rose";

const COLORES: Record<Color, { activo: string; avatar: string; badge: string }> = {
  indigo: { activo: "bg-indigo-600", avatar: "bg-indigo-600", badge: "bg-indigo-600/20 text-indigo-300 border-indigo-500/30" },
  amber: { activo: "bg-amber-600", avatar: "bg-amber-600", badge: "bg-amber-600/20 text-amber-300 border-amber-500/30" },
  emerald: { activo: "bg-emerald-600", avatar: "bg-emerald-600", badge: "bg-emerald-600/20 text-emerald-300 border-emerald-500/30" },
  violet: { activo: "bg-violet-600", avatar: "bg-violet-600", badge: "bg-violet-600/20 text-violet-300 border-violet-500/30" },
  rose: { activo: "bg-rose-600", avatar: "bg-rose-600", badge: "bg-rose-600/20 text-rose-300 border-rose-500/30" },
};

function Enlaces({
  items, pathname, color, alNavegar,
}: { items: ItemNav[]; pathname: string; color: Color; alNavegar?: () => void }) {
  return (
    <>
      {items.map(({ href, texto, Icono }) => {
        const activo = pathname !== "" && pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={alNavegar}
            aria-current={activo ? "page" : undefined}
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              activo ? `${COLORES[color].activo} text-white shadow-sm` : "text-slate-400 hover:bg-slate-800/80 hover:text-slate-100"
            }`}
          >
            <Icono className="w-4 h-4 shrink-0" />
            <span>{texto}</span>
          </Link>
        );
      })}
    </>
  );
}

// usePathname debe leerse dentro de <Suspense> (Next 16 con cacheComponents).
function EnlacesConRuta(props: Omit<Parameters<typeof Enlaces>[0], "pathname">) {
  const pathname = usePathname();
  return <Enlaces {...props} pathname={pathname} />;
}

function MenuLateral({
  items, titulo, subtitulo, color, alNavegar,
}: { items: ItemNav[]; titulo: string; subtitulo: string; color: Color; alNavegar?: () => void }) {
  return (
    <div className="flex flex-col h-full p-5">
      <div className="mb-6">
        <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${COLORES[color].badge}`}>
          <GraduationCap className="w-3.5 h-3.5" />
          <span>INDI · UNSCH</span>
        </div>
        <h2 className="text-lg font-bold mt-3 text-slate-100 tracking-tight">{titulo}</h2>
        <p className="text-xs text-slate-400 mt-0.5">{subtitulo}</p>
      </div>

      <nav className="space-y-1.5 flex-1 overflow-y-auto">
        <Suspense fallback={<Enlaces items={items} pathname="" color={color} />}>
          <EnlacesConRuta items={items} color={color} alNavegar={alNavegar} />
        </Suspense>

        <div className="pt-3 mt-3 border-t border-slate-800/80">
          <Link
            href="/"
            onClick={alNavegar}
            className="flex items-center justify-between px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:bg-slate-800/80 hover:text-slate-100 transition-colors group"
          >
            <span className="flex items-center gap-3">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              Verificador Público
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
          </Link>
        </div>
      </nav>
    </div>
  );
}

function MenuUsuario({ usuario, color }: { usuario: UsuarioSesion | null; color: Color }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [dialogo, setDialogo] = useState<"datos" | "password" | null>(null);
  const caja = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
    };
  }, [abierto]);

  const salir = () => {
    cerrarSesion();
    router.push("/login");
  };

  const cerrarDialogo = useCallback(() => setDialogo(null), []);
  const rol = ETIQUETAS_ROL[(usuario?.role || "").toUpperCase()] || "";
  const opcion = "w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer";

  return (
    <div className="relative" ref={caja}>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        aria-haspopup="menu"
        aria-expanded={abierto}
        className="flex items-center gap-3 pl-1.5 pr-3 py-1.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 transition cursor-pointer"
      >
        <span className={`w-8 h-8 rounded-full ${COLORES[color].avatar} text-white text-xs font-bold flex items-center justify-center`}>
          {iniciales(usuario)}
        </span>
        <span className="hidden sm:block text-left leading-tight max-w-[180px]">
          <span className="block text-xs font-bold text-slate-800 truncate">{nombreCompleto(usuario) || "Mi cuenta"}</span>
          <span className="block text-[11px] text-slate-500 truncate">{rol}</span>
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`} />
      </button>

      {abierto && (
        <div role="menu" className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-sm font-bold text-slate-800 truncate">{nombreCompleto(usuario)}</p>
            <p className="text-xs text-slate-500 mt-0.5">DNI {usuario?.username} · {rol}</p>
          </div>
          <button role="menuitem" className={opcion} onClick={() => { setAbierto(false); setDialogo("datos"); }}>
            <UserCircle className="w-4 h-4 text-slate-400" /> Mis datos
          </button>
          <button role="menuitem" className={opcion} onClick={() => { setAbierto(false); setDialogo("password"); }}>
            <KeyRound className="w-4 h-4 text-slate-400" /> Cambiar contraseña
          </button>
          <div className="border-t border-slate-100 mt-1 pt-1">
            <button role="menuitem" className={`${opcion} !text-rose-600 hover:!bg-rose-50`} onClick={salir}>
              <LogOut className="w-4 h-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {dialogo && <CuentaDialog inicial={dialogo} onCerrar={cerrarDialogo} />}
    </div>
  );
}

function SinAcceso({ items }: { items: ItemNav[] }) {
  const alternativa = items[0];
  return (
    <div className="p-8 max-w-lg mx-auto text-center">
      <span className="inline-flex w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 items-center justify-center"><Lock className="w-6 h-6" /></span>
      <h1 className="text-lg font-bold text-slate-800 mt-4">No tienes acceso a este módulo</h1>
      <p className="text-sm text-slate-500 mt-1">
        El administrador no lo ha habilitado para tu usuario. Si lo necesitas, pídeselo.
      </p>
      {alternativa && (
        <Link href={alternativa.href} className="inline-block mt-5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold">
          Ir a «{alternativa.texto}»
        </Link>
      )}
    </div>
  );
}

/** Impide abrir por la dirección un módulo sin acceso y avisa cuando el acceso es solo de lectura. */
function GuardaRuta({ todos, visibles, children }: { todos: ItemNav[]; visibles: ItemNav[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const permisos = usePermisos();
  const actual = todos.find((i) => pathname.startsWith(i.href));
  if (!permisos.cargado) return null;
  if (actual?.modulo && !permisos.puedeVer(actual.modulo)) return <SinAcceso items={visibles} />;
  const soloLectura = !!actual?.modulo && permisos.nivel(actual.modulo) === "VER" && permisos.maximos[actual.modulo] === "EDITAR";
  return (
    <>
      {soloLectura && (
        <div role="status" className="mx-4 sm:mx-8 mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-medium">
          <Lock className="w-4 h-4 shrink-0" /> Tienes acceso de solo lectura en este módulo: puedes consultar, pero no modificar.
        </div>
      )}
      {children}
    </>
  );
}

function ShellInterno({
  items, titulo, subtitulo, color, children,
}: {
  items: ItemNav[];
  titulo: string;
  subtitulo: string;
  color: Color;
  children: React.ReactNode;
}) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [cajon, setCajon] = useState(false);
  const permisos = usePermisos();
  // Mientras se consulta, los módulos con permiso no se muestran para evitar un parpadeo de enlaces vedados.
  const visibles = items.filter((i) => !i.modulo || (permisos.cargado && permisos.puedeVer(i.modulo)));

  useEffect(() => {
    setUsuario(leerUsuario());
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Menú lateral fijo (escritorio) */}
      <aside className="hidden lg:block w-64 shrink-0 bg-slate-900 text-white border-r border-slate-800 sticky top-0 h-screen">
        <MenuLateral items={visibles} titulo={titulo} subtitulo={subtitulo} color={color} />
      </aside>

      {/* Cajón (móvil) */}
      {cajon && (
        <div className="lg:hidden fixed inset-0 z-40 flex">
          <div className="w-64 bg-slate-900 text-white h-full relative">
            <button
              type="button"
              onClick={() => setCajon(false)}
              aria-label="Cerrar menú"
              className="absolute top-4 right-3 p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <MenuLateral items={visibles} titulo={titulo} subtitulo={subtitulo} color={color} alNavegar={() => setCajon(false)} />
          </div>
          <div className="flex-1 bg-slate-900/50" onClick={() => setCajon(false)} />
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setCajon(true)}
            aria-label="Abrir menú"
            className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="hidden lg:block text-sm font-semibold text-slate-500">{titulo}</span>
          <MenuUsuario usuario={usuario} color={color} />
        </header>

        <main className="flex-1 min-w-0">
          <Suspense fallback={null}>
            <GuardaRuta todos={items} visibles={visibles}>{children}</GuardaRuta>
          </Suspense>
        </main>
      </div>
    </div>
  );
}

/**
 * Estructura común de los 5 portales: menú lateral + barra superior con el menú de cuenta.
 * En pantallas pequeñas el menú lateral se abre como cajón con el botón de hamburguesa.
 * Filtra el menú y protege las páginas según los permisos por módulo del usuario.
 */
export default function AppShell(props: {
  items: ItemNav[];
  titulo: string;
  subtitulo: string;
  color: Color;
  children: React.ReactNode;
}) {
  return (
    <PermisosProvider>
      <ShellInterno {...props} />
    </PermisosProvider>
  );
}
