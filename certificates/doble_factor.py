"""
Verificación en dos pasos (2FA) con app autenticadora (TOTP, RFC 6238) y códigos de respaldo.
No necesita librerías nuevas: el código TOTP se calcula con la biblioteca estándar.
"""
import base64
import hashlib
import hmac
import io
import secrets
import struct
import time
from urllib.parse import quote

from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.utils import timezone

from .models import DobleFactor

EMISOR = "INDI UNSCH"
PASO_SEGUNDOS = 30
VENTANA = 1                     # se acepta el código anterior y el siguiente (relojes algo desfasados)
MAX_FALLOS = 5
BLOQUEO_SEGUNDOS = 15 * 60
VIGENCIA_TOKEN_SEGUNDOS = 5 * 60
CANTIDAD_RESPALDO = 8
_ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # sin 0/O/1/I para evitar confusiones


# ---------------- Política ----------------
def roles_obligatorios():
    return set(getattr(settings, 'DOBLE_FACTOR_ROLES', ('ADMIN', 'INDI', 'GRADOS_TITULOS')))


def _rol_efectivo(user):
    if user.is_superuser:
        return 'ADMIN'
    return str(getattr(user, 'role', '') or '').upper()


def es_obligatorio_para(user):
    return bool(getattr(settings, 'DOBLE_FACTOR_OBLIGATORIO', False)) and _rol_efectivo(user) in roles_obligatorios()


def tiene_2fa(user):
    return DobleFactor.objects.filter(user=user, activo=True).exists()


# ---------------- TOTP ----------------
def nuevo_secreto():
    return base64.b32encode(secrets.token_bytes(20)).decode()


def _codigo_totp(secreto, paso):
    clave = base64.b32decode(secreto)
    h = hmac.new(clave, struct.pack('>Q', paso), hashlib.sha1).digest()
    o = h[-1] & 0x0F
    numero = (struct.unpack('>I', h[o:o + 4])[0] & 0x7FFFFFFF) % 1_000_000
    return f"{numero:06d}"


def _verificar_totp(df, codigo):
    """Acepta el código si es válido y más nuevo que el último usado (no se puede reutilizar)."""
    actual = int(time.time()) // PASO_SEGUNDOS
    for desfase in range(-VENTANA, VENTANA + 1):
        paso = actual + desfase
        if paso <= df.ultimo_paso:
            continue
        if hmac.compare_digest(_codigo_totp(df.secreto, paso), codigo):
            df.ultimo_paso = paso
            df.save(update_fields=['ultimo_paso'])
            return True
    return False


def uri_otpauth(user, secreto):
    cuenta = quote(f"{EMISOR}:{user.username}")
    return f"otpauth://totp/{cuenta}?secret={secreto}&issuer={quote(EMISOR)}&algorithm=SHA1&digits=6&period={PASO_SEGUNDOS}"


def qr_data_uri(texto):
    import qrcode
    img = qrcode.make(texto, box_size=6, border=2)
    b = io.BytesIO()
    img.save(b, format='PNG')
    return "data:image/png;base64," + base64.b64encode(b.getvalue()).decode()


# ---------------- Códigos de respaldo ----------------
def _hash_respaldo(codigo):
    return hashlib.sha256(("bk:" + codigo).encode()).hexdigest()


def generar_codigos_respaldo(df):
    """Crea un juego nuevo (invalida el anterior). Devuelve los códigos en claro: solo se muestran esta vez."""
    codigos = ["".join(secrets.choice(_ALFABETO) for _ in range(10)) for _ in range(CANTIDAD_RESPALDO)]
    df.codigos_respaldo = [_hash_respaldo(c) for c in codigos]
    df.save(update_fields=['codigos_respaldo'])
    return [f"{c[:5]}-{c[5:]}" for c in codigos]


def _usar_respaldo(df, codigo):
    h = _hash_respaldo(codigo)
    if h in (df.codigos_respaldo or []):
        df.codigos_respaldo = [x for x in df.codigos_respaldo if x != h]
        df.save(update_fields=['codigos_respaldo'])
        return True
    return False


# ---------------- Verificación con límite de intentos ----------------
def _normalizar(codigo):
    return "".join(ch for ch in str(codigo or "").upper() if ch.isalnum())


def verificar_codigo(user, df, codigo):
    """
    Devuelve (ok, mensaje, es_respaldo). Cuenta los fallos por usuario: 5 seguidos bloquean 15 minutos.
    """
    clave = f"2fa_fallos:{user.id}"
    if cache.get(clave, 0) >= MAX_FALLOS:
        return False, "Demasiados intentos con código incorrecto. Espera 15 minutos.", False
    c = _normalizar(codigo)
    ok, respaldo = False, False
    if len(c) == 6 and c.isdigit():
        ok = _verificar_totp(df, c)
    elif len(c) == 10:
        ok = respaldo = _usar_respaldo(df, c)
    if ok:
        cache.delete(clave)
        return True, "", respaldo
    cache.add(clave, 0, BLOQUEO_SEGUNDOS)
    try:
        cache.incr(clave)
    except ValueError:
        cache.set(clave, 1, BLOQUEO_SEGUNDOS)
    return False, "El código no es correcto. Revisa tu aplicación e inténtalo de nuevo.", False


# ---------------- Token temporal del paso intermedio ----------------
def _huella(user):
    return user.password[-12:]


def crear_token_2fa(user, proposito):
    """proposito: 'verificar' (ya tiene 2FA) o 'configurar' (debe activarlo para entrar)."""
    return signing.dumps({"u": user.id, "p": proposito, "pw": _huella(user)}, salt="2fa-paso")


def usuario_desde_token_2fa(token, proposito):
    from .models import User
    try:
        d = signing.loads(str(token or ''), salt="2fa-paso", max_age=VIGENCIA_TOKEN_SEGUNDOS)
    except signing.BadSignature:
        return None
    if d.get("p") != proposito:
        return None
    user = User.objects.filter(id=d.get("u"), is_active=True).first()
    if user is None or d.get("pw") != _huella(user):
        return None
    return user


def obtener_o_crear(user):
    df, _ = DobleFactor.objects.get_or_create(user=user, defaults={'secreto': nuevo_secreto()})
    return df


def reiniciar_secreto(user):
    """Prepara un secreto nuevo (sin activar). No toca una configuración ya activa."""
    df = obtener_o_crear(user)
    if df.activo:
        return None
    df.secreto = nuevo_secreto()
    df.ultimo_paso = 0
    df.save(update_fields=['secreto', 'ultimo_paso'])
    return df


def activar(df):
    df.activo = True
    df.confirmado_en = timezone.now()
    df.save(update_fields=['activo', 'confirmado_en'])
    return generar_codigos_respaldo(df)
