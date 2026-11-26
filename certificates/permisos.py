"""
Permisos por módulo (Fase 14).

Cómo se calcula lo que un usuario puede hacer en cada módulo (de menor a mayor prioridad):
  1. Lo que da su ROL (tabla MODULOS).
  2. La plantilla (PerfilPermisos) que el administrador le haya asignado.
  3. Las excepciones propias de ese usuario.

Niveles: NINGUNO (no ve el módulo), VER (solo consulta) y EDITAR (consulta y modifica).

El administrador (rol ADMIN o superusuario) nunca se restringe, para que nadie se quede sin acceso.
Los estudiantes no usan módulos: no se les aplica nada de esto.

Para AGREGAR UN MÓDULO NUEVO al sistema basta con:
  1. añadirlo a MODULOS (con los roles que lo usan y su nivel por defecto), y
  2. añadir las rutas de su API a RUTAS_MODULO.
No hace falta tocar nada más: el administrador lo verá enseguida en la pantalla de permisos.
"""

NINGUNO, VER, EDITAR = 'NINGUNO', 'VER', 'EDITAR'
ORDEN = {NINGUNO: 0, VER: 1, EDITAR: 2}
ETIQUETAS_NIVEL = {NINGUNO: 'Sin acceso', VER: 'Solo ver', EDITAR: 'Ver y editar'}

ROLES_CONFIGURABLES = ('INDI', 'DOCENTE', 'GRADOS_TITULOS')
ETIQUETAS_ROL = {'INDI': 'Personal del INDI', 'DOCENTE': 'Docente', 'GRADOS_TITULOS': 'Grados y Títulos'}

# clave -> etiqueta, descripción y, por rol: (nivel por defecto, nivel máximo)
MODULOS = {
    'solicitudes': {
        'etiqueta': 'Bandeja de solicitudes',
        'descripcion': 'Revisar solicitudes de certificado, validar pagos y emitir certificados.',
        'roles': {'INDI': (EDITAR, EDITAR)},
    },
    'revocaciones': {
        'etiqueta': 'Revocar certificados',
        'descripcion': 'Anular un certificado ya emitido (acción delicada, se puede dar por separado).',
        'roles': {'INDI': (EDITAR, EDITAR)},
    },
    'cursos': {
        'etiqueta': 'Gestión de cursos',
        'descripcion': 'Crear y editar cursos, docentes y fechas.',
        'roles': {'INDI': (EDITAR, EDITAR)},
    },
    'matriculas': {
        'etiqueta': 'Gestión de matrículas',
        'descripcion': 'Revisar pagos de matrícula, aprobar y ampliar reservas.',
        'roles': {'INDI': (EDITAR, EDITAR)},
    },
    'actas': {
        'etiqueta': 'Actas de notas',
        'descripcion': 'Consultar actas y, en el INDI, firmarlas, observarlas o reabrirlas.',
        'roles': {'INDI': (EDITAR, EDITAR), 'GRADOS_TITULOS': (VER, VER)},
    },
    'reportes': {
        'etiqueta': 'Reportes',
        'descripcion': 'Resumen de ingresos y matriculados, y descarga de Excel.',
        'roles': {'INDI': (VER, VER)},
    },
    'validar_requisitos': {
        'etiqueta': 'Validar requisitos',
        'descripcion': 'Comprobar un certificado para trámites de grados y títulos.',
        'roles': {'GRADOS_TITULOS': (VER, VER)},
    },
    'docente_cursos': {
        'etiqueta': 'Mis cursos y evaluaciones',
        'descripcion': 'Ver sus cursos y definir las evaluaciones.',
        'roles': {'DOCENTE': (EDITAR, EDITAR)},
    },
    'docente_notas': {
        'etiqueta': 'Registro de notas y acta',
        'descripcion': 'Registrar notas y firmar el acta de sus cursos.',
        'roles': {'DOCENTE': (EDITAR, EDITAR)},
    },
    'docente_asistencia': {
        'etiqueta': 'Asistencia',
        'descripcion': 'Tomar y exportar la asistencia de sus cursos.',
        'roles': {'DOCENTE': (EDITAR, EDITAR)},
    },
    'docente_materiales': {
        'etiqueta': 'Materiales para estudiantes',
        'descripcion': 'Subir y retirar materiales de clase.',
        'roles': {'DOCENTE': (EDITAR, EDITAR)},
    },
}

