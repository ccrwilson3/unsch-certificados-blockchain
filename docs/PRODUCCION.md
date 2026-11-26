# Puesta en producción

## Antes de publicar
1. En `.env`: `DJANGO_DEBUG=False`, `DJANGO_SECRET_KEY` nueva (≥40 caracteres; el sistema no arranca sin ella),
   `DJANGO_ALLOWED_HOSTS=tu-dominio`, `CORS_ORIGINS=https://tu-dominio`, `FRONTEND_URL=https://tu-dominio`.
2. HTTPS con nginx (certificado Let's Encrypt) y `CONFIAR_EN_PROXY=True`.
3. PostgreSQL: crear base y usuario, definir `DB_*`, `pip install "psycopg[binary]"`, `python manage.py migrate`.
4. Varios procesos (gunicorn): `DJANGO_CACHE_EN_BD=True` y `python manage.py createcachetable`.
5. Correo real: definir `EMAIL_HOST`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`.
6. Eliminar usuarios de demostración y cambiar contraseñas de las cuentas reales.
7. Blockchain: usar una red definitiva (no Ganache local) y guardar la clave privada solo en `.env`.

## Verificación en dos pasos
Activa `DOBLE_FACTOR_OBLIGATORIO=True` en `.env`: Administrador, INDI y Grados y Títulos deberán configurarla en su próximo ingreso (se cambian los roles con `DOBLE_FACTOR_ROLES`).
Cada persona debe tener su app autenticadora configurada **antes** de la puesta en marcha. Si el único administrador pierde su celular:
`python manage.py reset_2fa <usuario>`

## Permisos por módulo

Al crear un usuario nuevo funciona de inmediato con los módulos de su rol. Antes de entregar el sistema, define con el INDI qué personas necesitan acceso reducido y crea sus plantillas en **Permisos**. Los permisos se comprueban en el servidor en cada petición (no solo se ocultan menús).

Para agregar un módulo nuevo al sistema: añádelo a `MODULOS` y sus rutas a `RUTAS_MODULO` en `certificates/permisos.py`; aparece solo en la pantalla del administrador.

## Respaldos
Diario: `pg_dump unsch_cert > respaldo_$(date +%F).sql` y copia de `private_media/` (vouchers y materiales).
Probar la restauración al menos una vez.

## Comprobación
`python manage.py check --deploy`
