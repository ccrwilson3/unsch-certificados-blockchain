from django.contrib.auth.models import AbstractUser,Group, Permission
from django.db import models

import uuid
import hashlib
from django.conf import settings

class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = 'ADMIN', 'Administrador General'
        INDI_STAFF = 'INDI_STAFF', 'Personal del INDI (Instituto de Idiomas)'
        VERIFIER = 'VERIFIER', 'Verificador / Autoridad de Escuela Profesional'
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

# Solución al conflicto de grupos y permisos
    groups = models.ManyToManyField(
        Group,
        verbose_name=('groups'),
        blank=True,
        help_text=('The groups this user belongs to. A user will get all permissions '
                'granted to each of their groups.'),
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
        return self.role == self.Role.INDI_STAFF or self.role == self.Role.ADMIN

    def is_verifier(self):
        return self.role == self.Role.VERIFIER or self.role == self.Role.ADMIN

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

    # Identificación única
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    certificate_code = models.CharField(max_length=50, unique=True) # Ej: INDI-2026-ING-0001
    
    # Relaciones académicas
    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='certificates')
    language = models.CharField(max_length=20, choices=Language.choices)
    level = models.CharField(max_length=20, choices=Level.choices)
    
    # Trazabilidad local
    issued_at = models.DateTimeField(auto_now_add=True)
    issued_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name='issued_certificates')
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.ISSUED)

    # RF 24: Campos de soporte para la Revocación
    revocation_reason = models.TextField(blank=True, null=True, help_text="Motivo de la revocación en caso de anulación")
    revoked_at = models.DateTimeField(blank=True, null=True, help_text="Fecha y hora de la revocación")
    
    # Campos de integración Blockchain
    certificate_hash = models.CharField(max_length=66, unique=True, help_text="Hash SHA-256 (bytes32) registrado en Blockchain")
    blockchain_tx_hash = models.CharField(max_length=66, blank=True, null=True, help_text="Hash de la transacción en la Blockchain")

    def generate_hash(self):
        """
        RF 21: Calcula la huella digital criptográfica (SHA-256) combinando 
        los datos inalterables y clave del certificado académico.
        """
        identificador = getattr(self.student, 'dni', None) or self.student.username
        payload = f"{self.certificate_code}:{identificador}:{self.language}:{self.level}:{self.issued_at.isoformat()}"
        return "0x" + hashlib.sha256(payload.encode('utf-8')).hexdigest()

    def __str__(self):
        return f"Certificado {self.certificate_code} - {self.student.get_full_name() or self.student.username}"

# Agregar a certificates/models.py

class CertificateRequest(models.Model):
    class RequestStatus(models.TextChoices):
        PENDING = 'PENDING', 'Pendiente'
        APPROVED = 'APPROVED', 'Aprobada'
        REJECTED = 'REJECTED', 'Rechazada'

    student = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='certificate_requests')
    language = models.CharField(max_length=20, choices=Certificate.Language.choices)
    level = models.CharField(max_length=20, choices=Certificate.Level.choices)
    status = models.CharField(max_length=15, choices=RequestStatus.choices, default=RequestStatus.PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='reviewed_requests')
    review_comments = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"Solicitud de {self.student.username} - {self.get_language_display()} ({self.get_level_display()})"

# Agregar a certificates/models.py

class AuditLog(models.Model):
    action = models.CharField(max_length=100, verbose_name="Acción Realizada")
    performed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, verbose_name="Usuario")
    certificate = models.ForeignKey(Certificate, on_delete=models.SET_NULL, null=True, blank=True, related_name='logs', verbose_name="Certificado Afectado")
    timestamp = models.DateTimeField(auto_now_add=True, verbose_name="Fecha y Hora")
    details = models.TextField(blank=True, null=True, verbose_name="Detalles de la Acción")

    def __str__(self):
        user_str = self.performed_by.username if self.performed_by else "Sistema"
        return f"[{self.timestamp.strftime('%d/%m/%Y %H:%M')}] {user_str} - {self.action}"

