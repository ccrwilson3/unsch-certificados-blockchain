"""Vistas de la verificación en dos pasos (2FA)."""
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import doble_factor as DF
from .models import DobleFactor, User
from .views import _error, _respuesta_login, exigir_admin, exigir_usuario, registrar_auditoria

TOKEN_INVALIDO = "La sesión de verificación venció. Vuelve a ingresar tu usuario y contraseña."


def _datos_configuracion(user, df):
    uri = DF.uri_otpauth(user, df.secreto)
    return {"secreto": df.secreto, "otpauth": uri, "qr": DF.qr_data_uri(uri)}


# ----------------------------------------------------------
# Durante el inicio de sesión (sin sesión todavía: se usa el token temporal)
# ----------------------------------------------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def verificar_2fa_login_api(request):
    user = DF.usuario_desde_token_2fa(request.data.get('token_2fa'), 'verificar')
    if user is None:
        return _error(TOKEN_INVALIDO, status.HTTP_401_UNAUTHORIZED)
    df = DobleFactor.objects.filter(user=user, activo=True).first()
    if df is None:
        return _error(TOKEN_INVALIDO, status.HTTP_401_UNAUTHORIZED)

    ok, mensaje, respaldo = DF.verificar_codigo(user, df, request.data.get('codigo'))
    if not ok:
        registrar_auditoria(user, "2FA FALLIDO", "Código de verificación incorrecto al iniciar sesión.")
        return _error(mensaje, status.HTTP_400_BAD_REQUEST)

    registrar_auditoria(
        user, "INICIO DE SESIÓN (2FA)",
        "Ingreso con código de respaldo." if respaldo else "Ingreso con verificación en dos pasos."
    )
    datos = _respuesta_login(user)
    datos["codigos_restantes"] = len(df.codigos_respaldo or [])
    return Response(datos)


@api_view(['POST'])
@permission_classes([AllowAny])
def configurar_2fa_login_iniciar_api(request):
    """El rol exige 2FA y el usuario aún no lo tiene: entrega el QR para configurarlo."""
    user = DF.usuario_desde_token_2fa(request.data.get('token_2fa'), 'configurar')
    if user is None:
        return _error(TOKEN_INVALIDO, status.HTTP_401_UNAUTHORIZED)
    df = DF.reiniciar_secreto(user)
    if df is None:
        return _error("Ya tienes la verificación en dos pasos activada.", status.HTTP_409_CONFLICT)
    return Response(_datos_configuracion(user, df))


@api_view(['POST'])
@permission_classes([AllowAny])
def configurar_2fa_login_confirmar_api(request):
    user = DF.usuario_desde_token_2fa(request.data.get('token_2fa'), 'configurar')
    if user is None:
        return _error(TOKEN_INVALIDO, status.HTTP_401_UNAUTHORIZED)
    df = DobleFactor.objects.filter(user=user, activo=False).first()
    if df is None:
        return _error("Primero genera el código QR.", status.HTTP_400_BAD_REQUEST)
    ok, mensaje, _ = DF.verificar_codigo(user, df, request.data.get('codigo'))
    if not ok:
        return _error(mensaje, status.HTTP_400_BAD_REQUEST)
    codigos = DF.activar(df)
    registrar_auditoria(user, "2FA ACTIVADO", "Activó la verificación en dos pasos (exigida por su rol).")
    datos = _respuesta_login(user)
    datos["codigos_respaldo"] = codigos
    return Response(datos)


# ----------------------------------------------------------
# Desde "Mi cuenta" (con sesión)
# ----------------------------------------------------------
@api_view(['GET'])
@permission_classes([AllowAny])
def estado_2fa_api(request):
    user, error = exigir_usuario(request)
    if error:
        return error
    df = DobleFactor.objects.filter(user=user, activo=True).first()
    return Response({
        "activo": df is not None,
        "obligatorio": DF.es_obligatorio_para(user),
        "codigos_restantes": len(df.codigos_respaldo or []) if df else 0,
        "activado_en": df.confirmado_en.isoformat() if df and df.confirmado_en else None,
    })


