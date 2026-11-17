"""
Carga datos de EJEMPLO para presentar el sistema.

Ubicación: certificates/management/commands/cargar_datos_demo.py

Uso:
    python manage.py cargar_datos_demo

Se puede ejecutar varias veces: no duplica nada, solo restablece los datos de ejemplo.
Crea usuarios con DNI ficticios 90000001..90000007 y contraseña 'Demo2026!'.
IMPORTANTE: son solo para demostración. No los uses en producción.
"""
from decimal import Decimal

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction

from certificates.models import (
    Calificacion, CertificateRequest, Curso, Evaluacion, Matricula, User,
)

CLAVE = 'Demo2026!'
Estado = CertificateRequest.RequestStatus

# PNG de 1x1 píxel, sirve como "voucher" de ejemplo
PNG_MINIMO = bytes.fromhex(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489'
    '0000000d49444154789c6360f8cfc000000301010018dd8db00000000049454e44ae426082'
)

USUARIOS = [
    # dni, rol, nombre, apellido, correo
    ('90000001', 'ADMIN', 'Ana', 'Administradora', 'demo.admin@example.com'),
    ('90000002', 'INDI', 'Carlos', 'Quispe (INDI)', 'demo.indi@example.com'),
    ('90000003', 'DOCENTE', 'María', 'Huamán (Docente)', 'demo.docente@example.com'),
    ('90000004', 'GRADOS_TITULOS', 'Luis', 'Ramos (Grados y Títulos)', 'demo.grados@example.com'),
    ('90000005', 'STUDENT', 'Rosa', 'Gutiérrez', 'demo.rosa@example.com'),
    ('90000006', 'STUDENT', 'Pedro', 'Mendoza', 'demo.pedro@example.com'),
    ('90000007', 'STUDENT', 'Lucía', 'Vargas', 'demo.lucia@example.com'),
]

EVALUACIONES = [('Examen Parcial', 30), ('Práctica Calificada', 30), ('Examen Final', 40)]

# dni estudiante -> notas (parcial, práctica, final)
NOTAS = {
    '90000005': (16, 15, 17),   # Rosa: aprobada
    '90000006': (8, 9, 10),     # Pedro: desaprobado (no puede pedir certificado)
    '90000007': (14, 18, 16),   # Lucía: aprobada
}


class Command(BaseCommand):
    help = "Carga usuarios, un curso, notas y trámites de ejemplo para la demostración."

    @transaction.atomic
    def handle(self, *args, **opts):
        usuarios = {}
        for dni, rol, nombre, apellido, correo in USUARIOS:
            u, _ = User.objects.get_or_create(username=dni, defaults={'dni': dni})
            u.dni, u.role, u.first_name, u.last_name, u.email = dni, rol, nombre, apellido, correo
            u.is_active = True
            u.set_password(CLAVE)
            u.save()
            usuarios[dni] = u

        docente = usuarios['90000003']
        indi = usuarios['90000002']

        curso, _ = Curso.objects.get_or_create(
            nombre='Inglés Básico - Nivel I (DEMO)', periodo='2026-I',
            defaults=dict(language='INGLES', level='BASICO', subnivel='Nivel I'),
        )
        curso.docente = docente
        curso.modalidad = 'PRESENCIAL'
        curso.horario = '08:00 a.m. - 10:00 a.m.'
        curso.activo = True
        curso.save()

        evals = []
        for titulo, peso in EVALUACIONES:
            ev, _ = Evaluacion.objects.get_or_create(curso=curso, titulo=titulo,
                                                     defaults={'peso_porcentaje': Decimal(peso)})
            ev.peso_porcentaje = Decimal(peso)
            ev.save()
            evals.append(ev)

        for dni, notas in NOTAS.items():
            est = usuarios[dni]
            Matricula.objects.update_or_create(
                estudiante=est, curso=curso,
                defaults={'status': 'APPROVED', 'aprobado_por': indi, 'voucher_pago': f'DEMO-{dni}'},
            )
            for ev, nota in zip(evals, notas):
                Calificacion.objects.update_or_create(
                    evaluacion=ev, estudiante=est, defaults={'nota': Decimal(nota)})

        # Trámites de certificado en distintas etapas (se reinician en cada ejecución)
        CertificateRequest.objects.filter(student__in=[usuarios['90000005'], usuarios['90000007']],
                                          curso=curso).delete()
        base = dict(curso=curso, language=curso.language, level=curso.level,
                    subnivel=curso.subnivel, anio='2026', monto=settings.PRECIO_CERTIFICADO)

        # Rosa: acaba de pedir el certificado, falta pagar
        CertificateRequest.objects.create(student=usuarios['90000005'],
                                          status=Estado.AWAITING_PAYMENT, **base)

        # Lucía: ya pagó, el INDI debe validar el voucher
        pago = CertificateRequest.objects.create(
            student=usuarios['90000007'], status=Estado.PAYMENT_REVIEW,
            numero_operacion='DEMO-000123', **base)
        pago.voucher_pago.save('voucher_demo.png', ContentFile(PNG_MINIMO), save=False)
        from django.utils import timezone
        pago.pago_enviado_en = timezone.now()
        pago.save()

        self.stdout.write(self.style.SUCCESS("Datos de ejemplo cargados.\n"))
        self.stdout.write(f"Contraseña de todos: {CLAVE}")
        self.stdout.write("  90000001  Administrador")
        self.stdout.write("  90000002  Personal INDI")
        self.stdout.write("  90000003  Docente (curso 'Inglés Básico - Nivel I (DEMO)')")
        self.stdout.write("  90000004  Grados y Títulos")
        self.stdout.write("  90000005  Rosa   - aprobada, certificado pedido, falta pagar")
        self.stdout.write("  90000006  Pedro  - desaprobado (no puede pedir certificado)")
        self.stdout.write("  90000007  Lucía  - aprobada, pagó, el INDI debe validar el voucher")