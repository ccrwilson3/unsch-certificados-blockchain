export interface ActaTabla {
  curso: { id: number; nombre: string; idioma: string; nivel: string; subnivel: string; periodo: string; modalidad: string; horario: string };
  docente: string;
  evaluaciones: { titulo: string; peso: string }[];
  estudiantes: {
    dni: string;
    apellidos: string;
    nombres: string;
    notas: (string | null)[];
    promedio: string | null;
    condicion: "APROBADO" | "DESAPROBADO" | null;
  }[];
}

export interface ActaDatos {
  acta: {
    codigo: string;
    estado: string;
    estado_texto: string;
    version: number;
    hash: string;
    plazo_limite: string | null;
    plazo_vencido: boolean;
    plazo_extra_dias: number;
    plazo_base_dias: number;
    fecha_fin_curso: string | null;
    firma_docente: { por: string; en: string } | null;
    firma_direccion: { por: string; en: string } | null;
  };
  tabla: ActaTabla;
  tabla_es_firmada: boolean;
  editable: boolean;
  motivo_bloqueo: string | null;
  problemas: string[];
  integridad: "INTEGRA" | "ALTERADA" | null;
  cambio_tras_firma: boolean;
  permisos: {
    firmar_docente: boolean;
    observar: boolean;
    firmar_direccion: boolean;
    reabrir: boolean;
    ampliar_plazo: boolean;
    descargar_pdf: boolean;
  };
  eventos: { accion: string; por: string; comentario: string; version: number; fecha: string; ip: string; hash: string }[];
}

export const ESTILO_ESTADO: Record<string, string> = {
  BORRADOR: "bg-slate-100 text-slate-700 border-slate-200",
  FIRMADA_DOCENTE: "bg-blue-50 text-blue-700 border-blue-200",
  OBSERVADA: "bg-amber-50 text-amber-800 border-amber-200",
  REABIERTA: "bg-orange-50 text-orange-700 border-orange-200",
  CERRADA: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export const TEXTO_ESTADO_CORTO: Record<string, string> = {
  BORRADOR: "En elaboración",
  FIRMADA_DOCENTE: "En revisión del INDI",
  OBSERVADA: "Observada",
  REABIERTA: "Reabierta",
  CERRADA: "Cerrada y firmada",
};

export const TEXTO_EVENTO: Record<string, string> = {
  FIRMA_DOCENTE: "Firma del docente",
  OBSERVACION: "Observación del INDI",
  FIRMA_DIRECCION: "Firma de la Dirección del INDI",
  REAPERTURA: "Reapertura para corrección",
  AMPLIACION_PLAZO: "Ampliación de plazo",
};

export const fechaHora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" }) : "—";

export const fechaCorta = (iso: string | null | undefined) =>
  iso ? new Date(iso + (iso.length === 10 ? "T12:00:00" : "")).toLocaleDateString("es-PE") : "—";
