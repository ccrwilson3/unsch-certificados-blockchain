"use client";

/**
 * Puente temporal de autenticación.
 *
 * Agrega automáticamente "Authorization: Bearer <token>" (el token guardado al iniciar sesión)
 * a TODAS las peticiones fetch que van hacia la API del backend. Así cada página envía el
 * token real sin tener que editarse una por una.
 *
 * Más adelante conviene reemplazarlo por una función compartida (apiFetch) usada en cada página.
 */

const ORIGENES_API = [
  "http://127.0.0.1:8000",
  "http://localhost:8000",
  "http://192.168.100.32:8000",
];

function esPeticionApi(url: string): boolean {
  const apiEnv = process.env.NEXT_PUBLIC_API_URL;
  if (apiEnv && url.startsWith(apiEnv)) return true;
  return ORIGENES_API.some((origen) => url.startsWith(`${origen}/api/`));
}

if (typeof window !== "undefined" && !(window as any).__fetchConToken) {
  (window as any).__fetchConToken = true;
  const fetchOriginal = window.fetch.bind(window);

  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
          ? input.href
          : input.url;

      const token = localStorage.getItem("token");

      if (token && esPeticionApi(url)) {
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined)
        );
        headers.set("Authorization", `Bearer ${token}`);
        return fetchOriginal(input, { ...init, headers });
      }
    } catch (error) {
      // Si algo falla, la petición sigue sin modificar.
    }
    return fetchOriginal(input, init);
  };
}

export default function AuthFetch() {
  return null;
}