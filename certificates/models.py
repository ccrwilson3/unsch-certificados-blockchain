from django.contrib.auth.models import AbstractUser, Group, Permission
from django.core.files.storage import FileSystemStorage
from django.db import models

import uuid
import hashlib
from django.conf import settings


def almacenamiento_privado():
    """
    Almacenamiento para archivos que NO deben tener una dirección pública (por ejemplo los
    vouchers de pago). Solo se entregan a través de la API, comprobando permisos.
    """
    return FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT)


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Administrador General'
        INDI = 'INDI', 'Personal del INDI (Instituto de Idiomas)'
        DOCENTE = 'DOCENTE', 'Docente / Profesor'
        GRADOS_TITULOS = 'GRADOS_TITULOS', 'Grados y Títulos / Autoridad'
        STUDENT = 'STUDENT', 'Estudiante'

    role = models.CharField(
        max_length=20,
        choices=Role.choices,
        default=Role.STUDENT,
        help_text="Rol asignado dentro del sistema académico de la UNSCH"
    )
    dni = models.CharField(max_length=8, unique=True, null=True, blank=True)
    escuela_profesional = models.CharField(
        max_length=150, 
        blank=True, 
        null=True,
        help_text="Ejemplo: Ingeniería de Sistemas, Derecho, Enfermería, etc."
    )
    correo_institucional = models.EmailField(unique=True, null=True, blank=True, help_text="Correo generado automáticamente para el estudiante o docente")

    # Solución al conflicto de grupos y permisos
    groups = models.ManyToManyField(
        Group,
        verbose_name=('groups'),
        blank=True,
        help_text=('The groups this user belongs to. A user will get all permissions granted to each of their groups.'),
        related_name="certificates_user_set",
        related_query_name="certificates_user",
    )
    user_permissions = models.ManyToManyField(
        Permission,
        verbose_name=('user permissions'),
        blank=True,
        help_text=('Specific permissions for this user.'),
        related_name="certificates_user_set",
        related_query_name="certificates_user",
    )   

    def is_indi_staff(self):
        return self.role in [self.Role.INDI, self.Role.ADMIN]

    def is_teacher(self):
        return self.role == self.Role.DOCENTE or self.role == self.Role.ADMIN

    def is_verifier(self):
        return self.role in [self.Role.GRADOS_TITULOS, self.Role.ADMIN]

# ==========================================
# 📚 NUEVOS MODELOS ACADÉMICOS (Fase 1)
# ==========================================

class SolicitudMatricula(models.Model):
    TIPO_POSTULANTE = [
        ('UNSCH', 'Estudiante UNSCH'),
        ('PUBLICO', 'Público General'),
    ]
    
    ESTADO_SOLICITUD = [
        ('ESPERANDO_PAGO', 'Esperando Pago de Orden'),
        ('PENDIENTE', 'Pendiente de Validación (Voucher Subido)'),
        ('APROBADA', 'Aprobada'),
        ('RECHAZADA', 'Rechazada'),
    ]

    estudiante = models.ForeignKey(User, on_delete=models.CASCADE)
    curso = models.ForeignKey('Curso', on_delete=models.CASCADE) # Asumiendo que ya tienes tu modelo Curso
    tipo_postulante = models.CharField(max_length=10, choices=TIPO_POSTULANTE, default='PUBLICO')
    codigo_universitario = models.CharField(max_length=20, blank=True, null=True) # Opcional si es UNSCH
    estado = models.CharField(max_length=20, choices=ESTADO_SOLICITUD, default='ESPERANDO_PAGO')
    boucher_pago = models.FileField(upload_to='bouchers_matricula/', blank=True, null=True)
    fecha_solicitud = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Matrícula: {self.curso} - {self.estudiante.username} [{self.estado}]"

