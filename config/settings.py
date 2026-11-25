"""
Django settings for config project.

Los valores sensibles (SECRET_KEY, DEBUG, hosts permitidos) se leen del archivo .env
de la raíz del proyecto. Ese archivo NO se sube a git.
"""

import os
from decimal import Decimal

from django.core.exceptions import ImproperlyConfigured
from pathlib import Path

from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Cargar las variables del archivo .env (junto a manage.py)
load_dotenv(BASE_DIR / '.env')


# SECURITY WARNING: keep the secret key used in production secret!
# Se define en .env como DJANGO_SECRET_KEY. El valor de abajo es solo un respaldo para desarrollo.
_CLAVE_DESARROLLO = 'django-insecure-solo-para-desarrollo-local'
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', _CLAVE_DESARROLLO)

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DJANGO_DEBUG', 'True').strip().lower() == 'true'

# En producción (DEBUG=False) NO se permite arrancar con la clave de desarrollo:
# con ella cualquiera podría fabricar tokens de sesión válidos.
if not DEBUG and (SECRET_KEY == _CLAVE_DESARROLLO or len(SECRET_KEY) < 40):
    raise ImproperlyConfigured(
        "Con DJANGO_DEBUG=False debes definir en .env una DJANGO_SECRET_KEY propia de al menos 40 caracteres. "
        "Puedes generar una con: python -c \"from django.core.management.utils import get_random_secret_key as g; print(g())\""
    )

# Lista separada por comas, por ejemplo: localhost,127.0.0.1,192.168.100.32
# Por defecto '*' (igual que antes). Al publicar el sistema, restringir en .env.
ALLOWED_HOSTS = [h.strip() for h in os.getenv('DJANGO_ALLOWED_HOSTS', '*').split(',') if h.strip()]


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'certificates',
    'corsheaders',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'certificates.contexto.IPAuditoriaMiddleware',  # anota la IP en la auditoría
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database
# Es la misma base de datos SQLite de siempre (archivo unsch_cert_db en la raíz),
# ahora con ruta absoluta para que no dependa de la carpeta desde donde se ejecute Django.
# Si en .env existe DB_NAME se usa PostgreSQL (recomendado en producción; requiere: pip install psycopg[binary]).
# Si no, se usa SQLite como siempre.
if os.getenv('DB_NAME'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.getenv('DB_NAME'),
            'USER': os.getenv('DB_USER', ''),
            'PASSWORD': os.getenv('DB_PASSWORD', ''),
            'HOST': os.getenv('DB_HOST', 'localhost'),
            'PORT': os.getenv('DB_PORT', '5432'),
            'CONN_MAX_AGE': 60,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'unsch_cert_db',
        }
    }

# Los límites de intentos (login, recuperar contraseña, etc.) cuentan en la caché.
# Con un solo proceso basta la memoria local; con varios procesos (gunicorn) usar la base de datos:
# DJANGO_CACHE_EN_BD=True y luego:  python manage.py createcachetable
if os.getenv('DJANGO_CACHE_EN_BD', 'False').strip().lower() == 'true':
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.db.DatabaseCache',
            'LOCATION': 'cache_limites',
        }
    }


# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
LANGUAGE_CODE = 'en-us'

# Hora de Perú: las fechas de asistencia, reportes y correos se cuentan por día local (la base guarda UTC).
TIME_ZONE = 'America/Lima'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'


# Correo: si en .env existe EMAIL_HOST se envían correos reales por SMTP;
# si no, los correos se imprimen en la consola de Django (modo desarrollo).
EMAIL_HOST = os.getenv('EMAIL_HOST', '')
if EMAIL_HOST:
    EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
    EMAIL_PORT = int(os.getenv('EMAIL_PORT', '587'))
    EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER', '')
    EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD', '')
    EMAIL_USE_TLS = os.getenv('EMAIL_USE_TLS', 'True').strip().lower() == 'true'
    EMAIL_TIMEOUT = 15
else:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'INDI UNSCH <no-reply@unsch.edu.pe>')

# ¡Vital para que viajen las cookies de sesión!
CORS_ALLOW_CREDENTIALS = True

AUTH_USER_MODEL = 'certificates.User'

# Permitir explícitamente el origen del frontend con credenciales
# En producción, definir en .env los orígenes reales separados por comas:
# CORS_ORIGINS=https://certificados.indi.unsch.edu.pe
_ORIGENES_DEFECTO = "http://localhost:3000,http://127.0.0.1:3000,http://192.168.100.32:3000"
CORS_ALLOWED_ORIGINS = [o.strip() for o in os.getenv('CORS_ORIGINS', _ORIGENES_DEFECTO).split(',') if o.strip()]
CSRF_TRUSTED_ORIGINS = list(CORS_ALLOWED_ORIGINS)

