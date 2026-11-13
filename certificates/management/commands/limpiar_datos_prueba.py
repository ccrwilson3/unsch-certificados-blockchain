"""
Herramienta de limpieza de datos de prueba.

Ubicación: certificates/management/commands/limpiar_datos_prueba.py
(y deben existir los archivos vacíos management/__init__.py y management/commands/__init__.py)

Uso:
    python manage.py limpiar_datos_prueba            -> SOLO INFORMA, no cambia nada
    python manage.py limpiar_datos_prueba --aplicar  -> hace copia de seguridad y limpia

Nunca toca: usuarios, cursos, matrículas, evaluaciones, notas, ni solicitudes del proceso actual.
"""
import shutil
from datetime import datetime

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from certificates.models import AuditLog, Certificate, CertificateRequest

Estado = CertificateRequest.RequestStatus


def tiene_registro_real(certificado):
    """Un tx hash real de blockchain mide 66 caracteres (0x + 64 hex)."""
    tx = (certificado.blockchain_tx_hash or '').strip()
    return len(tx) == 66 and tx.startswith('0x')


def codigo_esperado(solicitud):
    return f"INDI-2026-{str(solicitud.language)[:3].upper()}-{solicitud.id:06d}"


def hacer_copia_de_seguridad():
    """Copia el archivo SQLite a la carpeta backups/. Devuelve la ruta o lanza error."""
    db = settings.DATABASES['default']
    if 'sqlite' not in db['ENGINE']:
        raise CommandError("La copia automática solo está preparada para SQLite.")
    origen = settings.BASE_DIR / str(db['NAME'])
    if not origen.exists():
        raise CommandError(f"No se encontró la base de datos en {origen}")
    carpeta = settings.BASE_DIR / 'backups'
    carpeta.mkdir(exist_ok=True)
    destino = carpeta / f"unsch_cert_db_{datetime.now():%Y%m%d_%H%M%S}.bak"
    shutil.copy2(origen, destino)
    if not destino.exists() or destino.stat().st_size != origen.stat().st_size:
        raise CommandError("La copia de seguridad no quedó completa. No se cambió nada.")
    return destino


def comprobar_cadena(certificado):
    """True/False si la blockchain actual reconoce el hash; None si no se pudo consultar."""
    try:
        from certificates.blockchain import consultar_certificado_blockchain
        r = consultar_certificado_blockchain(certificado.certificate_hash)
    except Exception:
        return None
    estado = r.get('estado')
    if estado == 'ERROR_CONSULTA':
        return None
    return estado != 'NO ENCONTRADO'


class Command(BaseCommand):
    help = "Informa (y con --aplicar, limpia) los datos de prueba antiguos."

    def add_arguments(self, parser):
        parser.add_argument('--aplicar', action='store_true',
                            help='Ejecuta la limpieza (por defecto solo informa).')

    def handle(self, *args, **opts):
        aplicar = opts['aplicar']
        out = self.stdout

        # ---- Qué se detecta ----
        sin_curso = CertificateRequest.objects.filter(curso__isnull=True)
        pendientes_viejas = sin_curso.filter(status=Estado.PENDING)
        rechazadas_viejas = sin_curso.filter(status=Estado.REJECTED)

        certs_falsos = [c for c in Certificate.objects.all() if not tiene_registro_real(c)]
        codigos_falsos = {c.certificate_code for c in certs_falsos}

        aprobadas_falsas = []
        for s in CertificateRequest.objects.filter(status=Estado.APPROVED):
            if codigo_esperado(s) in codigos_falsos or not Certificate.objects.filter(
                    certificate_code=codigo_esperado(s)).exists():
                aprobadas_falsas.append(s)

        convertibles = CertificateRequest.objects.filter(curso__isnull=False, status=Estado.PENDING)

        # Certificados con hash real que la cadena actual no reconoce (solo aviso)
        avisos = []
        for c in Certificate.objects.all():
            if tiene_registro_real(c) and comprobar_cadena(c) is False:
                avisos.append(c)

        total = CertificateRequest.objects.count()
        out.write(self.style.MIGRATE_HEADING("\n== INFORME DE DATOS DE PRUEBA =="))
        out.write(f"Solicitudes totales:                              {total}")
        out.write(f"Pendientes antiguas (sin curso)  -> se borran:    {pendientes_viejas.count()}")
        out.write(f"Rechazadas antiguas (sin curso)  -> se borran:    {rechazadas_viejas.count()}")
        out.write(f"Aprobadas sin registro real      -> se borran:    {len(aprobadas_falsas)}")
        out.write(f"Certificados sin registro real   -> se borran:    {len(certs_falsos)}")
        out.write(f"Pendientes con curso -> pasan a 'Esperando pago': {convertibles.count()}")
        if avisos:
            out.write(self.style.WARNING(
                f"\nAVISO: {len(avisos)} certificado(s) con hash real no son reconocidos por la "
                f"blockchain actual (¿reiniciaste Ganache?). NO se tocan:"))
            for c in avisos:
                out.write(f"   - {c.certificate_code}")
        out.write("Usuarios, cursos, matrículas y notas: NO se tocan.\n")

        if not aplicar:
            out.write(self.style.SUCCESS(
                "Modo informe: no se cambió nada. Si el informe es correcto, ejecuta con --aplicar."))
            return

        # ---- Copia de seguridad: si falla, se aborta ----
        destino = hacer_copia_de_seguridad()
        out.write(self.style.SUCCESS(f"Copia de seguridad creada: {destino}"))

        vouchers = []
        with transaction.atomic():
            eliminar_ids = set(pendientes_viejas.values_list('id', flat=True))
            eliminar_ids |= set(rechazadas_viejas.values_list('id', flat=True))
            eliminar_ids |= {s.id for s in aprobadas_falsas}

            for s in CertificateRequest.objects.filter(id__in=eliminar_ids):
                if s.voucher_pago:
                    vouchers.append(s.voucher_pago)

            n_sol = CertificateRequest.objects.filter(id__in=eliminar_ids).delete()[0]
            n_cert = Certificate.objects.filter(
                id__in=[c.id for c in certs_falsos]).delete()[0]

            n_conv = CertificateRequest.objects.filter(
                curso__isnull=False, status=Estado.PENDING
            ).update(status=Estado.AWAITING_PAYMENT, monto=settings.PRECIO_CERTIFICADO)

            AuditLog.objects.create(
                action="LIMPIEZA DE DATOS DE PRUEBA",
                performed_by=None,
                details=(f"Solicitudes borradas: {len(eliminar_ids)}; certificados sin registro "
                         f"real borrados: {len(certs_falsos)}; convertidas a 'Esperando pago': {n_conv}. "
                         f"Copia: {destino.name}"),
            )

        # Los archivos se borran solo si la transacción terminó bien
        for v in vouchers:
            try:
                v.delete(save=False)
            except Exception:
                pass

        out.write(self.style.SUCCESS(
            f"\nLimpieza terminada. Registros eliminados (incluye relacionados): "
            f"{n_sol} de solicitudes, {n_cert} de certificados. Convertidas: {n_conv}."))
        out.write(f"Si algo sale mal, restaura copiando {destino} sobre unsch_cert_db (con el servidor apagado).")