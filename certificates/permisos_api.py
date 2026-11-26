"""API de permisos por módulo (Fase 14)."""
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import permisos as P
from .models import PerfilPermisos, PermisosUsuario, User
from .views import _error, exigir_admin, exigir_usuario, registrar_auditoria, rol_de


def _limpiar(rol, crudo):
    """Deja solo módulos y niveles válidos para el rol. Devuelve (dict, error)."""
    if crudo in (None, ''):
        return {}, None
    if not isinstance(crudo, dict):
        return None, "Formato de permisos no válido."
    mods = P.modulos_del_rol(rol)
    limpio = {}
    for clave, nivel in crudo.items():
        if nivel in (None, ''):
            continue  # «según el rol»
        if clave not in mods:
            return None, f"El módulo «{clave}» no existe para el rol {rol}."
        n = P.nivel_valido(nivel)
        if not n:
            return None, f"Nivel no válido para «{clave}»."
        if P.ORDEN[n] > P.ORDEN[mods[clave][1]]:
            return None, f"El módulo «{P.MODULOS[clave]['etiqueta']}» solo admite hasta «{P.ETIQUETAS_NIVEL[mods[clave][1]]}»."
        limpio[clave] = n
    return limpio, None


def _datos_perfil(p):
    return {
        "id": p.id, "nombre": p.nombre, "descripcion": p.descripcion, "rol": p.rol,
        "permisos": p.permisos or {}, "usuarios": p.usuarios.count(),
    }


def _resumen(efectivo):
    return ", ".join(f"{k}={v}" for k, v in sorted(efectivo.items()))


# ----------------------------------------------------------
@api_view(['GET'])
@permission_classes([AllowAny])
def mis_permisos_api(request):
    """Lo que el usuario que inició sesión puede hacer en cada módulo (para el menú)."""
    user, error = exigir_usuario(request)
    if error:
        return error
    maximos = {k: v[1] for k, v in P.modulos_del_rol(rol_de(user)).items()}
    return Response({"role": rol_de(user), "modulos": P.permisos_efectivos(user), "maximos": maximos})


@api_view(['GET'])
@permission_classes([AllowAny])
def catalogo_permisos_api(request):
    user, error = exigir_admin(request)
    if error:
        return error
    return Response({
        "niveles": [{"clave": k, "etiqueta": v} for k, v in P.ETIQUETAS_NIVEL.items()],
        "roles": [
            {"rol": r, "etiqueta": P.ETIQUETAS_ROL[r], "modulos": P.catalogo_para_rol(r)}
            for r in P.ROLES_CONFIGURABLES
        ],
    })


# ----------------------------------------------------------
# Plantillas (perfiles)
# ----------------------------------------------------------
@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def perfiles_permisos_api(request):
    actor, error = exigir_admin(request)
    if error:
        return error
    if request.method == 'GET':
        return Response([_datos_perfil(p) for p in PerfilPermisos.objects.all()])

    nombre = str(request.data.get('nombre') or '').strip()
    rol = str(request.data.get('rol') or '').strip().upper()
    if not nombre:
        return _error("Escribe un nombre para la plantilla.", status.HTTP_400_BAD_REQUEST)
    if rol not in P.ROLES_CONFIGURABLES:
        return _error("Elige el rol al que se aplica la plantilla.", status.HTTP_400_BAD_REQUEST)
    if PerfilPermisos.objects.filter(nombre__iexact=nombre).exists():
        return _error("Ya existe una plantilla con ese nombre.", status.HTTP_400_BAD_REQUEST)
    permisos, err = _limpiar(rol, request.data.get('permisos'))
    if err:
        return _error(err, status.HTTP_400_BAD_REQUEST)
    p = PerfilPermisos.objects.create(
        nombre=nombre[:80], descripcion=str(request.data.get('descripcion') or '')[:200], rol=rol, permisos=permisos)
    registrar_auditoria(actor, "PLANTILLA DE PERMISOS CREADA", f"Plantilla «{p.nombre}» ({rol}): {permisos or 'igual que el rol'}.")
    return Response(_datos_perfil(p), status=status.HTTP_201_CREATED)


@api_view(['PUT', 'DELETE'])
@permission_classes([AllowAny])
def perfil_permisos_detalle_api(request, perfil_id):
    actor, error = exigir_admin(request)
    if error:
        return error
    p = get_object_or_404(PerfilPermisos, id=perfil_id)

    if request.method == 'DELETE':
        n = p.usuarios.count()
        nombre = p.nombre
        p.delete()  # los usuarios quedan sin plantilla (conservan sus excepciones)
        registrar_auditoria(actor, "PLANTILLA DE PERMISOS ELIMINADA", f"Plantilla «{nombre}» eliminada; {n} usuario(s) quedaron con los permisos de su rol.")
        return Response({"status": "success", "message": f"Plantilla eliminada. {n} usuario(s) vuelven a los permisos de su rol."})

    nombre = str(request.data.get('nombre', p.nombre) or '').strip()
    if not nombre:
        return _error("Escribe un nombre para la plantilla.", status.HTTP_400_BAD_REQUEST)
    if PerfilPermisos.objects.filter(nombre__iexact=nombre).exclude(id=p.id).exists():
        return _error("Ya existe una plantilla con ese nombre.", status.HTTP_400_BAD_REQUEST)
    permisos, err = _limpiar(p.rol, request.data.get('permisos', p.permisos))
    if err:
        return _error(err, status.HTTP_400_BAD_REQUEST)
    p.nombre = nombre[:80]
    p.descripcion = str(request.data.get('descripcion', p.descripcion) or '')[:200]
    p.permisos = permisos
    p.save()
    registrar_auditoria(actor, "PLANTILLA DE PERMISOS EDITADA",
                        f"Plantilla «{p.nombre}» ({p.rol}) actualizada: {permisos or 'igual que el rol'}. Afecta a {p.usuarios.count()} usuario(s).")
    return Response(_datos_perfil(p))