@api_view(['POST'])
@permission_classes([AllowAny])
def activar_2fa_iniciar_api(request):
    user, error = exigir_usuario(request)
    if error:
        return error
    if not user.check_password(str(request.data.get('password') or '')):
        return _error("La contraseña no es correcta.", status.HTTP_400_BAD_REQUEST)
    df = DF.reiniciar_secreto(user)
    if df is None:
        return _error("Ya tienes la verificación en dos pasos activada.", status.HTTP_409_CONFLICT)
    return Response(_datos_configuracion(user, df))


@api_view(['POST'])
@permission_classes([AllowAny])
def activar_2fa_confirmar_api(request):
    user, error = exigir_usuario(request)
    if error:
        return error
    df = DobleFactor.objects.filter(user=user, activo=False).first()
    if df is None:
        return _error("Primero genera el código QR.", status.HTTP_400_BAD_REQUEST)
    ok, mensaje, _ = DF.verificar_codigo(user, df, request.data.get('codigo'))
    if not ok:
        return _error(mensaje, status.HTTP_400_BAD_REQUEST)
    codigos = DF.activar(df)
    registrar_auditoria(user, "2FA ACTIVADO", "Activó la verificación en dos pasos.")
    return Response({"status": "success", "codigos_respaldo": codigos})


def _validar_password_y_codigo(request, user):
    """Para acciones sensibles: contraseña + un código vigente. Devuelve (df, error_response)."""
    df = DobleFactor.objects.filter(user=user, activo=True).first()
    if df is None:
        return None, _error("No tienes la verificación en dos pasos activada.", status.HTTP_409_CONFLICT)
    if not user.check_password(str(request.data.get('password') or '')):
        return None, _error("La contraseña no es correcta.", status.HTTP_400_BAD_REQUEST)
    ok, mensaje, _ = DF.verificar_codigo(user, df, request.data.get('codigo'))
    if not ok:
        return None, _error(mensaje, status.HTTP_400_BAD_REQUEST)
    return df, None


@api_view(['POST'])
@permission_classes([AllowAny])
def desactivar_2fa_api(request):
    user, error = exigir_usuario(request)
    if error:
        return error
    if DF.es_obligatorio_para(user):
        return _error("Tu rol exige la verificación en dos pasos: no se puede desactivar.", status.HTTP_403_FORBIDDEN)
    df, err = _validar_password_y_codigo(request, user)
    if err:
        return err
    df.delete()
    registrar_auditoria(user, "2FA DESACTIVADO", "Desactivó la verificación en dos pasos.")
    return Response({"status": "success", "message": "Verificación en dos pasos desactivada."})


@api_view(['POST'])
@permission_classes([AllowAny])
def regenerar_codigos_2fa_api(request):
    user, error = exigir_usuario(request)
    if error:
        return error
    df, err = _validar_password_y_codigo(request, user)
    if err:
        return err
    codigos = DF.generar_codigos_respaldo(df)
    registrar_auditoria(user, "2FA CÓDIGOS DE RESPALDO RENOVADOS", "Generó un juego nuevo de códigos de respaldo.")
    return Response({"status": "success", "codigos_respaldo": codigos})


# ----------------------------------------------------------
# Administrador: dispositivo perdido
# ----------------------------------------------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def resetear_2fa_admin_api(request, user_id):
    actor, error = exigir_admin(request)
    if error:
        return error
    objetivo = get_object_or_404(User, id=user_id)
    borrados, _ = DobleFactor.objects.filter(user=objetivo).delete()
    if not borrados:
        return _error("Ese usuario no tiene la verificación en dos pasos activada.", status.HTTP_409_CONFLICT)
    registrar_auditoria(actor, "2FA RESTABLECIDO POR ADMIN", f"Se quitó la verificación en dos pasos de {objetivo.username}.")
    return Response({
        "status": "success",
        "message": f"Listo. {objetivo.username} deberá configurar su verificación en dos pasos en su próximo ingreso."
                   if DF.es_obligatorio_para(objetivo) else
                   f"Se quitó la verificación en dos pasos de {objetivo.username}.",
    })
