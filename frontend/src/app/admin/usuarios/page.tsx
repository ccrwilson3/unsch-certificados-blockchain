"use client";

import { useState } from "react";

export default function AdminUsuariosPage() {
  const [usuarios] = useState([
    { id: 1, username: "admin_unsch", nombre: "Super Administrador", rol: "ADMIN", estado: "Activo" },
    { id: 2, username: "indi_personal", nombre: "Personal INDI", rol: "INDI", estado: "Activo" },
    { id: 3, username: "gt_encargado", nombre: "Encargado Grados y Títulos", rol: "GRADOS_TITULOS", estado: "Activo" },
    { id: 4, username: "ccrwilson", nombre: "Wilson Ccorahua", rol: "ESTUDIANTE", estado: "Activo" },
  ]);

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestión de Usuarios y Roles</h1>
          <p className="text-sm text-slate-500 mt-1">
            Administre los accesos y tipos de usuario para el sistema de certificados blockchain de la UNSCH.
          </p>
        </div>
        <button className="px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors">
          + Registrar Nuevo Usuario
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <th className="p-4">Usuario</th>
              <th className="p-4">Nombre Completo</th>
              <th className="p-4">Rol Institucional</th>
              <th className="p-4">Estado</th>
              <th className="p-4 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
            {usuarios.map((u) => (
              <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-4 font-semibold text-slate-800">{u.username}</td>
                <td className="p-4">{u.nombre}</td>
                <td className="p-4">
                  <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                    u.rol === 'ADMIN' ? 'bg-purple-50 text-purple-700' :
                    u.rol === 'INDI' ? 'bg-blue-50 text-blue-700' :
                    u.rol === 'GRADOS_TITULOS' ? 'bg-amber-50 text-amber-700' :
                    'bg-emerald-50 text-emerald-700'
                  }`}>
                    {u.rol}
                  </span>
                </td>
                <td className="p-4">
                  <span className="text-emerald-600 font-medium">● {u.estado}</span>
                </td>
                <td className="p-4 text-right space-x-3">
                  <button className="text-blue-600 hover:underline font-medium text-xs">Editar</button>
                  <button className="text-rose-600 hover:underline font-medium text-xs">Desactivar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}