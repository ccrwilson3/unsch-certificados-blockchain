"""
Tokens de sesión firmados para la API.

El token se crea al iniciar sesión y se envía en cada petición como:
    Authorization: Bearer <token>

Está firmado con la SECRET_KEY de Django: nadie puede fabricar uno sin conocerla,
y vence solo a las 12 horas. No necesita tablas nuevas en la base de datos.
"""
from django.contrib.auth import get_user_model
from django.core import signing
from rest_framework.authentication import BaseAuthentication

SALT = "certificates.tokens"
DURACION_SEGUNDOS = 12 * 60 * 60  # 12 horas


def crear_token(user):
    """Genera un token firmado para el usuario."""
    return signing.dumps({"uid": user.id}, salt=SALT)


def usuario_desde_token(token):
    """Devuelve el usuario activo dueño del token, o None si es inválido o venció."""
    try:
        datos = signing.loads(token, salt=SALT, max_age=DURACION_SEGUNDOS)
    except signing.BadSignature:  # incluye tokens vencidos o manipulados
        return None

    User = get_user_model()
    return User.objects.filter(id=datos.get("uid"), is_active=True).first()


class BearerTokenAuthentication(BaseAuthentication):
    """
    Autenticación de Django REST Framework con 'Authorization: Bearer <token>'.
    Si el token no es válido devuelve None (no rompe la petición): cada vista decide
    si exige usuario autenticado.
    """

    def authenticate(self, request):
        header = request.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return None

        usuario = usuario_desde_token(header[len("Bearer "):].strip())
        if usuario is None:
            return None

        return (usuario, None)