@api_view(['POST'])
@permission_classes([AllowAny])
def perfil_permisos_asignar_api(request, perfil_id):
    """Asigna (o quita) la plantilla a varios usuarios de una vez."""
    actor, error = exigir_admin(request)
    if error:
        return error
    p = get_object_or_404(PerfilPermisos, id=perfil_id)
    ids = request.data.get('user_ids')
    if not isinstance(ids, list) or not ids:
        return _error("Elige al menos un usuario.", status.HTTP_400_BAD_REQUEST)
    quitar = str(request.data.get('accion') or 'asignar') == 'quitar'
    usuarios = list(User.objects.filter(id__in=ids, role=p.rol))
    omitidos = len(set(ids)) - len(usuarios)
    with transaction.atomic():
        for u in usuarios:
            reg, _ = PermisosUsuario.objects.get_or_create(user=u)
            if quitar:
                if reg.perfil_id == p.id:
                    reg.perfil = None
                    reg.save()
            else:
                reg.perfil = p
                reg.save()
    registrar_auditoria(
        actor, "PLANTILLA DE PERMISOS " + ("QUITADA" if quitar else "ASIGNADA"),
        f"Plantilla «{p.nombre}»: {len(usuarios)} usuario(s) ({', '.join(u.username for u in usuarios)}).")
    msg = f"Plantilla {'quitada a' if quitar else 'asignada a'} {len(usuarios)} usuario(s)."
    if omitidos:
        msg += f" {omitidos} omitido(s) por no tener el rol {p.rol}."
    return Response({"status": "success", "message": msg, "plantilla": _datos_perfil(p)})


# ----------------------------------------------------------
# Permisos de un usuario
# ----------------------------------------------------------
def _datos_usuario(u):
    reg = PermisosUsuario.objects.filter(user=u).select_related('perfil').first()
    rol = rol_de(u)
    perfil = reg.perfil if (reg and reg.perfil and reg.perfil.rol == rol) else None
    excepciones = reg.excepciones if reg else {}
    base = P.base_del_rol(rol)
    con_perfil = P.calcular_efectivos(rol, perfil.permisos if perfil else {}, {})
    return {
        "id": u.id, "username": u.username, "role": rol,
        "nombre": f"{u.first_name} {u.last_name}".strip() or u.username,
        "perfil_id": perfil.id if perfil else None,
        "excepciones": excepciones,
        "base": base,                 # lo que da el rol
        "con_plantilla": con_perfil,  # rol + plantilla
        "efectivos": P.calcular_efectivos(rol, perfil.permisos if perfil else {}, excepciones),
        "modulos": P.catalogo_para_rol(rol),
    }


@api_view(['GET', 'PUT'])
@permission_classes([AllowAny])
def permisos_usuario_api(request, user_id):
    actor, error = exigir_admin(request)
    if error:
        return error
    u = get_object_or_404(User, id=user_id)
    rol = rol_de(u)
    if rol not in P.ROLES_CONFIGURABLES or P.esta_exento(u):
        return _error("Este tipo de usuario no tiene módulos configurables.", status.HTTP_400_BAD_REQUEST)

    if request.method == 'GET':
        return Response(_datos_usuario(u))

    antes = _datos_usuario(u)['efectivos']
    perfil = None
    perfil_id = request.data.get('perfil_id')
    if perfil_id not in (None, ''):
        perfil = PerfilPermisos.objects.filter(id=perfil_id).first()
        if perfil is None or perfil.rol != rol:
            return _error("La plantilla no existe o no corresponde al rol de este usuario.", status.HTTP_400_BAD_REQUEST)
    excepciones, err = _limpiar(rol, request.data.get('excepciones'))
    if err:
        return _error(err, status.HTTP_400_BAD_REQUEST)

    reg, _ = PermisosUsuario.objects.get_or_create(user=u)
    reg.perfil = perfil
    reg.excepciones = excepciones
    reg.save()
    despues = _datos_usuario(u)
    cambios = [f"{k}: {antes.get(k)}→{v}" for k, v in despues['efectivos'].items() if antes.get(k) != v]
    registrar_auditoria(
        actor, "PERMISOS DE USUARIO",
        f"Usuario {u.username} ({rol}). Plantilla: {perfil.nombre if perfil else 'ninguna'}. "
        f"Cambios: {'; '.join(cambios) if cambios else 'sin cambios en los accesos'}.")
    despues["message"] = "Permisos actualizados. Se aplican de inmediato."
    return Response(despues)
