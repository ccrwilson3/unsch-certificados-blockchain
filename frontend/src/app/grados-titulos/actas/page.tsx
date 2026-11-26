"use client";

import ActasLista from "../../../components/ActasLista";

export default function ActasGradosPage() {
  return (
    <ActasLista
      rutaBase="/grados-titulos/actas"
      filtroInicial="CERRADA"
      descripcion="Consulta las actas de notas firmadas por los docentes y la Dirección del INDI. Es solo de lectura: puedes ver las notas, comprobar su integridad y descargar el PDF."
    />
  );
}