# ==========================================================
# SEGURIDAD EN PRODUCCIÓN (solo se activa con DJANGO_DEBUG=False)
# ==========================================================

# True si el sistema está detrás de un proxy (nginx) que ya maneja HTTPS: se confía en sus cabeceras.
CONFIAR_EN_PROXY = os.getenv('CONFIAR_EN_PROXY', 'False').strip().lower() == 'true'

if not DEBUG:
    SECURE_SSL_REDIRECT = os.getenv('FORZAR_HTTPS', 'True').strip().lower() == 'true'
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.getenv('HSTS_SEGUNDOS', '31536000'))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = 'same-origin'
    X_FRAME_OPTIONS = 'DENY'
    if CONFIAR_EN_PROXY:
        SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')

CORS_ALLOW_HEADERS = [
    'accept',
    'accept-encoding',
    'authorization',
    'content-type',
    'dnt',
    'origin',
    'user-agent',
    'x-csrftoken',
    'x-requested-with',
]

CORS_ALLOW_METHODS = [
    'DELETE',
    'GET',
    'OPTIONS',
    'PATCH',
    'POST',
    'PUT',
]

# Dirección del frontend que se escribe dentro del QR de cada certificado.
# Si tu IP local cambia, edita FRONTEND_URL en el archivo .env (no hace falta tocar el código).
FRONTEND_URL = os.getenv('FRONTEND_URL', 'http://192.168.100.32:3000')

# Archivos subidos (vouchers) y su ruta pública
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Autenticación de la API: token firmado con "Authorization: Bearer <token>"
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'certificates.tokens.BearerTokenAuthentication',
    ],
}

# ==========================================================
# PAGO DEL CERTIFICADO
# ==========================================================

# Costo de cada certificado de curso, en soles. Se cambia en .env con PRECIO_CERTIFICADO=20.00
PRECIO_CERTIFICADO = Decimal(os.getenv('PRECIO_CERTIFICADO', '20.00'))

# Datos de pago en Interbank que se imprimen en la orden de pago del certificado.
INTERBANK_CODIGO_EMPRESA = os.getenv('INTERBANK_CODIGO_EMPRESA', '139')
# PROVISIONAL: es el código del servicio de matrícula. Confirmar con el INDI el de certificados
# y cambiarlo en .env con INTERBANK_CODIGO_SERVICIO_CERTIFICADO=XX
INTERBANK_CODIGO_SERVICIO_CERTIFICADO = os.getenv('INTERBANK_CODIGO_SERVICIO_CERTIFICADO', '02')

# Archivos privados (vouchers de pago): no tienen dirección pública. Solo se entregan a través
# de la API, comprobando permisos.
PRIVATE_MEDIA_ROOT = BASE_DIR / 'private_media'

# ==========================================================
# PLAZO DE ENTREGA DEL CERTIFICADO
# ==========================================================

# Días hábiles (lunes a viernes) que tiene el INDI, desde que el estudiante envía su voucher,
# para entregar el certificado. Se cambia en .env con PLAZO_ENTREGA_DIAS_HABILES=4

PLAZO_ENTREGA_DIAS_HABILES = int(os.getenv('PLAZO_ENTREGA_DIAS_HABILES', '4'))

# Acta de notas: días que tiene el docente, desde la fecha de culminación del curso, para entregar el acta.
PLAZO_ACTA_DIAS = int(os.getenv('PLAZO_ACTA_DIAS', '7'))
# True = no se emiten certificados de cursos cuya acta no esté firmada por la Dirección del INDI.
# Déjalo en False mientras haya cursos antiguos sin acta; actívalo cuando todo el flujo esté en uso.
ACTA_OBLIGATORIA_PARA_CERTIFICADO = os.getenv('ACTA_OBLIGATORIA_PARA_CERTIFICADO', 'False').strip().lower() == 'true'

# True = al pagar el certificado el estudiante debe subir también su solicitud completada (modelo del INDI).
SOLICITUD_FIRMADA_OBLIGATORIA = os.getenv('SOLICITUD_FIRMADA_OBLIGATORIA', 'True').strip().lower() == 'true'

# Feriados que no cuentan como días hábiles, separados por comas, en .env:
# FERIADOS=2026-12-08,2026-12-09,2026-12-25
FERIADOS = [d.strip() for d in os.getenv('FERIADOS', '').split(',') if d.strip()]