class Curso(models.Model):
    class Language(models.TextChoices):
        QUECHUA = 'QUECHUA', 'Quechua'
        INGLES = 'INGLES', 'Inglés'
        FRANCES = 'FRANCES', 'Francés'
        PORTUGUES = 'PORTUGUES', 'Portugués'
        ITALIANO = 'ITALIANO', 'Italiano'

    class Level(models.TextChoices):
        BASICO = 'BASICO', 'Básico'
        INTERMEDIO = 'INTERMEDIO', 'Intermedio'
        AVANZADO = 'AVANZADO', 'Avanzado'

    class Modalidad(models.TextChoices):
        PRESENCIAL = 'PRESENCIAL', 'Presencial'
        VIRTUAL = 'VIRTUAL', 'Virtual'

    nombre = models.CharField(max_length=150, help_text="Ej: Inglés Básico - Nivel I")
    language = models.CharField(max_length=20, choices=Language.choices)
    level = models.CharField(max_length=20, choices=Level.choices)
    subnivel = models.CharField(max_length=20, default='Nivel I', help_text="Ej: Nivel I, Nivel II, etc.")
    periodo = models.CharField(max_length=20, default='2026-I', help_text="Período académico, ej: 2026-I")
    
    # 🌟 Nuevos campos solicitados para la modalidad y horario
    modalidad = models.CharField(max_length=20, choices=Modalidad.choices, default='PRESENCIAL')
    horario = models.CharField(max_length=100, blank=True, null=True, help_text="Ej: 08:00 a.m. - 10:00 a.m.")
    
    docente = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        limit_choices_to={'role': 'DOCENTE'},
        related_name='cursos_asignados',
        help_text="Docente responsable del curso"
    )
    
    activo = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.nombre} [{self.modalidad}] ({self.periodo})"

class Matricula(models.Model):
    class MatriculaStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pendiente de Aprobación'
        APPROVED = 'APPROVED', 'Matriculado / Aprobado'
        REJECTED = 'REJECTED', 'Rechazado'

    estudiante = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.CASCADE, 
        limit_choices_to={'role': 'STUDENT'},
        related_name='matriculas'
    )
    curso = models.ForeignKey(Curso, on_delete=models.CASCADE, related_name='matriculados')
    status = models.CharField(max_length=20, choices=MatriculaStatus.choices, default=MatriculaStatus.PENDING)
    
    # Datos de respaldo o voucher (si el INDI lo requiere)
    voucher_pago = models.CharField(max_length=100, blank=True, null=True, help_text="Número de operación del voucher de pago")
    fecha_matricula = models.DateTimeField(auto_now_add=True)
    aprobado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL, 
        on_delete=models.SET_NULL, 
        null=True, 
        blank=True, 
        related_name='matriculas_aprobadas'
    )

    class Meta:
        unique_together = ('estudiante', 'curso') # Evita doble matrícula en el mismo curso

    def __str__(self):
        return f"Matrícula de {self.estudiante.username} en {self.curso.nombre} [{self.get_status_display()}]"


class Evaluacion(models.Model):
    curso = models.ForeignKey(Curso, on_delete=models.CASCADE, related_name='evaluaciones')
    titulo = models.CharField(max_length=100, help_text="Ej: Examen Parcial, Examen Final, Práctica Calificada")
    peso_porcentaje = models.DecimalField(max_digits=5, decimal_places=2, help_text="Peso en porcentaje (ej: 30.00 para 30%)")
    fecha_evaluacion = models.DateField(null=True, blank=True)

    def __str__(self):
        return f"{self.titulo} ({self.peso_porcentaje}%) - {self.curso.nombre}"


class Calificacion(models.Model):
    evaluacion = models.ForeignKey(Evaluacion, on_delete=models.CASCADE, related_name='calificaciones')
    estudiante = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='calificaciones')
    nota = models.DecimalField(max_digits=5, decimal_places=2, default=0.00, help_text="Nota de 0 a 20")
    observacion = models.TextField(blank=True, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('evaluacion', 'estudiante')

    def __str__(self):
        return f"Nota: {self.nota} - {self.estudiante.username} ({self.evaluacion.titulo})"

# ==========================================
# TUS MODELOS EXISTENTES (Certificados y Auditoría)
# ==========================================

class Certificate(models.Model):
    class Status(models.TextChoices):
        ISSUED = 'ISSUED', 'Válido / Emitido'
        OBSERVED = 'OBSERVED', 'Con Observaciones' 
        REVOKED = 'REVOKED', 'Revocado'

    class Language(models.TextChoices):
        QUECHUA = 'QUECHUA', 'Quechua'
        INGLES = 'INGLES', 'Inglés'
        FRANCES = 'FRANCES', 'Francés'
        PORTUGUES = 'PORTUGUES', 'Portugués'
        ITALIANO = 'ITALIANO', 'Italiano'

    class Level(models.TextChoices):
        BASICO = 'BASICO', 'Básico'
        INTERMEDIO = 'INTERMEDIO', 'Intermedio'
        AVANZADO = 'AVANZADO', 'Avanzado'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    certificate_code = models.CharField(max_length=50, unique=True)
    
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='certificates')
    language = models.CharField(max_length=20, choices=Language.choices)
    level = models.CharField(max_length=20, choices=Level.choices)
    subnivel = models.CharField(max_length=20, default='Nivel I', blank=True, null=True)
    anio = models.CharField(max_length=10, default='2026', blank=True, null=True)
    
    issued_at = models.DateTimeField(auto_now_add=True)
    issued_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='issued_certificates')
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.ISSUED)

    revocation_reason = models.TextField(blank=True, null=True)
    revoked_at = models.DateTimeField(blank=True, null=True)
    
    certificate_hash = models.CharField(max_length=66, unique=True)
    blockchain_tx_hash = models.CharField(max_length=66, blank=True, null=True)

    def generate_hash(self):
        identificador = getattr(self.student, 'dni', None) or self.student.username
        payload = f"{self.certificate_code}:{identificador}:{self.language}:{self.level}:{self.issued_at.isoformat()}"
        return "0x" + hashlib.sha256(payload.encode('utf-8')).hexdigest()

    def __str__(self):
        return f"Certificado {self.certificate_code} - {self.student.get_full_name() or self.student.username}"


