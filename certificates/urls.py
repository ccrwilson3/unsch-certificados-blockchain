from django.urls import path
from . import views
from .views import login_view

urlpatterns = [
    # Ruta para la descarga del certificado PDF
    path('certificado/<str:certificate_code>/revocar/', views.revocar_certificado, name='revocar-certificado'),
    path('certificado/<str:certificate_code>/descargar/', views.descargar_certificado_pdf, name='descargar_certificado_pdf'),

    # Ruta pública de verificación
    path('verificar/<str:certificate_code>/', views.verificar_certificado_publico, name='verificar_certificado_publico'),

    # Endpoints para Solicitudes
    path('solicitudes/', views.gestionar_solicitudes_estudiante, name='api_solicitudes_estudiante'),
    path('solicitudes/<int:request_id>/aprobar/', views.aprobar_solicitud_certificado_api, name='api_aprobar_solicitud'),
    path('solicitudes/<int:request_id>/rectificar/', views.rectificar_solicitud_api, name='rectificar_solicitud_api'),

    # Auditoría
    path('admin/auditoria/logs/', views.consultar_logs_auditoria, name='consultar_logs_auditoria'),

    # Gestión de usuarios
    path('usuarios/', views.gestionar_usuarios_api, name='gestionar_usuarios_api'),
    path('usuarios/<int:user_id>/toggle/', views.toggle_estado_usuario_api, name='toggle_estado_usuario'),
    path('usuarios/<int:user_id>/reset-password/', views.resetear_password_api, name='resetear_password'),

    path('verificar-pdf/', views.verificar_certificado_pdf_api, name='verificar_certificado_pdf_api'),
    
    # Login unificado
    path('login/', login_view, name='api_login'),

    # Rutas Académicas unificadas (Cursos, Matrículas y Evaluaciones)
    path('cursos/', views.gestionar_cursos_api, name='gestionar_cursos_api'),
    path('matriculas/', views.gestionar_matriculas_api, name='gestionar_matriculas_api'),
    path('matriculas/<int:matricula_id>/aprobar/', views.aprobar_matricula_api, name='aprobar_matricula_api'),
    path('cursos/<int:curso_id>/evaluaciones/', views.gestionar_evaluaciones_y_notas_api, name='gestionar_evaluaciones_y_notas_api'),
    path('docentes/', views.listar_docentes_por_idioma, name='listar_docentes_por_idioma'),
    
    path('auth/registro-orden-pago/', views.registrarse_y_generar_orden, name='registrarse_y_generar_orden'),
    path('auth/subir-voucher/', views.subir_voucher_matricula, name='subir_voucher_matricula'),
    path('solicitudes/<int:solicitud_id>/pdf/', views.descargar_orden_pago_pdf, name='descargar_orden_pago_pdf'),
]