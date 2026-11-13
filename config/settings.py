"""
Django settings for config project.

Los valores sensibles (SECRET_KEY, DEBUG, hosts permitidos) se leen del archivo .env
de la raíz del proyecto. Ese archivo NO se sube a git.
"""

import os
from decimal import Decimal
from pathlib import Path

from dotenv import load_dotenv

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# Cargar las variables del archivo .env (junto a manage.py)
load_dotenv(BASE_DIR / '.env')


# SECURITY WARNING: keep the secret key used in production secret!
# Se define en .env como DJANGO_SECRET_KEY. El valor de abajo es solo un respaldo para desarrollo.
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'django-insecure-solo-para-desarrollo-local')

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = os.getenv('DJANGO_DEBUG', 'True').strip().lower() == 'true'

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
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'unsch_cert_db',
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

TIME_ZONE = 'UTC'

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
CORS_ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.100.32:3000",
]

CSRF_TRUSTED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://192.168.100.32:3000",
]

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

# Feriados que no cuentan como días hábiles, separados por comas, en .env:
# FERIADOS=2026-12-08,2026-12-09,2026-12-25
FERIADOS = [d.strip() for d in os.getenv('FERIADOS', '').split(',') if d.strip()]