# url_name de la API -> módulos que dan paso (basta con uno). Solo se exige a los roles que
# usan alguno de esos módulos; el resto de roles sigue con sus reglas de siempre.
RUTAS_MODULO = {
    # Bandeja de solicitudes
    'api_solicitudes_estudiante': ['solicitudes'],
    'api_aprobar_solicitud': ['solicitudes'],
    'rectificar_solicitud_api': ['solicitudes'],
    'orden_pago_certificado_pdf': ['solicitudes'],
    'formato_solicitud_certificado_pdf': ['solicitudes'],
    'ver_solicitud_certificado_api': ['solicitudes'],
    'ver_voucher_certificado_api': ['solicitudes'],
    'revisar_pago_certificado_api': ['solicitudes'],
    'reenviar_correo_certificado_api': ['solicitudes'],
    'revocar-certificado': ['revocaciones'],
    # Cursos
    'gestionar_cursos_api': ['cursos'],
    'editar_curso_api': ['cursos'],
    'listar_docentes_por_idioma': ['cursos'],
    # Matrículas
    'gestionar_matriculas_api': ['matriculas'],
    'aprobar_matricula_api': ['matriculas'],
    'cancelar_matricula_api': ['matriculas'],
    'ampliar_reserva_api': ['matriculas'],
    'ver_voucher_matricula_api': ['matriculas'],
    'descargar_orden_pago_pdf': ['matriculas'],
    # Actas
    'actas_lista_api': ['actas'],
    'acta_curso_api': ['actas', 'docente_notas'],
    'acta_accion_api': ['actas', 'docente_notas'],
    'acta_pdf_api': ['actas', 'docente_notas'],
    # Reportes
    'reporte_resumen_api': ['reportes'],
    'reporte_ingresos_excel_api': ['reportes'],
    'reporte_matriculados_excel_api': ['reportes'],
    # Docente
    'cursos_del_docente_api': ['docente_cursos', 'docente_notas', 'docente_asistencia', 'docente_materiales', 'reportes'],
    'gestionar_evaluaciones_y_notas_api': ['docente_cursos', 'docente_notas'],
    'gestionar_notas_curso_api': ['docente_notas'],
    'asistencia_curso_api': ['docente_asistencia'],
    'exportar_asistencia_excel_api': ['docente_asistencia'],
    'materiales_curso_api': ['docente_materiales'],
    'eliminar_material_api': ['docente_materiales'],
}

METODOS_LECTURA = ('GET', 'HEAD', 'OPTIONS')


def _rol(user):
    return str(getattr(user, 'role', '') or '').upper()


def esta_exento(user):
    """El administrador nunca se restringe."""
    return bool(user.is_superuser or _rol(user) == 'ADMIN')


def modulos_del_rol(rol):
    """Módulos que existen para ese rol: {clave: (defecto, máximo)}."""
    return {k: m['roles'][rol] for k, m in MODULOS.items() if rol in m['roles']}


def nivel_valido(valor):
    valor = str(valor or '').upper()
    return valor if valor in ORDEN else None


def _limitar(nivel, maximo):
    return nivel if ORDEN[nivel] <= ORDEN[maximo] else maximo


def base_del_rol(rol):
    return {k: v[0] for k, v in modulos_del_rol(rol).items()}


def calcular_efectivos(rol, perfil_permisos=None, excepciones=None):
    """Aplica rol -> plantilla -> excepciones y respeta el máximo de cada módulo."""
    mods = modulos_del_rol(rol)
    efectivo = {k: v[0] for k, v in mods.items()}
    for capa in (perfil_permisos or {}, excepciones or {}):
        for clave, nivel in capa.items():
            n = nivel_valido(nivel)
            if clave in mods and n:
                efectivo[clave] = _limitar(n, mods[clave][1])
    return efectivo


def permisos_efectivos(user):
    """Nivel de cada módulo para el usuario (calculado una vez por petición)."""
    guardado = getattr(user, '_permisos_efectivos', None)
    if guardado is not None:
        return guardado
    rol = _rol(user)
    if esta_exento(user):
        # Administrador: todo en el nivel más alto que exista
        efectivo = {k: EDITAR for k in MODULOS}
    else:
        reg = None
        try:
            reg = user.permisos_modulos
        except Exception:
            reg = None
        perfil = reg.perfil.permisos if (reg and reg.perfil_id and reg.perfil.rol == rol) else {}
        efectivo = calcular_efectivos(rol, perfil, reg.excepciones if reg else {})
    try:
        user._permisos_efectivos = efectivo
    except Exception:
        pass
    return efectivo


def motivo_de_bloqueo(request, user):
    """
    Devuelve None si la acción está permitida, o el mensaje que se le muestra al usuario.
    Se llama desde exigir_usuario, así que cubre todos los endpoints protegidos de una vez.
    """
    if esta_exento(user):
        return None
    match = getattr(request, 'resolver_match', None)
    claves = RUTAS_MODULO.get(getattr(match, 'url_name', None) or '')
    if not claves:
        return None
    rol = _rol(user)
    aplicables = [c for c in claves if rol in MODULOS[c]['roles']]
    if not aplicables:
        return None  # ese rol no usa estos módulos: rigen sus reglas habituales
    necesario = VER if request.method in METODOS_LECTURA else EDITAR
    efectivo = permisos_efectivos(user)
    if any(ORDEN[efectivo.get(c, NINGUNO)] >= ORDEN[necesario] for c in aplicables):
        return None
    etiqueta = MODULOS[aplicables[0]]['etiqueta']
    if any(efectivo.get(c, NINGUNO) == VER for c in aplicables):
        return f"Tu acceso al módulo «{etiqueta}» es de solo lectura. Pide al administrador el permiso de edición."
    return f"No tienes acceso al módulo «{etiqueta}». Pide al administrador que te lo habilite."


def catalogo_para_rol(rol):
    return [
        {
            'clave': k, 'etiqueta': MODULOS[k]['etiqueta'], 'descripcion': MODULOS[k]['descripcion'],
            'defecto': v[0], 'maximo': v[1],
        }
        for k, v in modulos_del_rol(rol).items()
    ]
