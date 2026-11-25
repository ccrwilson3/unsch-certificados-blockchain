from django.urls import path
from . import views, actas_api
from .views import login_view

urlpatterns = [
    # Certificados: revocación y descarga del PDF
    path('certificado/<str:certificate_code>/revocar/', views.revocar_certificado, name='revocar-certificado'),
    path('certificado/<str:certificate_code>/descargar/', views.descargar_certificado_pdf, name='descargar_certificado_pdf'),

    # Ruta pública de verificación
    path('verificar/<str:certificate_code>/', views.verificar_certificado_publico, name='verificar_certificado_publico'),

    # Endpoints para Solicitudes
    path('solicitudes/', views.gestionar_solicitudes_estudiante, name='api_solicitudes_estudiante'),
    path('solicitudes/<int:request_id>/aprobar/', views.aprobar_solicitud_certificado_api, name='api_aprobar_solicitud'),
    path('solicitudes/<int:request_id>/rectificar/', views.rectificar_solicitud_api, name='rectificar_solicitud_api'),
    path('solicitudes/<int:request_id>/orden-pago/', views.orden_pago_certificado_pdf, name='orden_pago_certificado_pdf'),
    path('solicitudes/<int:request_id>/pago/', views.subir_pago_certificado_api, name='subir_pago_certificado_api'),
    path('solicitudes/<int:request_id>/formato-solicitud/', views.formato_solicitud_certificado_pdf, name='formato_solicitud_certificado_pdf'),
    path('solicitudes/<int:request_id>/documento/', views.ver_solicitud_certificado_api, name='ver_solicitud_certificado_api'),
    path('solicitudes/<int:request_id>/cancelar/', views.cancelar_solicitud_certificado_api, name='cancelar_solicitud_certificado_api'),
    path('solicitudes/<int:request_id>/voucher/', views.ver_voucher_certificado_api, name='ver_voucher_certificado_api'),
    path('solicitudes/<int:request_id>/revisar-pago/', views.revisar_pago_certificado_api, name='revisar_pago_certificado_api'),
    path('solicitudes/<int:request_id>/reenviar-correo/', views.reenviar_correo_certificado_api, name='reenviar_correo_certificado_api'),
    path('mi-correo/', views.mi_correo_api, name='mi_correo_api'),

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
    path('cursos/<int:curso_id>/', views.editar_curso_api, name='editar_curso_api'),
    path('docente/cursos/', views.cursos_del_docente_api, name='cursos_del_docente_api'),
    path('matriculas/', views.gestionar_matriculas_api, name='gestionar_matriculas_api'),
    path('matriculas/<int:matricula_id>/aprobar/', views.aprobar_matricula_api, name='aprobar_matricula_api'),
    path('matriculas/<int:solicitud_id>/cancelar/', views.cancelar_matricula_api, name='cancelar_matricula_api'),
    path('matriculas/<int:solicitud_id>/ampliar/', views.ampliar_reserva_api, name='ampliar_reserva_api'),
    path('cursos/<int:curso_id>/asistencia/', views.asistencia_curso_api, name='asistencia_curso_api'),
    path('cursos/<int:curso_id>/asistencia/excel/', views.exportar_asistencia_excel_api, name='exportar_asistencia_excel_api'),
    path('mi-asistencia/', views.mi_asistencia_api, name='mi_asistencia_api'),
    # Acta de notas (firma electrónica del docente y de la Dirección del INDI)
    path('actas/', actas_api.actas_lista_api, name='actas_lista_api'),
    path('cursos/<int:curso_id>/acta/', actas_api.acta_curso_api, name='acta_curso_api'),
    path('cursos/<int:curso_id>/acta/accion/', actas_api.acta_accion_api, name='acta_accion_api'),
    path('cursos/<int:curso_id>/acta/pdf/', actas_api.acta_pdf_api, name='acta_pdf_api'),
    path('reportes/resumen/', views.reporte_resumen_api, name='reporte_resumen_api'),
    path('reportes/ingresos/excel/', views.reporte_ingresos_excel_api, name='reporte_ingresos_excel_api'),
    path('reportes/matriculados/excel/', views.reporte_matriculados_excel_api, name='reporte_matriculados_excel_api'),
    path('cursos/<int:curso_id>/evaluaciones/', views.gestionar_evaluaciones_y_notas_api, name='gestionar_evaluaciones_y_notas_api'),
    path('cursos/<int:curso_id>/notas/', views.gestionar_notas_curso_api, name='gestionar_notas_curso_api'),
    path('estudiante/notas/', views.notas_del_estudiante_api, name='notas_del_estudiante_api'),
    path('docentes/', views.listar_docentes_por_idioma, name='listar_docentes_por_idioma'),

    path('auth/registro-orden-pago/', views.registrarse_y_generar_orden, name='registrarse_y_generar_orden'),
    path('auth/subir-voucher/', views.subir_voucher_matricula, name='subir_voucher_matricula'),
    path('solicitudes/<int:solicitud_id>/pdf/', views.descargar_orden_pago_pdf, name='descargar_orden_pago_pdf'),
    path('matriculas/<int:solicitud_id>/voucher/', views.ver_voucher_matricula_api, name='ver_voucher_matricula_api'),
    path('perfil/', views.mi_perfil_api, name='mi_perfil_api'),
    path('perfil/password/', views.cambiar_password_api, name='cambiar_password_api'),
    path('password/olvide/', views.olvide_password_api, name='olvide_password_api'),
    path('password/restablecer/', views.restablecer_password_api, name='restablecer_password_api'),

    # Materiales de clase
    path('cursos/<int:curso_id>/materiales/', views.materiales_curso_api, name='materiales_curso_api'),
    path('materiales/<int:material_id>/', views.eliminar_material_api, name='eliminar_material_api'),
    path('materiales/<int:material_id>/archivo/', views.archivo_material_api, name='archivo_material_api'),
    path('estudiante/materiales/', views.materiales_del_estudiante_api, name='materiales_del_estudiante_api'),
]
