from django.urls import path
from . import views
from .views import login_view  # <-- Asegúrate de importarlo aquí

urlpatterns = [
    # Ruta para la descarga del certificado PDF
    path('certificado/<str:certificate_code>/revocar/', views.revocar_certificado, name='revocar-certificado'),
    path('certificado/<str:certificate_code>/descargar/', views.descargar_certificado_pdf, name='descargar_certificado_pdf'),

    # Ruta pública de verificación (RF 11, RF 12, RF 13)
    path('verificar/<str:certificate_code>/', views.verificar_certificado_publico, name='verificar_certificado_publico'),

    # Endpoints para Solicitudes (Estudiante e INDI)
    path('solicitudes/', views.gestionar_solicitudes_estudiante, name='api_solicitudes_estudiante'),
    path('solicitudes/<int:request_id>/aprobar/', views.aprobar_solicitud_certificado_api, name='api_aprobar_solicitud'),

    # Auditoría
    path('admin/auditoria/logs/', views.consultar_logs_auditoria, name='consultar_logs_auditoria'),

    # Login unificado
    path('login/', login_view, name='api_login'),
]
