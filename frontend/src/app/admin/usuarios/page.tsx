"use client";

import { useState, useEffect } from "react";

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Búsqueda y Paginación
  const [busqueda, setBusqueda] = useState("");
  const [paginaActual, setPaginaActual] = useState(1);
  const registrosPorPagina = 8;

  // Modal Crear Usuario
  const [modalAbierto, setModalAbierto] = useState(false);
  const [nuevoUsername, setNuevoUsername] = useState("");
  const [nuevoPassword, setNuevoPassword] = useState("");
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoApellido, setNuevoApellido] = useState("");
  const [nuevoRol, setNuevoRol] = useState("ESTUDIANTE");
  const [errorModal, setErrorModal] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Modal Editar Usuario / Rol
  const [modalEditarAbierto, setModalEditarAbierto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState<any>(null);
  const [editNombre, setEditNombre] = useState("");
  const [editApellido, setEditApellido] = useState("");
  const [editRol, setEditRol] = useState("ESTUDIANTE");
  const [errorEditar, setErrorEditar] = useState("");
  const [guardandoEdit, setGuardandoEdit] = useState(false);

  // Modal Resetear Contraseña
  const [modalResetAbierto, setModalResetAbierto] = useState(false);
  const [usuarioSeleccionado, setUsuarioSeleccionado] = useState<any>(null);
  const [nuevaPasswordAdmin, setNuevaPasswordAdmin] = useState("");
  const [mensajeReset, setMensajeReset] = useState("");
  const [errorReset, setErrorReset] = useState("");

  const fetchUsuarios = async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      const res = await fetch(`${apiUrl}/usuarios/`, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setUsuarios(data);
      }
    } catch (error) {
      console.error("Error al cargar usuarios:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsuarios();
  }, []);

  // Crear Usuario
  const handleCrearUsuario = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    setErrorModal("");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      const res = await fetch(`${apiUrl}/usuarios/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: nuevoUsername,
          password: nuevoPassword,
          first_name: nuevoNombre,
          last_name: nuevoApellido,
          role: nuevoRol,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorModal(data.error || "No se pudo registrar el usuario.");
        return;
      }

      setModalAbierto(false);
      setNuevoUsername("");
      setNuevoPassword("");
      setNuevoNombre("");
      setNuevoApellido("");
      setNuevoRol("ESTUDIANTE");
      fetchUsuarios();
    } catch (err) {
      setErrorModal("Error de conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  };

  // Abrir Modal de Edición
  const abrirEditar = (u: any) => {
    setUsuarioEditando(u);
    setEditNombre(u.first_name || "");
    setEditApellido(u.last_name || "");
    setEditRol(u.role || "ESTUDIANTE");
    setErrorEditar("");
    setModalEditarAbierto(true);
  };

  // Guardar Cambios de Edición / Rol
  const handleGuardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardandoEdit(true);
    setErrorEditar("");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      const res = await fetch(`${apiUrl}/usuarios/`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: usuarioEditando.id,
          first_name: editNombre,
          last_name: editApellido,
          role: editRol,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorEditar(data.error || "No se pudo actualizar el usuario.");
        return;
      }

      setModalEditarAbierto(false);
      fetchUsuarios();
    } catch (err) {
      setErrorEditar("Error de conexión con el servidor.");
    } finally {
      setGuardandoEdit(false);
    }
  };

  // Activar / Desactivar
  const handleToggleEstado = async (userId: number) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      const res = await fetch(`${apiUrl}/usuarios/${userId}/toggle/`, {
        method: "POST",
      });
      if (res.ok) fetchUsuarios();
    } catch (error) {
      console.error("Error al cambiar estado:", error);
    }
  };

  // Resetear Contraseña
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorReset("");
    setMensajeReset("");

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api";
      const res = await fetch(`${apiUrl}/usuarios/${usuarioSeleccionado.id}/reset-password/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: nuevaPasswordAdmin }),
      });

      const data = await res.json();
      if (!res.ok) {
        setErrorReset(data.error || "No se pudo actualizar la contraseña.");
        return;
      }

      setMensajeReset("¡Contraseña restablecida con éxito!");
      setTimeout(() => {
        setModalResetAbierto(false);
        setNuevaPasswordAdmin("");
        setMensajeReset("");
      }, 1500);
    } catch (err) {
      setErrorReset("Error de conexión con el servidor.");
    }
  };

  // Filtrado y Paginación
  const usuariosFiltrados = usuarios.filter((u) => 
    u.username.toLowerCase().includes(busqueda.toLowerCase()) ||
    (u.nombre_completo && u.nombre_completo.toLowerCase().includes(busqueda.toLowerCase())) ||
    (u.role && u.role.toLowerCase().includes(busqueda.toLowerCase()))
  );

  const indiceUltimo = paginaActual * registrosPorPagina;
  const indicePrimero = indiceUltimo - registrosPorPagina;
  const usuariosActuales = usuariosFiltrados.slice(indicePrimero, indiceUltimo);
  const totalPaginas = Math.ceil(usuariosFiltrados.length / registrosPorPagina);

  return (
    <main className="p-8 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gestión de Usuarios y Roles</h1>
          <p className="text-sm text-slate-500 mt-1">
            Administre accesos, roles institucionales y recuperación de cuentas en la UNSCH.
          </p>
        </div>
        <button
          onClick={() => setModalAbierto(true)}
          className="px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-2"
        >
          + Registrar Nuevo Usuario
        </button>
      </div>

      {/* BARRA DE BÚSQUEDA */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 mb-6">
        <input
          type="text"
          placeholder="Buscar por DNI, nombre o rol..."
          value={busqueda}
          onChange={(e) => {
            setBusqueda(e.target.value);
            setPaginaActual(1);
          }}
          className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Cargando usuarios...</div>
      ) : usuarios.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
          No hay usuarios registrados en la base de datos.
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="p-4">DNI / Usuario</th>
                  <th className="p-4">Apellidos y Nombres</th>
                  <th className="p-4">Rol Institucional</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-right">Acciones de Cuenta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-600">
                {usuariosActuales.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="p-4 font-semibold text-slate-800 font-mono text-xs">{u.username}</td>
                    <td className="p-4 font-medium text-slate-700">{u.nombre_completo}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                        u.role === 'ADMIN' ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                        u.role === 'INDI' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                        u.role === 'GRADOS_TITULOS' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                        'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="p-4">
                      <span className={`font-medium text-xs px-2.5 py-1 rounded-full ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                        {u.is_active ? '● Activo' : '○ Inactivo'}
                      </span>
                    </td>
                    <td className="p-4 text-right space-x-2">
                      <button
                        onClick={() => abrirEditar(u)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-medium transition-colors border border-slate-200"
                      >
                        Editar Rol ✏️
                      </button>
                      <button
                        onClick={() => {
                          setUsuarioSeleccionado(u);
                          setModalResetAbierto(true);
                        }}
                        className="px-2.5 py-1 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg text-xs font-medium transition-colors border border-amber-200"
                      >
                        Clave 🔑
                      </button>
                      <button
                        onClick={() => handleToggleEstado(u.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                          u.is_active 
                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200' 
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border-emerald-200'
                        }`}
                      >
                        {u.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* PAGINACIÓN */}
          <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-slate-50/50">
            <span className="text-xs text-slate-500">
              Mostrando {indicePrimero + 1} a {Math.min(indiceUltimo, usuariosFiltrados.length)} de {usuariosFiltrados.length} usuarios
            </span>
            <div className="space-x-2 flex items-center">
              <button
                onClick={() => setPaginaActual((p) => Math.max(p - 1, 1))}
                disabled={paginaActual === 1}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-xs font-semibold px-2">{paginaActual} / {totalPaginas || 1}</span>
              <button
                onClick={() => setPaginaActual((p) => Math.min(p + 1, totalPaginas))}
                disabled={paginaActual === totalPaginas || totalPaginas === 0}
                className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-white disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR USUARIO */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-1">Registrar Nuevo Usuario</h2>
            <p className="text-xs text-slate-500 mb-4">Ingresa el DNI (8 dígitos) y credenciales institucionales.</p>

            {errorModal && <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs font-medium">{errorModal}</div>}

            <form onSubmit={handleCrearUsuario} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">DNI (8 dígitos)</label>
                <input
                  type="text"
                  required
                  maxLength={8}
                  placeholder="Ej. 74125896"
                  value={nuevoUsername}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    if (val.length <= 8) setNuevoUsername(val);
                  }}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombres</label>
                  <input
                    type="text"
                    required
                    placeholder="Juan Carlos"
                    value={nuevoNombre}
                    onChange={(e) => setNuevoNombre(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Apellidos</label>
                  <input
                    type="text"
                    required
                    placeholder="Pérez Gómez"
                    value={nuevoApellido}
                    onChange={(e) => setNuevoApellido(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-600">Contraseña Temporal</label>
                  <button
                    type="button"
                    onClick={() => {
                      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$";
                      let pass = "";
                      for (let i = 0; i < 8; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
                      setNuevoPassword(pass);
                    }}
                    className="text-[11px] text-purple-600 hover:underline font-medium"
                  >
                    Generar aleatoria ⚡
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Clave temporal"
                  value={nuevoPassword}
                  onChange={(e) => setNuevoPassword(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Rol Institucional</label>
                <select
                  value={nuevoRol}
                  onChange={(e) => setNuevoRol(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="ESTUDIANTE">Estudiante</option>
                  <option value="DOCENTE">Docente</option>
                  <option value="INDI">Personal INDI</option>
                  <option value="GRADOS_TITULOS">Grados y Títulos</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setModalAbierto(false)} className="px-4 py-2 border rounded-xl text-xs">Cancelar</button>
                <button type="submit" disabled={guardando} className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-semibold">
                  {guardando ? "Guardando..." : "Guardar Usuario"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL EDITAR USUARIO / ROL */}
      {modalEditarAbierto && usuarioEditando && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-1">Editar Usuario y Rol</h2>
            <p className="text-xs text-slate-500 mb-4">
              Modifique los datos o reasigne el rol para el DNI: <span className="font-semibold text-slate-700">{usuarioEditando.username}</span>
            </p>

            {errorEditar && <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">{errorEditar}</div>}

            <form onSubmit={handleGuardarEdicion} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Nombres</label>
                  <input
                    type="text"
                    required
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Apellidos</label>
                  <input
                    type="text"
                    required
                    value={editApellido}
                    onChange={(e) => setEditApellido(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Rol Institucional</label>
                <select
                  value={editRol}
                  onChange={(e) => setEditRol(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white"
                >
                  <option value="ESTUDIANTE">Estudiante</option>
                  <option value="DOCENTE">Docente</option>
                  <option value="INDI">Personal INDI</option>
                  <option value="GRADOS_TITULOS">Grados y Títulos</option>
                  <option value="ADMIN">Administrador</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setModalEditarAbierto(false)} className="px-4 py-2 border rounded-xl text-xs">Cancelar</button>
                <button type="submit" disabled={guardandoEdit} className="px-4 py-2 bg-purple-600 text-white rounded-xl text-xs font-semibold">
                  {guardandoEdit ? "Guardando..." : "Actualizar Datos"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL RESETEAR CONTRASEÑA */}
      {modalResetAbierto && usuarioSeleccionado && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-1">Restablecer Contraseña</h2>
            <p className="text-xs text-slate-500 mb-4">
              Establece una nueva clave para: <span className="font-semibold text-slate-700">{usuarioSeleccionado.nombre_completo} ({usuarioSeleccionado.username})</span>
            </p>

            {errorReset && <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">{errorReset}</div>}
            {mensajeReset && <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs font-medium">{mensajeReset}</div>}

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs font-semibold text-slate-600">Nueva Contraseña Temporal</label>
                  <button
                    type="button"
                    onClick={() => {
                      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789@#$";
                      let pass = "";
                      for (let i = 0; i < 8; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
                      setNuevaPasswordAdmin(pass);
                    }}
                    className="text-[11px] text-amber-600 hover:underline font-medium"
                  >
                    Generar aleatoria ⚡
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="Nueva clave"
                  value={nuevaPasswordAdmin}
                  onChange={(e) => setNuevaPasswordAdmin(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button type="button" onClick={() => setModalResetAbierto(false)} className="px-4 py-2 border rounded-xl text-xs">Cancelar</button>
                <button type="submit" className="px-4 py-2 bg-amber-600 text-white rounded-xl text-xs font-semibold hover:bg-amber-700">
                  Actualizar Clave
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}