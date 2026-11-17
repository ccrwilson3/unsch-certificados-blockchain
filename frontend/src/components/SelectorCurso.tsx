"use client";

import { useEffect, useMemo, useState } from "react";

export interface CursoCatalogo {
  id: number;
  nombre: string;
  language_code: string;
  idioma: string;
  nivel: string;
  subnivel: string;
  periodo: string;
  modalidad: string;
  horario: string;
  docente_nombre: string;
}

interface Props {
  cursos: CursoCatalogo[];
  value: string;
  onChange: (cursoId: string) => void;
}

const ORDEN_NIVEL: Record<string, number> = { Básico: 1, Intermedio: 2, Avanzado: 3 };

const etiquetaModalidad = (m: string) =>
  m === "VIRTUAL" ? "Virtual" : m === "PRESENCIAL" ? "Presencial" : m;

/** Valores distintos de un campo, con cuántos cursos tiene cada uno. */
function opciones(cursos: CursoCatalogo[], campo: (c: CursoCatalogo) => string) {
  const mapa = new Map<string, number>();
  cursos.forEach((c) => mapa.set(campo(c), (mapa.get(campo(c)) || 0) + 1));
  return Array.from(mapa.entries()).map(([valor, cantidad]) => ({ valor, cantidad }));
}

function Paso({
  numero,
  titulo,
  children,
}: {
  numero: number;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-600 mb-2">
        <span className="inline-flex items-center justify-center w-5 h-5 mr-1.5 rounded-full bg-indigo-600 text-white text-[11px]">
          {numero}
        </span>
        {titulo}
      </p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-xl text-sm font-medium border transition cursor-pointer ${
        activo
          ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
          : "bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Elige un curso paso a paso: Idioma → Modalidad → Horario → Nivel.
 * Cada paso solo muestra lo que existe de verdad según lo ya elegido,
 * y si hay una única opción se selecciona sola.
 */
export default function SelectorCurso({ cursos, value, onChange }: Props) {
  const [idioma, setIdioma] = useState("");
  const [modalidad, setModalidad] = useState("");
  const [horario, setHorario] = useState("");

  const opcionesIdioma = useMemo(() => opciones(cursos, (c) => c.idioma), [cursos]);
  const idiomaEf = idioma || (opcionesIdioma.length === 1 ? opcionesIdioma[0].valor : "");

  const porIdioma = useMemo(() => cursos.filter((c) => c.idioma === idiomaEf), [cursos, idiomaEf]);
  const opcionesModalidad = useMemo(() => opciones(porIdioma, (c) => c.modalidad), [porIdioma]);
  const modalidadEf =
    modalidad || (idiomaEf && opcionesModalidad.length === 1 ? opcionesModalidad[0].valor : "");

  const porModalidad = useMemo(
    () => porIdioma.filter((c) => c.modalidad === modalidadEf),
    [porIdioma, modalidadEf]
  );
  const opcionesHorario = useMemo(
    () => opciones(porModalidad, (c) => c.horario || "Por definir"),
    [porModalidad]
  );
  const horarioEf =
    horario || (modalidadEf && opcionesHorario.length === 1 ? opcionesHorario[0].valor : "");

  const disponibles = useMemo(
    () =>
      porModalidad
        .filter((c) => (c.horario || "Por definir") === horarioEf)
        .sort(
          (a, b) =>
            (ORDEN_NIVEL[a.nivel] || 9) - (ORDEN_NIVEL[b.nivel] || 9) ||
            a.subnivel.localeCompare(b.subnivel)
        ),
    [porModalidad, horarioEf]
  );

  const elegirIdioma = (v: string) => {
    setIdioma(v);
    setModalidad("");
    setHorario("");
    onChange("");
  };
  const elegirModalidad = (v: string) => {
    setModalidad(v);
    setHorario("");
    onChange("");
  };
  const elegirHorario = (v: string) => {
    setHorario(v);
    onChange("");
  };

  // Si solo hay un curso posible, queda elegido solo
  const unico = disponibles.length === 1 ? String(disponibles[0].id) : "";
  const seleccionado = disponibles.some((c) => String(c.id) === value) ? value : unico;

  useEffect(() => {
    if (unico && value !== unico) onChange(unico);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unico, value]);

  if (cursos.length === 0) {
    return (
      <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">
        Por el momento el INDI no tiene cursos habilitados para matrícula.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <Paso numero={1} titulo="¿Qué idioma deseas estudiar?">
        {opcionesIdioma.map((o) => (
          <Chip key={o.valor} activo={idiomaEf === o.valor} onClick={() => elegirIdioma(o.valor)}>
            {o.valor}
          </Chip>
        ))}
      </Paso>

      {idiomaEf && (
        <Paso numero={2} titulo="¿Presencial o virtual?">
          {opcionesModalidad.map((o) => (
            <Chip
              key={o.valor}
              activo={modalidadEf === o.valor}
              onClick={() => elegirModalidad(o.valor)}
            >
              {etiquetaModalidad(o.valor)}
            </Chip>
          ))}
        </Paso>
      )}

      {idiomaEf && modalidadEf && (
        <Paso numero={3} titulo="Elige tu horario">
          {opcionesHorario.map((o) => (
            <Chip key={o.valor} activo={horarioEf === o.valor} onClick={() => elegirHorario(o.valor)}>
              {o.valor}
            </Chip>
          ))}
        </Paso>
      )}

      {idiomaEf && modalidadEf && horarioEf && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-2">
            <span className="inline-flex items-center justify-center w-5 h-5 mr-1.5 rounded-full bg-indigo-600 text-white text-[11px]">
              4
            </span>
            Elige tu nivel
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {disponibles.map((c) => {
              const activo = seleccionado === String(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onChange(String(c.id))}
                  className={`text-left p-3.5 rounded-xl border transition cursor-pointer ${
                    activo
                      ? "border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600"
                      : "border-slate-200 bg-white hover:border-indigo-300"
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-800">
                    {c.nivel} · {c.subnivel}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Período {c.periodo} · Docente: {c.docente_nombre}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {seleccionado && (
        <div className="text-xs text-indigo-800 bg-indigo-50 border border-indigo-200 rounded-xl p-3">
          ✓ Curso elegido:{" "}
          <strong>
            {cursos.find((c) => String(c.id) === seleccionado)?.nombre}
          </strong>
        </div>
      )}
    </div>
  );
}
