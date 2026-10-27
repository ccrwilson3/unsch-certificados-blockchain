from django.contrib import admin
from .models import User, Certificate, CertificateRequest, AuditLog

@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('username', 'email', 'role', 'dni', 'escuela_profesional', 'is_staff')
    list_filter = ('role', 'is_staff')
    search_fields = ('username', 'email', 'dni')

@admin.register(Certificate)
class CertificateAdmin(admin.ModelAdmin):
    list_display = ('certificate_code', 'student', 'language', 'level', 'status', 'issued_at')
    list_filter = ('status', 'language', 'level')
    search_fields = ('certificate_code', 'certificate_hash', 'student__username', 'student__dni')

@admin.register(CertificateRequest)
class CertificateRequestAdmin(admin.ModelAdmin):
    list_display = ('student', 'language', 'level', 'status', 'created_at')
    list_filter = ('status', 'language', 'level')
    search_fields = ('student__username', 'student__dni')

@admin.register(AuditLog)
class AuditLogAdmin(admin.ModelAdmin):
    list_display = ('timestamp', 'action', 'performed_by', 'certificate')
    list_filter = ('timestamp', 'action')
    search_fields = ('action', 'details', 'performed_by__username')