import { ActaTabla as Tabla } from "../lib/actas";

export default function ActaTabla({ tabla, firmada }: { tabla: Tabla; firmada: boolean }) {
  const aprobados = tabla.estudiantes.filter((e) => e.condicion === "APROBADO").length;
  const desaprobados = tabla.estudiantes.filter((e) => e.condicion === "DESAPROBADO").length;
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-4 py-3 border-b bg-slate-50 text-sm font-semibold text-slate-700 flex flex-wrap justify-between gap-2">
        <span>{firmada ? "Notas tal como se firmaron" : "Notas actuales (aún sin firmar)"}</span>
        <span className="text-xs font-normal text-slate-500">
          {tabla.estudiantes.length} estudiantes · {aprobados} aprobados · {desaprobados} desaprobados
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-100 border-b text-xs uppercase text-slate-600">
              <th className="p-3">N°</th>
              <th className="p-3">DNI</th>
              <th className="p-3">Apellidos y nombres</th>
              {tabla.evaluaciones.map((e, i) => (
                <th key={i} className="p-3 text-center whitespace-nowrap">
                  <div>{e.titulo}</div>
                  <div className="font-normal normal-case text-slate-400">{Number(e.peso)}%</div>
                </th>
              ))}
              <th className="p-3 text-center">Promedio</th>
              <th className="p-3 text-center">Condición</th>
            </tr>
          </thead>
          <tbody className="text-sm divide-y">
            {tabla.estudiantes.map((e, i) => (
              <tr key={e.dni} className="hover:bg-slate-50">
                <td className="p-3 text-slate-400">{i + 1}</td>
                <td className="p-3 font-mono text-xs text-slate-600">{e.dni}</td>
                <td className="p-3 font-medium text-slate-800">{`${e.apellidos}, ${e.nombres}`.replace(/^, |, $/g, "")}</td>
                {e.notas.map((n, j) => (
                  <td key={j} className="p-3 text-center">{n !== null ? Number(n) : <span className="text-slate-300">—</span>}</td>
                ))}
                <td className="p-3 text-center font-semibold">{e.promedio !== null ? Number(e.promedio) : "—"}</td>
                <td className="p-3 text-center">
                  {e.condicion ? (
                    <span className={`px-2 py-0.5 text-xs font-bold rounded-full border ${
                      e.condicion === "APROBADO" ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}>{e.condicion === "APROBADO" ? "Aprobado" : "Desaprobado"}</span>
                  ) : <span className="text-slate-300">—</span>}
                </td>
              </tr>
            ))}
            {tabla.estudiantes.length === 0 && (
              <tr><td colSpan={5 + tabla.evaluaciones.length} className="p-6 text-center text-slate-400 text-sm">Sin estudiantes matriculados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
