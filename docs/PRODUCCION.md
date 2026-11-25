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

## Respaldos
Diario: `pg_dump unsch_cert > respaldo_$(date +%F).sql` y copia de `private_media/` (vouchers y materiales).
Probar la restauración al menos una vez.

## Comprobación
`python manage.py check --deploy`