class CertificateRequest(models.Model):
    class RequestStatus(models.TextChoices):
        # Etapas del trámite, en orden
        AWAITING_PAYMENT = 'AWAITING_PAYMENT', 'Esperando pago'
        PAYMENT_REVIEW = 'PAYMENT_REVIEW', 'Pago en revisión'
        PAYMENT_OBSERVED = 'PAYMENT_OBSERVED', 'Pago observado'
        IN_PROCESS = 'IN_PROCESS', 'En trámite'
        APPROVED = 'APPROVED', 'Certificado emitido'
        # Rechazada por el INDI
        REJECTED = 'REJECTED', 'Rechazada'
        # Solicitudes creadas antes del proceso de pago
        PENDING = 'PENDING', 'Pendiente (solicitud anterior)'

    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='certificate_requests')
    language = models.CharField(max_length=20, choices=Certificate.Language.choices)
    level = models.CharField(max_length=20, choices=Certificate.Level.choices)
    
    subnivel = models.CharField(max_length=20, default='Nivel I', blank=True, null=True)
    anio = models.CharField(max_length=10, default='2026', blank=True, null=True)

    status = models.CharField(max_length=20, choices=RequestStatus.choices, default=RequestStatus.AWAITING_PAYMENT)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_requests')
    review_comments = models.TextField(blank=True, null=True)
    curso = models.ForeignKey(
        'Curso',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='solicitudes_certificado',
        help_text="Curso aprobado en el que se basa la solicitud",
    )

    # ---- Pago del certificado ----
    monto = models.DecimalField(max_digits=8, decimal_places=2, default=0, help_text="Monto a pagar en soles")
    voucher_pago = models.FileField(
        storage=almacenamiento_privado,
        upload_to='vouchers_certificados/',
        blank=True,
        null=True,
        help_text="Voucher de Interbank (archivo privado, sin dirección pública)",
    )
    numero_operacion = models.CharField(max_length=30, blank=True, default='', help_text="Número de operación del voucher")
    pago_enviado_en = models.DateTimeField(null=True, blank=True)
    pago_validado = models.BooleanField(default=False)
    pago_revisado_por = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='pagos_certificado_revisados',
    )
    pago_revisado_en = models.DateTimeField(null=True, blank=True)
    comentarios_pago = models.TextField(blank=True, null=True, help_text="Motivo de la observación del pago")
    certificado_enviado_en = models.DateTimeField(
        null=True, blank=True, help_text="Cuándo se envió el certificado por correo al estudiante"
    )

    def __str__(self):
        return f"Solicitud de {self.student.username} - {self.get_language_display()} ({self.get_level_display()} - {self.subnivel})"


class AuditLog(models.Model):
    action = models.CharField(max_length=100, verbose_name="Acción Realizada")
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, verbose_name="Usuario")
    certificate = models.ForeignKey(Certificate, on_delete=models.SET_NULL, null=True, blank=True, related_name='logs', verbose_name="Certificado Afectado")
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name="Fecha y Hora")
    details = models.TextField(blank=True, null=True, verbose_name="Detalles de la Acción")

    def __str__(self):
        user_str = self.performed_by.username if self.performed_by else "Sistema"
        return f"[{self.timestamp.strftime('%d/%m/%Y %H:%M')}] {user_str} - {self.action}"