/**
 * Abre en una pestaña nueva un archivo protegido de la API (voucher, orden de pago, material).
 * Estos archivos exigen sesión iniciada, por eso no se pueden abrir con un enlace normal:
 * se descargan con el token y se muestran desde la memoria del navegador.
 *
 * Devuelve null si todo salió bien, o el mensaje de error para mostrarlo al usuario.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";

export async function abrirArchivoProtegido(ruta: string): Promise<string | null> {
  // La pestaña se abre primero para que el navegador no la bloquee como ventana emergente.
  const ventana = window.open("", "_blank");
  try {
    const token = localStorage.getItem("token") || "";
    const res = await fetch(`${API_URL}${ruta}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      ventana?.close();
      let mensaje = "No se pudo abrir el archivo.";
      try {
        const datos = await res.json();
        mensaje = datos.message || datos.error || mensaje;
      } catch {
        /* la respuesta no era JSON */
      }
      return mensaje;
    }

    const url = URL.createObjectURL(await res.blob());
    if (ventana) ventana.location.href = url;
    else window.location.href = url;
    return null;
  } catch {
    ventana?.close();
    return "Error de red al abrir el archivo.";
  }
}
