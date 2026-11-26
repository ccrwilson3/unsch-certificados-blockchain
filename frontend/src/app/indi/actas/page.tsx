"use client";

import ActasLista from "../../../components/ActasLista";

export default function ActasPage() {
  return (
    <ActasLista
      rutaBase="/indi/actas"
      descripcion="Revisa las actas que firman los docentes, devuélvelas si hay errores y fírmalas como Dirección del INDI."
    />
  );
}
