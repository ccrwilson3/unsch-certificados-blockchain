/** Datos de la sesión guardados al iniciar sesión (ver login). */
export interface UsuarioSesion {
  username: string;
  first_name?: string;
  last_name?: string;
  role?: string;
}

export const ETIQUETAS_ROL: Record<string, string> = {
  ADMIN: "Administrador",
  INDI: "Personal INDI",
  DOCENTE: "Docente",
  GRADOS_TITULOS: "Grados y Títulos",
  STUDENT: "Estudiante",
  ESTUDIANTE: "Estudiante",
};

export function leerUsuario(): UsuarioSesion | null {
  try {
    const crudo = localStorage.getItem("user");
    if (!crudo) return null;
    const dato = JSON.parse(crudo);
    return dato && typeof dato === "object" ? dato : null;
  } catch {
    return null;
  }
}

export function nombreCompleto(u: UsuarioSesion | null): string {
  if (!u) return "";
  const nombre = `${u.first_name || ""} ${u.last_name || ""}`.trim();
  return nombre || u.username;
}

export function iniciales(u: UsuarioSesion | null): string {
  if (!u) return "?";
  const a = (u.first_name || u.username || "?").trim()[0] || "?";
  const b = (u.last_name || "").trim()[0] || "";
  return (a + b).toUpperCase();
}

export function cerrarSesion() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}
