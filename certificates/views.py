import io
import json
import mimetypes
import os
import re
import unicodedata
import hashlib
import threading
import uuid
from datetime import date, datetime, timedelta, timezone as dt_timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.shortcuts import render, get_object_or_404
from django.http import FileResponse, HttpResponse, Http404, JsonResponse
from django.contrib.auth import authenticate, get_user_model
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core import signing
from django.core.cache import cache
from django.core.mail import EmailMultiAlternatives
from django.core.validators import validate_email
from django.utils.html import escape
from django.utils import timezone
from django.db import models, transaction

from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

from .models import (
    Certificate, CertificateRequest, AuditLog, Curso, Matricula,
    Evaluacion, Calificacion, SolicitudMatricula, Material, Asistencia,
)
from .utils import generar_pdf_certificado
from .blockchain import (
    consultar_certificado_blockchain, emitir_hash_blockchain,
    revocar_hash_blockchain, BlockchainError,
)
from .tokens import crear_token

User = get_user_model()


# ==========================================================
# AUTENTICACIÓN Y PERMISOS
# El usuario sale SOLO del token firmado (Authorization: Bearer <token>),
# que reconoce BearerTokenAuthentication (ver certificates/tokens.py).
# Ya no se acepta el DNI como token.
# ==========================================================

ROLES_ESTUDIANTE = ('STUDENT', 'ESTUDIANTE')


def rol_de(user):
    return str(getattr(user, 'role', '') or '').upper()


def es_admin(user):
    return bool(user.is_superuser or rol_de(user) == 'ADMIN')


def es_personal_indi(user):
    return bool(es_admin(user) or rol_de(user) == 'INDI' or user.is_staff)


def es_estudiante(user):
    return rol_de(user) in ROLES_ESTUDIANTE


def usuario_actual(request):
    """Usuario autenticado por token firmado, o None."""
    user = getattr(request, 'user', None)
    if user is not None and user.is_authenticated:
        return user
    return None


def _error(mensaje, codigo):
    # Se envían 'error' y 'message' porque unas páginas leen una clave y otras la otra.
    return Response({"status": "error", "error": mensaje, "message": mensaje}, status=codigo)


def exigir_usuario(request):
    """Devuelve (usuario, None) o (None, respuesta_de_error 401)."""
    user = usuario_actual(request)
    if user is None:
        return None, _error("No autorizado. Inicie sesión nuevamente.", status.HTTP_401_UNAUTHORIZED)
    return user, None


def exigir_admin(request):
    user, error = exigir_usuario(request)
    if error:
        return None, error
    if not es_admin(user):
        return None, _error("Solo el administrador puede realizar esta acción.", status.HTTP_403_FORBIDDEN)
    return user, None


def exigir_personal_indi(request):
    user, error = exigir_usuario(request)
    if error:
        return None, error
    if not es_personal_indi(user):
        return None, _error("No tienes permisos para realizar esta acción.", status.HTTP_403_FORBIDDEN)
    return user, None


# ==========================================================
# AUDITORÍA (RF 14 y RF 15)
# ==========================================================

def registrar_auditoria(user, action, details, certificate=None):
    """
    Deja constancia de una acción en el log de auditoría.
    NUNCA incluir contraseñas ni datos secretos en 'details'.
    Si el registro falla, no se interrumpe la acción que ya se realizó.
    """
    try:
        AuditLog.objects.create(
            action=action,
            performed_by=user,
            certificate=certificate,
            details=details,
        )
    except Exception as e:
        print(f"No se pudo registrar la auditoría ({action}): {e}")


def obtener_nombre_idioma(codigo):
    """Traduce de forma segura las siglas de idioma a su nombre completo."""
    if not codigo:
        return "No especificado"

    mapping = {
        "EN": "Inglés",
        "ENGLISH": "Inglés",
        "FR": "Francés",
        "FRENCH": "Francés",
        "PT": "Portugués",
        "PORTUGUESE": "Portugués",
        "QU": "Quechua",
        "QUECHUA": "Quechua",
        "IT": "Italiano"
    }

    key = str(codigo).strip().upper()
    return mapping.get(key, codigo)  # Si encuentra coincidencia devuelve el nombre, si no, el código original


@api_view(['GET'])
@permission_classes([AllowAny])  # el rol ADMIN se valida dentro
def consultar_logs_auditoria(request):
    """
    RF 15: historial de auditoría y trazabilidad, en JSON. Solo Administrador.
    Parámetro opcional: ?limit=500 (máximo 2000). Devuelve lo más reciente primero.
    """
    actor, error = exigir_admin(request)
    if error:
        return error

    try:
        limite = min(int(request.GET.get('limit', 500)), 2000)
    except ValueError:
        limite = 500

    logs = (
        AuditLog.objects
        .select_related('performed_by', 'certificate')
        .order_by('-timestamp')[:limite]
    )

    data = []
    for log in logs:
        autor = log.performed_by
        data.append({
            "id": log.id,
            "action": log.action,
            "performed_by": (autor.get_full_name() or autor.username) if autor else "Sistema",
            "performed_by_username": autor.username if autor else "",
            "performed_by_role": rol_de(autor) if autor else "",
            "certificate_code": log.certificate.certificate_code if log.certificate else None,
            "timestamp": log.timestamp.isoformat(),
            "details": log.details or "",
        })

    return Response(data, status=status.HTTP_200_OK)


# ==========================================================
# VERIFICACIÓN PÚBLICA DE CERTIFICADOS
# ==========================================================

@api_view(['POST'])
@permission_classes([AllowAny])
def verificar_certificado_pdf_api(request):
    """
    Permite verificar la autenticidad de un certificado subiendo el archivo PDF.
    Utiliza múltiples estrategias de búsqueda (Hash, Código en nombre, y Patrón numérico).
    (Pendiente: esta verificación se rediseña en una fase posterior.)
    """
    if 'pdf_file' not in request.FILES:
        return Response({"existe": False, "mensaje": "No se ha adjuntado ningún archivo PDF."}, status=status.HTTP_400_BAD_REQUEST)

    pdf_file = request.FILES['pdf_file']
    filename = pdf_file.name
    print(f"📁 [VERIFICAR PDF] Analizando archivo: {filename}, tamaño: {pdf_file.size} bytes")

    try:
        file_bytes = pdf_file.read()
        uploaded_hash = hashlib.sha256(file_bytes).hexdigest()

        certificate = None
        solicitud = None

        # ESTRATEGIA 1: Buscar por hash exacto en la tabla Certificate
        certificate = Certificate.objects.filter(certificate_hash=uploaded_hash).first()

        # ESTRATEGIA 2: Extraer el código único del nombre del archivo
        if not certificate:
            match_code = re.search(r'INDI-\d{4}-[A-Z]{2,4}-\d+', filename, re.IGNORECASE)
            if match_code:
                extracted_code = match_code.group(0).upper()
                print(f"🔍 Código exacto extraído del nombre: {extracted_code}")
                certificate = Certificate.objects.filter(certificate_code=extracted_code).first()
                if not certificate:
                    match_id = re.search(r'\d+$', extracted_code)
                    if match_id:
                        sol_id = int(match_id.group())
                        solicitud = CertificateRequest.objects.filter(id=sol_id, status__in=['APPROVED', 'APROBADO']).first()

        # ESTRATEGIA 3: Búsqueda por ID numérico suelto en el nombre del archivo
        if not certificate and not solicitud:
            match_num = re.search(r'\d+', filename)
            if match_num:
                possible_id = int(match_num.group())
                print(f"🔍 ID numérico extraído del nombre: {possible_id}")
                certificate = Certificate.objects.filter(certificate_code__icontains=str(possible_id)).first()
                if not certificate:
                    solicitud = CertificateRequest.objects.filter(id=possible_id, status__in=['APPROVED', 'APROBADO']).first()

        # 1. Si encontramos un Certificado oficial
        if certificate is not None:
            raw_lang = getattr(certificate, 'language', 'EN')
            idioma_texto = obtener_nombre_idioma(raw_lang)

            return Response({
                "existe": True,
                "is_valid": certificate.status == Certificate.Status.ISSUED,
                "codigo": certificate.certificate_code,
                "estudiante": certificate.student.get_full_name() or certificate.student.username,
                "dni": getattr(certificate.student, 'dni', certificate.student.username),
                "idioma": idioma_texto,
                "nivel": certificate.get_level_display(),
                "subnivel": getattr(certificate, 'subnivel', 'Nivel I'),
                "anio": getattr(certificate, 'anio', certificate.issued_at.year if certificate.issued_at else '2026'),
                "fecha_emision": certificate.issued_at.isoformat() if certificate.issued_at else None,
                "estado": certificate.get_status_display(),
                "certificate_hash": certificate.certificate_hash,
                "mensaje": "¡PDF verificado con éxito! El documento es auténtico."
            }, status=status.HTTP_200_OK)

        # 2. Si encontramos una Solicitud Aprobada (respaldo institucional)
        if solicitud is not None:
            codigo_generado = f"INDI-2026-{str(solicitud.language)[:3].upper()}-000{solicitud.id}"
            raw_lang_sol = getattr(solicitud, 'language', 'EN')
            idioma_texto_sol = obtener_nombre_idioma(raw_lang_sol)

            return Response({
                "existe": True,
                "is_valid": True,
                "codigo": codigo_generado,
                "estudiante": solicitud.student.get_full_name() or solicitud.student.username,
                "dni": getattr(solicitud.student, 'dni', solicitud.student.username),
                "idioma": idioma_texto_sol,
                "nivel": solicitud.get_level_display(),
                "subnivel": getattr(solicitud, 'subnivel', 'Nivel I'),
                "anio": getattr(solicitud, 'anio', '2026'),
                "fecha_emision": solicitud.created_at.isoformat(),
                "estado": "Aprobado",
                "certificate_hash": uploaded_hash,
                "mensaje": "¡PDF verificado a través de la solicitud aprobada del INDI!"
            }, status=status.HTTP_200_OK)

        return Response({
            "existe": False,
            "mensaje": "El archivo PDF no coincide con ningún registro oficial del INDI o no contiene un código válido."
        }, status=status.HTTP_200_OK)

    except Exception as e:
        print(f"❌ Error procesando PDF: {str(e)}")
        return Response({"existe": False, "mensaje": f"Error al procesar el PDF: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([AllowAny])
def verificar_certificado_publico(request, certificate_code):
    """
    Vista pública accesible sin iniciar sesión (RF 13).
    Busca el certificado por código, DNI o QR y contrasta su estado con la blockchain.
    Ya no se inventan datos: si no existe certificado oficial, se informa que no existe.
    """
    clean_code = certificate_code.strip()

    match_clean = re.search(r'INDI-\d{4}-[A-Z]{2,4}-\d+', clean_code, re.IGNORECASE)
    if match_clean:
        search_code = match_clean.group(0).upper()
        certificate = Certificate.objects.filter(certificate_code__iexact=search_code).first()
    else:
        search_code = re.sub(r'^(REGISTRO|C[OÓ]DIGO|DNI)[:\s]*', '', clean_code, flags=re.IGNORECASE).strip().upper()
        certificate = Certificate.objects.filter(
            models.Q(certificate_code__iexact=search_code) |
            models.Q(student__dni__iexact=search_code) |
            models.Q(student__username__iexact=search_code)
        ).order_by('-issued_at').first()

    if certificate is None:
        contexto = {
            'existe': False,
            'is_valid': False,
            'mensaje': 'El código o DNI ingresado no registra un certificado oficial en el INDI - UNSCH.'
        }
    else:
        # 1. ¿Los datos guardados siguen coincidiendo con el hash registrado?
        hash_integro = (certificate.generate_hash() == certificate.certificate_hash)

        # 2. ¿Qué dice la blockchain de ese hash?
        resultado_cadena = consultar_certificado_blockchain(certificate.certificate_hash)
        estado_blockchain = resultado_cadena['estado']  # VALIDO, REVOCADO, NO ENCONTRADO o ERROR_CONSULTA
        valido_en_blockchain = (estado_blockchain == 'VALIDO')

        # 3. Es válido solo si todo coincide: base de datos, integridad y blockchain
        is_valid = (
            certificate.status == Certificate.Status.ISSUED
            and hash_integro
            and valido_en_blockchain
        )

        idioma_texto = obtener_nombre_idioma(getattr(certificate, 'language', 'EN'))

        contexto = {
            'existe': True,
            'is_valid': is_valid,
            'codigo': certificate.certificate_code,
            'estudiante': certificate.student.get_full_name() or certificate.student.username,
            'dni': getattr(certificate.student, 'dni', None) or 'No registrado',
            'idioma': idioma_texto,
            'nivel': certificate.get_level_display(),
            'subnivel': getattr(certificate, 'subnivel', None) or 'Nivel I',
            'anio': getattr(certificate, 'anio', None) or (certificate.issued_at.year if certificate.issued_at else '2026'),
            'fecha_emision': certificate.issued_at.isoformat() if certificate.issued_at else None,
            'estado': certificate.get_status_display(),
            'status_code': certificate.status,
            'certificate_hash': certificate.certificate_hash,
            'blockchain_tx_hash': certificate.blockchain_tx_hash,
            'hash_integro': hash_integro,
            'valido_en_blockchain': valido_en_blockchain,
            'estado_blockchain': estado_blockchain,
        }

        if certificate.status == Certificate.Status.REVOKED:
            contexto['revocation_reason'] = certificate.revocation_reason
            contexto['revoked_at'] = certificate.revoked_at.isoformat() if certificate.revoked_at else None

    if '/api/' in request.path or request.headers.get('x-requested-with') == 'XMLHttpRequest' or request.GET.get('format') == 'json':
        return JsonResponse(contexto)

    return render(request, 'certificates/verificar.html', contexto)


# ==========================================================
# SOLICITUDES DE CERTIFICADO
# ==========================================================

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def gestionar_solicitudes_estudiante(request):
    """
    Lista y crea solicitudes de certificado.
    - Estudiante: ve y crea solo las suyas. Solo puede pedir el certificado de un curso en el que
      está matriculado y que APROBÓ (promedio final completo mayor o igual a la nota mínima).
    - Personal INDI / Admin: ven todas, con el curso y el promedio en que se basa cada una.
    El idioma, nivel, subnivel y año del certificado salen del curso; no se escriben a mano.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    # ----------------------------------------------------
    # METODO GET: LISTAR SOLICITUDES
    # ----------------------------------------------------
    if request.method == 'GET':
        if es_personal_indi(user):
            base = CertificateRequest.objects.all()
        elif es_estudiante(user):
            base = CertificateRequest.objects.filter(student=user)
        else:
            return _error("No tienes permisos para ver solicitudes.", status.HTTP_403_FORBIDDEN)

        solicitudes = list(base.select_related('student', 'curso').order_by('-created_at'))

        # Diccionario seguro para forzar el nombre completo del idioma
        nombres_idiomas = {
            'EN': 'Inglés',
            'QU': 'Quechua',
            'FR': 'Francés',
            'PT': 'Portugués',
            'INGLES': 'Inglés',
            'QUECHUA': 'Quechua',
            'FRANCES': 'Francés',
            'PORTUGUES': 'Portugués'
        }

        # Códigos reales de certificado: solo para solicitudes aprobadas que tienen su certificado.
        codigos_posibles = {
            s.id: f"INDI-2026-{str(s.language)[:3].upper()}-{s.id:06d}"
            for s in solicitudes
            if s.status == CertificateRequest.RequestStatus.APPROVED
        }
        # {codigo: estado} de los certificados que realmente existen
        certificados_por_codigo = dict(
            Certificate.objects.filter(certificate_code__in=list(codigos_posibles.values()))
            .values_list('certificate_code', 'status')
        )

        # Promedio final del estudiante en el curso de cada solicitud (todo en pocas consultas)
        promedios = {}
        pares = {(s.student_id, s.curso_id) for s in solicitudes if s.curso_id}
        if pares:
            ids_cursos = {curso_id for _, curso_id in pares}
            ids_estudiantes = {est_id for est_id, _ in pares}

            evaluaciones_por_curso = {}
            for ev in Evaluacion.objects.filter(curso_id__in=ids_cursos).order_by('id'):
                evaluaciones_por_curso.setdefault(ev.curso_id, []).append(ev)

            notas_por_par = {}
            for c in Calificacion.objects.filter(
                evaluacion__curso_id__in=ids_cursos, estudiante_id__in=ids_estudiantes
            ).select_related('evaluacion'):
                notas_por_par.setdefault((c.estudiante_id, c.evaluacion.curso_id), {})[c.evaluacion_id] = c.nota

            for est_id, curso_id in pares:
                _, promedio = calcular_resumen_notas(
                    evaluaciones_por_curso.get(curso_id, []),
                    notas_por_par.get((est_id, curso_id), {}),
                )
                promedios[(est_id, curso_id)] = promedio

        data = []
        for s in solicitudes:
            promedio = promedios.get((s.student_id, s.curso_id))
            codigo_real = codigos_posibles.get(s.id)
            limite = fecha_limite_entrega(s)
            data.append({
                "id": s.id,
                "student_name": s.student.get_full_name() or s.student.username,
                "language": nombres_idiomas.get(str(s.language).strip().upper(), s.get_language_display() if hasattr(s, 'get_language_display') else str(s.language)),
                "level": s.get_level_display() if hasattr(s, 'get_level_display') else str(s.level),
                "subnivel": getattr(s, 'subnivel', 'Nivel I'),
                "anio": getattr(s, 'anio', '2026'),
                "status": s.status,
                "review_comments": getattr(s, 'review_comments', ''),  # Motivo de rechazo
                "created_at": s.created_at.isoformat() if hasattr(s.created_at, 'isoformat') else str(s.created_at),
                "curso_id": s.curso_id,
                "curso_nombre": s.curso.nombre if s.curso_id else None,
                "promedio_final": float(promedio) if promedio is not None else None,
                "monto": float(s.monto or 0),
                "numero_operacion": s.numero_operacion or "",
                "tiene_voucher": bool(s.voucher_pago),
                "pago_enviado_en": s.pago_enviado_en.isoformat() if s.pago_enviado_en else None,
                "pago_revisado_en": s.pago_revisado_en.isoformat() if s.pago_revisado_en else None,
                "comentarios_pago": s.comentarios_pago or "",
                "certificado_enviado_en": s.certificado_enviado_en.isoformat() if s.certificado_enviado_en else None,
                "fecha_limite": limite.isoformat() if limite else None,
                "atrasada": bool(limite and hoy_peru() > limite),
                "certificate_code": codigo_real if codigo_real in certificados_por_codigo else None,
                "certificate_status": certificados_por_codigo.get(codigo_real),
            })

        return JsonResponse(data, safe=False)

    # ----------------------------------------------------
    # METODO POST: CREAR NUEVA SOLICITUD (solo estudiantes, de un curso aprobado)
    # ----------------------------------------------------
    if not es_estudiante(user):
        return _error("Solo los estudiantes pueden solicitar certificados.", status.HTTP_403_FORBIDDEN)

    try:
        curso_id = int(request.data.get('curso_id'))
    except (TypeError, ValueError):
        return _error(
            "Debes elegir el curso aprobado del que solicitas el certificado.",
            status.HTTP_400_BAD_REQUEST
        )

    curso = Curso.objects.filter(id=curso_id).first()
    if curso is None or not Matricula.objects.filter(
        estudiante=user, curso=curso, status=Matricula.MatriculaStatus.APPROVED
    ).exists():
        return _error("No estás matriculado en ese curso.", status.HTTP_400_BAD_REQUEST)

    promedio = promedio_del_estudiante_en_curso(user, curso)
    if promedio is None:
        return _error(
            "Todavía no tienes el promedio final de este curso: faltan notas por registrar.",
            status.HTTP_400_BAD_REQUEST
        )
    if promedio < NOTA_MINIMA_APROBATORIA:
        return _error(
            f"No aprobaste este curso (promedio {promedio}; la nota mínima es {NOTA_MINIMA_APROBATORIA}).",
            status.HTTP_400_BAD_REQUEST
        )

    if CertificateRequest.objects.filter(student=user, curso=curso).exclude(
        status=CertificateRequest.RequestStatus.REJECTED
    ).exists():
        return _error(
            "Ya tienes una solicitud de certificado para este curso (pendiente o aprobada).",
            status.HTTP_400_BAD_REQUEST
        )

    solicitud = CertificateRequest.objects.create(
        student=user,
        curso=curso,
        language=normalizar_codigo(curso.language),
        level=normalizar_codigo(curso.level),
        subnivel=curso.subnivel,
        anio=anio_del_periodo(curso.periodo),
        status=CertificateRequest.RequestStatus.AWAITING_PAYMENT,
        monto=settings.PRECIO_CERTIFICADO,
    )

    registrar_auditoria(
        user,
        "SOLICITUD DE CERTIFICADO",
        f"Solicitud #{solicitud.id} del curso '{curso.nombre}' (promedio {promedio})."
    )

    return Response({
        "status": "success",
        "message": "Solicitud creada. Descarga tu orden de pago y envía tu voucher para continuar.",
        "solicitud_id": solicitud.id,
    }, status=status.HTTP_201_CREATED)


@api_view(['PUT'])
@permission_classes([AllowAny])  # la autenticación se valida dentro
def rectificar_solicitud_api(request, request_id):
    """
    Permite al estudiante REENVIAR su solicitud rechazada (vuelve a estado PENDING).
    Los datos del certificado no se pueden cambiar: salen del curso aprobado.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    solicitud = get_object_or_404(CertificateRequest, id=request_id)

    # Solo el propio estudiante puede reenviar su solicitud
    if solicitud.student_id != user.id:
        return _error("Solo puedes reenviar tus propias solicitudes.", status.HTTP_403_FORBIDDEN)

    if solicitud.status != CertificateRequest.RequestStatus.REJECTED:
        return _error("Solo se pueden reenviar solicitudes rechazadas.", status.HTTP_400_BAD_REQUEST)

    if solicitud.curso_id is None:
        return _error(
            "Esta solicitud es anterior al nuevo sistema y no se puede reenviar. "
            "Crea una nueva solicitud eligiendo el curso que aprobaste.",
            status.HTTP_400_BAD_REQUEST
        )

    promedio = promedio_del_estudiante_en_curso(user, solicitud.curso)
    if promedio is None or promedio < NOTA_MINIMA_APROBATORIA:
        return _error(
            "Ya no cumples el requisito de aprobación de ese curso, por eso no se puede reenviar.",
            status.HTTP_400_BAD_REQUEST
        )

    # Vuelve a la etapa en la que estaba antes de ser rechazada
    if solicitud.pago_validado:
        solicitud.status = CertificateRequest.RequestStatus.IN_PROCESS
    elif solicitud.voucher_pago and solicitud.comentarios_pago:
        solicitud.status = CertificateRequest.RequestStatus.PAYMENT_OBSERVED
    elif solicitud.voucher_pago:
        solicitud.status = CertificateRequest.RequestStatus.PAYMENT_REVIEW
    else:
        solicitud.status = CertificateRequest.RequestStatus.AWAITING_PAYMENT
    solicitud.review_comments = ""
    solicitud.save()

    registrar_auditoria(
        user,
        "REENVÍO DE SOLICITUD",
        f"Solicitud #{solicitud.id} reenviada a revisión (curso '{solicitud.curso.nombre}')."
    )

    return Response({
        "status": "success",
        "message": "Solicitud reenviada a revisión exitosamente."
    }, status=status.HTTP_200_OK)


@api_view(['POST', 'OPTIONS'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def aprobar_solicitud_certificado_api(request, request_id):
    """
    Aprueba o rechaza una solicitud de certificado (Admin o Personal INDI).
    Al aprobar: crea el certificado, calcula su hash y lo registra en la blockchain.
    Todo ocurre en una sola transacción: si la blockchain falla, no se guarda nada
    y la solicitud sigue pendiente para poder reintentar.
    """
    if request.method == 'OPTIONS':
        return Response({}, status=200)

    user, error = exigir_personal_indi(request)
    if error:
        return error

    try:
        solicitud = get_object_or_404(CertificateRequest, id=request_id)
        accion = request.data.get('accion', 'aprobar')

        if solicitud.status in (
            CertificateRequest.RequestStatus.APPROVED,
            CertificateRequest.RequestStatus.REJECTED,
        ):
            return Response(
                {"status": "error", "message": "Esta solicitud ya fue procesada anteriormente."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # El certificado solo se emite cuando el pago ya fue validado por el INDI
        if accion != 'rechazar' and solicitud.status != CertificateRequest.RequestStatus.IN_PROCESS:
            return Response(
                {"status": "error", "message": "Solo se puede emitir el certificado cuando el pago ya fue validado."},
                status=status.HTTP_400_BAD_REQUEST
            )

        if accion == 'rechazar':
            solicitud.status = CertificateRequest.RequestStatus.REJECTED
            solicitud.reviewed_by = user
            solicitud.review_comments = request.data.get('comments', 'Rechazado por el INDI.')
            solicitud.save()

            registrar_auditoria(
                user,
                "RECHAZO DE SOLICITUD",
                f"Solicitud #{solicitud.id} de {solicitud.student.username} rechazada. Motivo: {solicitud.review_comments}"
            )

            _, nota_correo = notificar_rechazo(solicitud)

            return Response({
                "status": "success",
                "message": f"Solicitud #{request_id} rechazada correctamente. {nota_correo}"
            }, status=status.HTTP_200_OK)

        # --- FLUJO DE APROBACIÓN Y BLOCKCHAIN ---
        codigo_unico = f"INDI-2026-{str(solicitud.language)[:3].upper()}-{solicitud.id:06d}"

        if Certificate.objects.filter(certificate_code=codigo_unico).exists():
            return Response(
                {"status": "error", "message": f"Ya existe un certificado con el código {codigo_unico}."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                # 1. Marcar la solicitud como aprobada
                solicitud.status = CertificateRequest.RequestStatus.APPROVED
                solicitud.reviewed_by = user
                solicitud.save()

                # 2. Crear el certificado con un hash temporal único.
                #    (issued_at es auto_now_add: su valor real solo existe después de crear,
                #     por eso el hash definitivo se calcula en el paso siguiente)
                certificado = Certificate.objects.create(
                    certificate_code=codigo_unico,
                    student=solicitud.student,
                    language=solicitud.language,
                    level=solicitud.level,
                    subnivel=solicitud.subnivel,
                    anio=solicitud.anio,
                    issued_by=user,
                    certificate_hash="0x" + uuid.uuid4().hex + uuid.uuid4().hex,
                    status=Certificate.Status.ISSUED,
                )

                # 3. Calcular el hash definitivo con la fecha real de emisión
                certificado.certificate_hash = certificado.generate_hash()
                certificado.save(update_fields=['certificate_hash'])

                # 4. Registrarlo en la blockchain (si falla, se deshace todo lo anterior)
                certificado.blockchain_tx_hash = emitir_hash_blockchain(certificado.certificate_hash)
                certificado.save(update_fields=['blockchain_tx_hash'])

                # 5. Dejar constancia en el log de auditoría
                AuditLog.objects.create(
                    action="EMISIÓN DE CERTIFICADO",
                    performed_by=user,
                    certificate=certificado,
                    details=f"Certificado {codigo_unico} emitido. TX: {certificado.blockchain_tx_hash}"
                )
        except BlockchainError as e:
            print(f"--- ERROR BLOCKCHAIN AL APROBAR ---: {e}")
            return Response({
                "status": "error",
                "message": f"No se pudo registrar en la blockchain: {e}. La solicitud sigue pendiente; puedes reintentar."
            }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        correo_enviado, nota_correo = notificar_certificado_emitido(solicitud, certificado, user)

        return Response({
            "status": "success",
            "message": f"Certificado emitido y registrado en la blockchain. {nota_correo}",
            "certificate_code": codigo_unico,
            "blockchain_tx_hash": certificado.blockchain_tx_hash,
            "correo_enviado": correo_enviado,
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        import traceback
        print(f"--- ERROR CRITICO AL APROBAR ---: {str(e)}")
        traceback.print_exc()  # Imprime la traza completa en la consola de Django
        return Response({"status": "error", "message": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ==========================================================
# DESCARGA Y REVOCACIÓN DE CERTIFICADOS
# ==========================================================

def descargar_certificado_pdf(request, certificate_code):
    """
    Descarga el PDF de un certificado OFICIAL ya emitido.
    Ya no se crean certificados de respaldo: si el código no existe, devuelve 404.
    """
    certificate = Certificate.objects.filter(certificate_code=certificate_code).first()
    if certificate is None:
        raise Http404("El certificado solicitado no existe o no ha sido emitido oficialmente.")

    pdf_buffer = generar_pdf_certificado(certificate)

    response = HttpResponse(pdf_buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="Certificado_{certificate_code}.pdf"'
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response


@api_view(['POST', 'OPTIONS'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def revocar_certificado(request, certificate_code):
    """
    RF 24: Permite al personal autorizado (Admin o Personal INDI) revocar un certificado
    indicando un motivo. La revocación se registra en la blockchain y en la base de datos,
    y queda anotada en el AuditLog (RF 14).
    Todo ocurre en una sola transacción: si la blockchain falla, no se cambia nada.
    """
    if request.method == 'OPTIONS':
        return Response({}, status=200)

    user, error = exigir_personal_indi(request)
    if error:
        return error

    # 1. Validaciones del certificado y del motivo
    certificate = Certificate.objects.filter(certificate_code=certificate_code).first()
    if certificate is None:
        return Response({'status': 'error', 'message': 'Certificado no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    if certificate.status == Certificate.Status.REVOKED:
        return Response({'status': 'error', 'message': 'Este certificado ya se encuentra revocado.'}, status=status.HTTP_400_BAD_REQUEST)

    reason = str(request.data.get('reason') or '').strip()
    if not reason:
        return Response({'status': 'error', 'message': 'Debe indicar el motivo de la revocación.'}, status=status.HTTP_400_BAD_REQUEST)

    # 2. ¿Qué dice la blockchain de este certificado?
    estado_cadena = consultar_certificado_blockchain(certificate.certificate_hash)['estado']
    if estado_cadena == 'ERROR_CONSULTA':
        return Response(
            {'status': 'error', 'message': 'No se pudo consultar la blockchain. Verifique que esté disponible e intente de nuevo.'},
            status=status.HTTP_503_SERVICE_UNAVAILABLE
        )

    # 3. Revocar (base de datos + blockchain + auditoría) en una sola transacción
    tx_revocacion = None
    try:
        with transaction.atomic():
            certificate.status = Certificate.Status.REVOKED
            certificate.revocation_reason = reason
            certificate.revoked_at = timezone.now()
            certificate.save()

            # Solo se puede revocar en la cadena un certificado que figure como VALIDO.
            # (Los certificados antiguos que nunca estuvieron en la cadena se revocan solo en la base de datos.)
            if estado_cadena == 'VALIDO':
                tx_revocacion = revocar_hash_blockchain(certificate.certificate_hash)

            if tx_revocacion:
                detalle = f"Certificado {certificate_code} revocado. Motivo: {reason}. TX blockchain: {tx_revocacion}"
            else:
                detalle = (
                    f"Certificado {certificate_code} revocado solo en la base de datos "
                    f"(estado en blockchain: {estado_cadena}). Motivo: {reason}"
                )

            AuditLog.objects.create(
                action="REVOCACIÓN DE CERTIFICADO",
                performed_by=user,
                certificate=certificate,
                details=detalle
            )
    except BlockchainError as e:
        print(f"--- ERROR BLOCKCHAIN AL REVOCAR ---: {e}")
        return Response({
            'status': 'error',
            'message': f'No se pudo revocar en la blockchain: {e}. El certificado no fue modificado.'
        }, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    return Response({
        'status': 'success',
        'message': f'El certificado {certificate_code} ha sido revocado exitosamente.',
        'certificate_code': certificate_code,
        'certificate_status': certificate.status,
        'revocation_reason': certificate.revocation_reason,
        'revoked_at': certificate.revoked_at.isoformat(),
        'blockchain_tx_hash': tx_revocacion,
        'en_blockchain': tx_revocacion is not None,
    }, status=status.HTTP_200_OK)


# ==========================================================
# LOGIN
# ==========================================================

@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response({"detail": "Usuario y contraseña son requeridos."}, status=400)

    user = authenticate(username=username, password=password)

    if user is not None:
        if not user.is_active:
            return Response({"detail": "La cuenta se encuentra inactiva."}, status=403)

        # 1. Obtener el rol guardado en la base de datos (si existe)
        db_role = getattr(user, 'role', None)

        # 2. Asignación inteligente de rol
        if user.is_superuser:
            role = "ADMIN"
        elif db_role and db_role != "":
            role = db_role
        elif "indi" in username.lower():
            role = "INDI"
        elif "grados" in username.lower() or "gt" in username.lower():
            role = "GRADOS_TITULOS"
        else:
            role = "ESTUDIANTE"

        return Response({
            "username": user.username,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": role,
            "token": crear_token(user),  # token firmado (antes era el DNI)
        }, status=200)
    else:
        return Response({"detail": "Credenciales inválidas."}, status=400)


# ==========================================================
# GESTIÓN DE USUARIOS (solo Administrador)
# ==========================================================

@api_view(['GET', 'POST', 'PUT'])
@permission_classes([AllowAny])  # el rol ADMIN se valida dentro
def gestionar_usuarios_api(request):
    """
    Gestiona la lista, creación y edición de usuarios (RF 01). Solo Administrador.
    """
    actor, error = exigir_admin(request)
    if error:
        return error

    if request.method == 'GET':
        usuarios = User.objects.all().order_by('-id')
        data = []
        for u in usuarios:
            nombre_completo = f"{u.last_name}, {u.first_name}".strip(", ") if (u.last_name or u.first_name) else u.username

            # Determinar el rol
            rol = getattr(u, 'role', '')
            if not rol:
                rol = 'ADMIN' if (u.is_superuser or u.is_staff) else 'ESTUDIANTE'

            data.append({
                "id": u.id,
                "username": u.username,
                "first_name": u.first_name or "",
                "last_name": u.last_name or "",
                "nombre_completo": nombre_completo,
                "email": u.email or "",
                "role": rol,
                "is_active": u.is_active
            })
        return Response(data, status=status.HTTP_200_OK)

    elif request.method == 'POST':
        try:
            username = request.data.get('username', '').strip()
            password = request.data.get('password')
            first_name = request.data.get('first_name', '')
            last_name = request.data.get('last_name', '')
            role = request.data.get('role', 'ESTUDIANTE')

            if not username or not username.isdigit() or len(username) != 8:
                return Response({"error": "El DNI/Usuario debe tener exactamente 8 dígitos numéricos."}, status=status.HTTP_400_BAD_REQUEST)

            if not password:
                return Response({"error": "La contraseña temporal es obligatoria."}, status=status.HTTP_400_BAD_REQUEST)

            if User.objects.filter(username=username).exists():
                return Response({"error": f"El DNI {username} ya está registrado."}, status=status.HTTP_400_BAD_REQUEST)

            user = User.objects.create_user(
                username=username,
                password=password,
                first_name=first_name,
                last_name=last_name
            )

            # Si se crea un ADMIN, otorgar permisos staff de Django
            if role == 'ADMIN':
                user.is_staff = True
                user.is_superuser = True

            if hasattr(user, 'role'):
                user.role = role

            user.save()

            registrar_auditoria(
                actor,
                "CREACIÓN DE USUARIO",
                f"Usuario {username} creado con rol {role}."
            )

            return Response({
                "status": "success",
                "message": f"Usuario con DNI {username} creado exitosamente."
            }, status=status.HTTP_201_CREATED)

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    elif request.method == 'PUT':
        try:
            user_id = request.data.get('id')
            user = User.objects.get(id=user_id)

            rol_anterior = getattr(user, 'role', '')

            first_name = request.data.get('first_name', user.first_name)
            last_name = request.data.get('last_name', user.last_name)
            role = request.data.get('role', getattr(user, 'role', 'ESTUDIANTE'))

            user.first_name = first_name
            user.last_name = last_name

            # Actualizar rol y permisos
            if hasattr(user, 'role'):
                user.role = role

            if role == 'ADMIN':
                user.is_staff = True
            else:
                if not user.is_superuser:
                    user.is_staff = False

            user.save()

            registrar_auditoria(
                actor,
                "EDICIÓN DE USUARIO",
                f"Usuario {user.username} actualizado (rol anterior: {rol_anterior or 'sin rol'}, rol nuevo: {role})."
            )

            return Response({
                "status": "success",
                "message": f"Datos y rol del usuario {user.username} actualizados correctamente."
            }, status=status.HTTP_200_OK)

        except User.DoesNotExist:
            return Response({"error": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])  # el rol ADMIN se valida dentro
def toggle_estado_usuario_api(request, user_id):
    """
    Activa o desactiva un usuario del sistema (RF 01). Solo Administrador.
    """
    actor, error = exigir_admin(request)
    if error:
        return error

    try:
        user = User.objects.get(id=user_id)

        if user.id == actor.id:
            return _error("No puedes desactivar tu propia cuenta.", status.HTTP_400_BAD_REQUEST)

        user.is_active = not user.is_active
        user.save()
        estado_txt = "activado" if user.is_active else "desactivado"

        registrar_auditoria(
            actor,
            "ACTIVACIÓN DE USUARIO" if user.is_active else "DESACTIVACIÓN DE USUARIO",
            f"Usuario {user.username} {estado_txt}."
        )

        return Response({
            "status": "success",
            "message": f"Usuario {user.username} ha sido {estado_txt} correctamente."
        }, status=status.HTTP_200_OK)
    except User.DoesNotExist:
        return Response({"error": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])  # el rol ADMIN se valida dentro
def resetear_password_api(request, user_id):
    """
    Permite al Administrador resetear la contraseña de un usuario que la olvidó (RF 01).
    """
    actor, error = exigir_admin(request)
    if error:
        return error

    try:
        user = User.objects.get(id=user_id)
        nueva_password = request.data.get('new_password')

        if not nueva_password or len(nueva_password) < 6:
            return Response({"error": "La nueva contraseña debe tener al menos 6 caracteres."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(nueva_password)
        user.save()

        # Importante: la contraseña NUNCA se escribe en el log.
        registrar_auditoria(
            actor,
            "RESTABLECIMIENTO DE CONTRASEÑA",
            f"Se restableció la contraseña del usuario {user.username}."
        )

        return Response({
            "status": "success",
            "message": f"Contraseña actualizada exitosamente para el DNI {user.username}."
        }, status=status.HTTP_200_OK)
    except User.DoesNotExist:
        return Response({"error": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ==========================================================
# 🚀 MÓDULO UNIFICADO DE MATRÍCULAS E INSCRIPCIONES INDI
# ==========================================================

# Costo de la matrícula según el tipo de postulante (en soles)
PRECIOS_MATRICULA = {'UNSCH': Decimal('90.00'), 'PUBLICO': Decimal('120.00')}
TIPOS_POSTULANTE = ('PUBLICO', 'UNSCH')


def monto_matricula(tipo_postulante):
    return PRECIOS_MATRICULA.get(str(tipo_postulante or '').upper(), PRECIOS_MATRICULA['PUBLICO'])


def cupos_ocupados(curso):
    """
    Vacantes que el curso ya tiene comprometidas: matriculados aprobados + solicitudes con voucher en
    revisión + órdenes sin pagar cuyo plazo (5 días) sigue vigente. Una reserva vencida no ocupa cupo.
    """
    aprobados = Matricula.objects.filter(curso=curso, status=Matricula.MatriculaStatus.APPROVED).count()
    pendientes = SolicitudMatricula.objects.filter(curso=curso, estado='PENDIENTE').count()
    reservas = sum(
        1 for s in SolicitudMatricula.objects.filter(curso=curso, estado='ESPERANDO_PAGO')
        if not s.reserva_vencida
    )
    return aprobados + pendientes + reservas


def cupos_info(curso):
    """(ocupados, disponibles) — disponibles es None si el curso no tiene límite."""
    ocupados = cupos_ocupados(curso)
    if curso.cupos is None:
        return ocupados, None
    return ocupados, max(curso.cupos - ocupados, 0)


def hay_cupo(curso):
    return curso.cupos is None or cupos_ocupados(curso) < curso.cupos


def _leer_cupos(valor):
    """Devuelve (cupos|None, error). Vacío = sin límite."""
    if valor in (None, ''):
        return None, None
    try:
        n = int(valor)
    except (TypeError, ValueError):
        return None, "Los cupos deben ser un número entero (o déjalo vacío si no hay límite)."
    if n < 1 or n > 500:
        return None, "Los cupos deben estar entre 1 y 500."
    return n, None


def _leer_faltas(valor):
    try:
        n = int(valor)
    except (TypeError, ValueError):
        return None, "Las faltas permitidas deben ser un número entero."
    if n < 0 or n > 10:
        return None, "Las faltas permitidas deben estar entre 0 y 10."
    return n, None


def _curso_a_dict(c):
    """Forma única en que la API entrega un curso (la usan el catálogo, el registro y la inscripción)."""
    ocupados, disponibles = cupos_info(c)
    return {
        "cupos": c.cupos,
        "cupos_ocupados": ocupados,
        "cupos_disponibles": disponibles,
        "cupos_agotados": disponibles == 0,
        "faltas_permitidas": c.faltas_permitidas,
        "id": c.id,
        "nombre": c.nombre,
        "language": c.language,
        "language_code": normalizar_codigo(c.language),
        "idioma": idioma_legible(c.language),
        "level": c.level,
        "nivel": nivel_legible(c.level),
        "subnivel": c.subnivel,
        "periodo": c.periodo,
        "modalidad": c.modalidad,
        "horario": c.horario or "",
        "docente_id": c.docente.id if c.docente else None,
        "docente_nombre": (c.docente.get_full_name() or c.docente.username) if c.docente else "Por asignar",
    }


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def gestionar_cursos_api(request):
    """
    GET: Lista todos los cursos activos (público: lo usan el registro y la inscripción).
    POST: Permite al rol INDI o ADMIN lanzar un nuevo curso (idioma, nivel, modalidad, horario, docente).
    """
    if request.method == 'GET':
        cursos = Curso.objects.filter(activo=True).select_related('docente').order_by('language', 'modalidad', 'horario', 'subnivel')
        return Response([_curso_a_dict(c) for c in cursos], status=status.HTTP_200_OK)

    # POST: solo Admin o Personal INDI
    user, error = exigir_personal_indi(request)
    if error:
        return error

    datos = request.data
    language = normalizar_codigo(datos.get('language'))
    level = normalizar_codigo(datos.get('level'))
    subnivel = str(datos.get('subnivel') or 'Nivel I').strip()
    periodo = str(datos.get('periodo') or '2026-I').strip()
    modalidad = normalizar_codigo(datos.get('modalidad') or 'PRESENCIAL')
    horario = str(datos.get('horario') or '').strip()
    docente_id = datos.get('docente_id')
    cupos, err = _leer_cupos(datos.get('cupos'))
    if err:
        return _error(err, status.HTTP_400_BAD_REQUEST)
    faltas, err = _leer_faltas(datos.get('faltas_permitidas', 2))
    if err:
        return _error(err, status.HTTP_400_BAD_REQUEST)

    if language not in Curso.Language.values:
        return _error("Selecciona un idioma válido.", status.HTTP_400_BAD_REQUEST)
    if level not in Curso.Level.values:
        return _error("Selecciona un nivel válido.", status.HTTP_400_BAD_REQUEST)
    if modalidad not in Curso.Modalidad.values:
        return _error("La modalidad debe ser Presencial o Virtual.", status.HTTP_400_BAD_REQUEST)
    if not horario:
        return _error("Indica el horario del curso (por ejemplo: L-V 08:00 - 10:00).", status.HTTP_400_BAD_REQUEST)
    if len(horario) > 100 or not periodo or len(periodo) > 20 or len(subnivel) > 20:
        return _error("Revisa la longitud del horario, período o subnivel.", status.HTTP_400_BAD_REQUEST)

    nombre = str(datos.get('nombre') or '').strip() or f"{idioma_legible(language)} {nivel_legible(level)} - {subnivel}"
    if len(nombre) > 150:
        return _error("El nombre del curso es demasiado largo (máximo 150 caracteres).", status.HTTP_400_BAD_REQUEST)

    docente = None
    if docente_id not in (None, ''):
        docente = User.objects.filter(id=docente_id, role='DOCENTE', is_active=True).first()
        if docente is None:
            return _error("El docente seleccionado no existe o no está activo.", status.HTTP_400_BAD_REQUEST)

    if Curso.objects.filter(
        language=language, level=level, subnivel=subnivel, periodo=periodo,
        modalidad=modalidad, horario=horario, activo=True,
    ).exists():
        return _error("Ya existe un curso con el mismo idioma, nivel, período, modalidad y horario.", status.HTTP_400_BAD_REQUEST)

    curso = Curso.objects.create(
        nombre=nombre, language=language, level=level, subnivel=subnivel, periodo=periodo,
        modalidad=modalidad, horario=horario, docente=docente,
        cupos=cupos, faltas_permitidas=faltas,
    )

    registrar_auditoria(
        user,
        "CREACIÓN DE CURSO",
        f"Curso '{nombre}' creado ({modalidad}, {horario}, período {periodo}, "
        f"docente: {docente.username if docente else 'sin asignar'}, "
        f"cupos: {cupos if cupos is not None else 'sin límite'}, faltas permitidas: {faltas})."
    )

    return Response({
        "status": "success",
        "message": "Curso lanzado correctamente. Ya aparece en el registro y la inscripción.",
        "curso_id": curso.id
    }, status=status.HTTP_201_CREATED)


def _solicitud_a_dict(s):
    curso = s.curso
    return {
        "id": s.id,
        "estudiante": s.estudiante.get_full_name() or s.estudiante.username,
        "estudiante_dni": s.estudiante.username,
        "curso_id": curso.id if curso else None,
        "curso_nombre": curso.nombre if curso else "Curso libre",
        "idioma": idioma_legible(curso.language) if curso else "",
        "nivel": nivel_legible(curso.level) if curso else "",
        "subnivel": curso.subnivel if curso else "",
        "periodo": curso.periodo if curso else "",
        "modalidad": curso.modalidad if curso else "",
        "horario": (curso.horario or "") if curso else "",
        "tipo_postulante": s.tipo_postulante,
        "monto": float(monto_matricula(s.tipo_postulante)),
        "status": s.estado,
        "estado": s.estado,
        "tiene_voucher": bool(s.boucher_pago),
        "motivo_rechazo": s.motivo_rechazo if s.estado == 'RECHAZADA' else "",
        "fecha": s.fecha_solicitud.isoformat() if s.fecha_solicitud else "",
        "reserva_vence": s.vence_en.isoformat() if (s.estado == 'ESPERANDO_PAGO' and s.vence_en) else "",
        "reserva_vencida": s.reserva_vencida,
        "curso_cupos_agotados": bool(curso and curso.cupos is not None and not hay_cupo(curso)),
    }


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def gestionar_matriculas_api(request):
    """
    GET: Lista las solicitudes (Estudiante ve las suyas, INDI/Admin ven todas).
    POST: Permite a un estudiante solicitar matrícula en un curso.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    if request.method == 'GET':
        base = SolicitudMatricula.objects.select_related('estudiante', 'curso')
        if es_personal_indi(user):
            solicitudes = base.order_by('-fecha_solicitud')
        elif es_estudiante(user):
            solicitudes = base.filter(estudiante=user).order_by('-fecha_solicitud')
        else:
            return _error("No tienes permisos para ver las matrículas.", status.HTTP_403_FORBIDDEN)

        return Response([_solicitud_a_dict(s) for s in solicitudes], status=status.HTTP_200_OK)

    # POST
    if not es_estudiante(user):
        return _error("Solo los estudiantes pueden inscribirse a un curso.", status.HTTP_403_FORBIDDEN)

    curso_id = request.data.get('curso_id')
    if not curso_id:
        return _error("Debe seleccionar un curso.", status.HTTP_400_BAD_REQUEST)

    curso = Curso.objects.filter(id=curso_id, activo=True).first()
    if curso is None:
        return _error("El curso seleccionado no existe o ya no está disponible.", status.HTTP_400_BAD_REQUEST)

    if SolicitudMatricula.objects.filter(estudiante=user, curso=curso).exclude(estado='RECHAZADA').exists():
        return _error("Ya cuentas con una solicitud activa en este curso.", status.HTTP_400_BAD_REQUEST)
    if not hay_cupo(curso):
        return _error("Los cupos de este curso están agotados. Elige otro horario o consulta en el INDI.", status.HTTP_400_BAD_REQUEST)

    # Tipo de postulante: lo que envía el formulario o, si no, lo guardado en su perfil
    tipo = str(request.data.get('tipo_postulante') or user.tipo_postulante or 'PUBLICO').upper()
    if tipo not in TIPOS_POSTULANTE:
        return _error("Tipo de postulante no válido.", status.HTTP_400_BAD_REQUEST)

    codigo = str(request.data.get('codigo_universitario') or user.codigo_universitario or '').strip()
    if tipo == 'UNSCH' and not (len(codigo) == 8 and codigo.isdigit()):
        return _error("El código de estudiante UNSCH debe tener exactamente 8 dígitos.", status.HTTP_400_BAD_REQUEST)
    if tipo == 'PUBLICO':
        codigo = ''

    if (user.tipo_postulante, user.codigo_universitario) != (tipo, codigo):
        user.tipo_postulante = tipo
        user.codigo_universitario = codigo
        user.save(update_fields=['tipo_postulante', 'codigo_universitario'])

    solicitud = SolicitudMatricula.objects.create(
        estudiante=user,
        curso=curso,
        tipo_postulante=tipo,
        codigo_universitario=codigo,
        estado='ESPERANDO_PAGO'
    )

    return Response({
        "status": "success",
        "message": "Inscripción registrada. Descarga tu orden de pago y súbela con tu voucher.",
        "solicitud_id": solicitud.id,
        "monto": float(monto_matricula(tipo)),
    }, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def aprobar_matricula_api(request, matricula_id):
    """
    Aprueba o rechaza la solicitud de matrícula (Personal INDI o Admin).
    Al aprobar, el estudiante queda realmente matriculado en el curso (se crea su Matricula).
    Solo se procesan solicitudes con el voucher ya subido (estado PENDIENTE).
    """
    user, error = exigir_personal_indi(request)
    if error:
        return error

    solicitud = get_object_or_404(SolicitudMatricula, id=matricula_id)
    accion = request.data.get('accion', 'aprobar')

    if solicitud.estado != 'PENDIENTE':
        return _error(
            "Solo se pueden procesar solicitudes con el voucher en revisión.",
            status.HTTP_400_BAD_REQUEST
        )

    detalle_base = (
        f"Solicitud de matrícula #{solicitud.id} "
        f"({solicitud.estudiante.username}, curso {solicitud.curso.nombre if solicitud.curso else 'sin curso'})"
    )

    if accion == 'aprobar':
        # Aprobar y matricular en una sola operación
        with transaction.atomic():
            solicitud.estado = 'APROBADA'
            solicitud.save()

            Matricula.objects.update_or_create(
                estudiante=solicitud.estudiante,
                curso=solicitud.curso,
                defaults={
                    'status': Matricula.MatriculaStatus.APPROVED,
                    'aprobado_por': user,
                },
            )

        registrar_auditoria(
            user,
            "APROBACIÓN DE MATRÍCULA",
            f"{detalle_base} aprobada. El estudiante quedó matriculado en el curso."
        )
        _, nota_correo = notificar_matricula_aprobada(solicitud)
        aviso = ""
        c = solicitud.curso
        if c and c.cupos is not None and cupos_ocupados(c) > c.cupos:
            aviso = f" Atención: el curso ahora tiene más matriculados que sus {c.cupos} cupos (aprobado como excepción)."
        return Response({
            "status": "success",
            "message": f"Matrícula aprobada. El estudiante quedó matriculado en el curso.{aviso} {nota_correo}"
        })

    # Rechazo: se exige el motivo para que el estudiante sepa qué corregir
    motivo = str(request.data.get('motivo') or '').strip()
    if len(motivo) < 5:
        return _error("Escribe el motivo del rechazo (mínimo 5 caracteres).", status.HTTP_400_BAD_REQUEST)
    if len(motivo) > 300:
        return _error("El motivo es demasiado largo (máximo 300 caracteres).", status.HTTP_400_BAD_REQUEST)

    solicitud.estado = 'RECHAZADA'
    solicitud.motivo_rechazo = motivo
    solicitud.save()
    registrar_auditoria(user, "RECHAZO DE MATRÍCULA", f"{detalle_base} rechazada. Motivo: {motivo}")
    _, nota_correo = notificar_matricula_rechazada(solicitud)
    return Response({"status": "success", "message": f"Matrícula rechazada. {nota_correo}"})


@api_view(['POST'])
@permission_classes([AllowAny])
def registrarse_y_generar_orden(request):
    """Registro público de un nuevo estudiante con su orden de pago. Devuelve la sesión ya iniciada."""
    data = request.data
    username = str(data.get('username') or '').strip()  # DNI
    password = str(data.get('password') or '')
    first_name = str(data.get('first_name') or '').strip()
    last_name = str(data.get('last_name') or '').strip()
    email = str(data.get('email') or '').strip()
    celular = str(data.get('celular') or '').strip()
    tipo_postulante = str(data.get('tipo_postulante') or 'PUBLICO').upper()
    codigo_universitario = str(data.get('codigo_universitario') or '').strip()
    curso_id = data.get('curso_id')

    if not (len(username) == 8 and username.isdigit()):
        return _error("El DNI debe tener exactamente 8 dígitos.", 400)
    if len(password) < 8:
        return _error("La contraseña debe tener al menos 8 caracteres.", 400)
    if not first_name or not last_name:
        return _error("Escribe tus nombres y apellidos.", 400)
    if not (len(celular) == 9 and celular.isdigit()):
        return _error("El celular debe tener exactamente 9 dígitos.", 400)
    try:
        validate_email(email)
    except ValidationError:
        return _error("Escribe un correo electrónico válido: ahí te enviaremos tu certificado.", 400)
    if tipo_postulante not in TIPOS_POSTULANTE:
        return _error("Tipo de postulante no válido.", 400)
    if tipo_postulante == 'UNSCH' and not (len(codigo_universitario) == 8 and codigo_universitario.isdigit()):
        return _error("El código de estudiante UNSCH debe tener exactamente 8 dígitos.", 400)
    if tipo_postulante == 'PUBLICO':
        codigo_universitario = ''

    if User.objects.filter(username=username).exists() or User.objects.filter(dni=username).exists():
        return _error("El DNI ya se encuentra registrado. Inicia sesión.", 400)

    curso = Curso.objects.filter(id=curso_id, activo=True).first()
    if curso is None:
        return _error("El curso seleccionado no existe o ya no está disponible.", 400)
    if not hay_cupo(curso):
        return _error("Los cupos de este curso están agotados. Elige otro horario o consulta en el INDI.", 400)

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                password=password,
                first_name=first_name,
                last_name=last_name,
                email=email,
            )
            user.dni = username
            user.role = 'STUDENT'
            user.celular = celular
            user.tipo_postulante = tipo_postulante
            user.codigo_universitario = codigo_universitario
            user.save()

            solicitud = SolicitudMatricula.objects.create(
                estudiante=user,
                curso=curso,
                tipo_postulante=tipo_postulante,
                codigo_universitario=codigo_universitario,
                estado='ESPERANDO_PAGO'
            )
    except Exception:
        return _error("No se pudo completar el registro. Inténtalo nuevamente.", 500)

    return Response({
        'status': 'success',
        'solicitud_id': solicitud.id,
        'monto': float(monto_matricula(tipo_postulante)),
        'token': crear_token(user),
        'user': {
            'username': user.username,
            'first_name': user.first_name,
            'last_name': user.last_name,
            'role': 'STUDENT',
        },
        'message': 'Cuenta creada y orden de pago generada con éxito.'
    }, status=201)


@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el propietario se validan dentro
def descargar_orden_pago_pdf(request, solicitud_id):
    """
    Orden de pago en PDF.
    Solo puede verla el estudiante dueño de la solicitud, el Personal INDI o el Admin.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    try:
        solicitud = SolicitudMatricula.objects.get(id=solicitud_id)
    except SolicitudMatricula.DoesNotExist:
        return Response({'message': 'Solicitud no encontrada'}, status=404)

    if solicitud.estudiante_id != user.id and not es_personal_indi(user):
        return _error("No tienes permiso para ver esta orden de pago.", status.HTTP_403_FORBIDDEN)

    estudiante = solicitud.estudiante
    curso = solicitud.curso

    if solicitud.tipo_postulante == 'UNSCH':
        concepto_tasa = "Pensión (Estudiante de la UNSCH)"
    else:
        concepto_tasa = "Pensión (Público General)"
    monto_total = f"S/.{monto_matricula(solicitud.tipo_postulante):.2f}"

    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    p.setFont("Helvetica-Bold", 12)
    p.drawString(100, height - 60, "UNIVERSIDAD NACIONAL DE SAN CRISTOBAL DE HUAMANGA")
    p.setFont("Helvetica", 10)
    p.drawString(100, height - 75, "Centro de Innovación, Desarrollo y Emprendimiento")
    p.drawString(100, height - 90, "Instituto De Idiomas")

    p.setFont("Helvetica-Bold", 14)
    p.drawCentredString(width / 2, height - 130, f"ORDEN DE PAGO {solicitud.id:05d}")

    p.setFont("Helvetica-Bold", 10)
    y = height - 170

    datos = [
        ("DNI", f": {estudiante.username}"),
        ("APELLIDOS Y NOMBRES", f": {estudiante.last_name.upper()}, {estudiante.first_name.upper()}"),
        ("CICLO", f": {curso.periodo}"),
        ("IDIOMA/NIVEL", f": {idioma_legible(curso.language)}/{nivel_legible(curso.level)}-{curso.subnivel}"),
        ("GRUPO", f': "{curso.horario or "Por definir"}"'),
        ("SEDE", f": {curso.get_modalidad_display()}"),
        ("TASA DE PAGO", ""),
        (f"  - {concepto_tasa}", ""),
    ]

    for label, val in datos:
        p.drawString(100, y, label)
        if val:
            p.drawString(240, y, val)
        y -= 20

    p.setFont("Helvetica-Bold", 12)
    p.drawString(100, y - 5, "TOTAL")
    p.drawString(240, y - 5, f": {monto_total}")

    p.setFont("Helvetica", 9)
    fecha_actual = datetime.now().strftime("%d/%m/%Y Hora: %H:%M:%S")
    p.drawString(100, y - 35, f"Fecha de impresión: {fecha_actual}")

    y_footer = y - 85
    p.setFont("Helvetica-Bold", 10)
    p.drawString(100, y_footer, "Pagar en:")
    p.setFont("Helvetica", 10)
    p.drawString(100, y_footer - 18, "AGENTES INTERBANK A NIVEL NACIONAL")
    p.setFont("Helvetica-Bold", 10)
    p.drawString(100, y_footer - 36, "DEBES PRESENTAR TU DNI Y EL ORDEN DE PAGO")
    p.drawString(100, y_footer - 54, "EN EL VOUCHER SE DEBE CONSIDERAR EL NUMERO DE DNI DEL ESTUDIANTE")

    p.setFont("Helvetica", 10)
    p.drawString(100, y_footer - 76, "Código de Empresa: 139")
    p.drawString(100, y_footer - 92, "Código de Servicio: 02")

    p.setFont("Helvetica-Bold", 9)
    p.drawString(100, y_footer - 118, "NOTA: Solo pagar en las entidades antes mencionadas.")
    p.setFont("Helvetica", 9)
    p.drawString(100, y_footer - 144, "- Las instrucciones para el acceso se enviarán a tu correo.")
    p.drawString(100, y_footer - 158, "- La reserva de horario es válido por 5 días calendarios.")

    p.showPage()
    p.save()

    buffer.seek(0)
    response = HttpResponse(buffer, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="Orden_Pago_{solicitud.id}.pdf"'
    return response


@api_view(['POST', 'OPTIONS'])
@permission_classes([AllowAny])  # la autenticación se valida dentro
def subir_voucher_matricula(request):
    """
    Permite al estudiante subir (o reemplazar) el voucher de pago de SU solicitud de matrícula.
    Solo se aceptan JPG, PNG o PDF de hasta 5 MB, y el contenido debe corresponder a la extensión.
    """
    if request.method == 'OPTIONS':
        return Response({}, status=200)

    user, error = exigir_usuario(request)
    if error:
        return error

    archivo = request.FILES.get('voucher_pago') or request.FILES.get('boucher_pago')
    solicitud_id = request.data.get('solicitud_id')

    if not archivo:
        return _error("Debes adjuntar el archivo del voucher.", 400)
    if not solicitud_id:
        return _error("No se especificó la solicitud de matrícula.", 400)

    solicitud = SolicitudMatricula.objects.filter(id=solicitud_id, estudiante=user).first()
    if solicitud is None:
        return _error("No se encontró la solicitud de matrícula o no te pertenece.", 404)

    if solicitud.estado not in ('ESPERANDO_PAGO', 'PENDIENTE', 'RECHAZADA'):
        return _error("Esta solicitud ya fue procesada y no admite un nuevo voucher.", 400)

    era_rechazada = solicitud.estado == 'RECHAZADA'
    motivo_anterior = solicitud.motivo_rechazo
    if era_rechazada and (solicitud.curso is None or not solicitud.curso.activo):
        return _error("Ese curso ya no está disponible. Elige otro desde 'Inscripción a Cursos'.", 400)

    # Una reserva vencida (o una solicitud rechazada) ya no tiene cupo guardado: solo sigue si aún queda uno
    if (solicitud.reserva_vencida or era_rechazada) and solicitud.curso and not hay_cupo(solicitud.curso):
        if solicitud.reserva_vencida:
            return _error(
                "El plazo de 5 días de tu orden de pago venció y el curso ya no tiene cupos. "
                "Consulta en el INDI o inscríbete en otro horario.", 400)
        return _error("El curso ya no tiene cupos disponibles. Consulta en el INDI o elige otro horario.", 400)

    extension = os.path.splitext(archivo.name)[1].lower()
    if extension not in EXTENSIONES_VOUCHER:
        return _error("El voucher debe ser una imagen JPG o PNG, o un PDF.", 400)
    if archivo.size > TAMANO_MAXIMO_VOUCHER:
        return _error("El archivo es demasiado grande (máximo 5 MB).", 400)
    if not _voucher_coincide_con_extension(archivo, extension):
        return _error("El contenido del archivo no corresponde a un JPG, PNG o PDF válido.", 400)

    # Si ya había un voucher (reemplazo), se elimina el anterior
    if solicitud.boucher_pago:
        solicitud.boucher_pago.delete(save=False)

    archivo.name = f"matricula_{solicitud.id}_{uuid.uuid4().hex[:8]}{extension}"
    solicitud.boucher_pago = archivo
    solicitud.estado = 'PENDIENTE'
    solicitud.motivo_rechazo = ''
    solicitud.save()

    if era_rechazada:
        registrar_auditoria(
            user,
            "CORRECCIÓN DE MATRÍCULA",
            f"Solicitud de matrícula #{solicitud.id}: el estudiante {user.username} volvió a enviar su voucher "
            f"tras un rechazo (motivo anterior: {motivo_anterior or 'sin motivo'})."
        )
        mensaje = 'Corrección enviada. Tu matrícula vuelve a estar en revisión por el INDI.'
    else:
        mensaje = 'Voucher subido correctamente. Tu matrícula está en revisión por el INDI.'

    return Response({'status': 'success', 'message': mensaje}, status=200)


@api_view(['POST'])
@permission_classes([AllowAny])  # la autenticación y el propietario se validan dentro
def cancelar_matricula_api(request, solicitud_id):
    """
    El estudiante cancela una inscripción hecha por error (otro curso, otro horario...).
    Solo mientras no ha enviado voucher ni pagado: así no se pierde ningún trámite en curso.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    solicitud = SolicitudMatricula.objects.filter(id=solicitud_id, estudiante=user).select_related('curso').first()
    if solicitud is None:
        return _error("No se encontró la inscripción o no te pertenece.", status.HTTP_404_NOT_FOUND)
    if solicitud.estado != 'ESPERANDO_PAGO' or solicitud.boucher_pago:
        return _error(
            "Solo puedes cancelar inscripciones que aún no tienen voucher. Si ya pagaste, comunícate con el INDI.",
            status.HTTP_400_BAD_REQUEST
        )

    nombre = solicitud.curso.nombre if solicitud.curso else 'curso'
    registrar_auditoria(
        user, "CANCELACIÓN DE INSCRIPCIÓN",
        f"El estudiante {user.username} canceló su inscripción #{solicitud.id} ({nombre})."
    )
    solicitud.delete()
    return Response({"status": "success", "message": "Inscripción cancelada. Ya puedes elegir otro curso."})


def _entregar_archivo(campo, nombre_descarga=None):
    """Devuelve el archivo de un FileField privado como respuesta, o None si no existe."""
    try:
        archivo = campo.open('rb')
    except (FileNotFoundError, ValueError, OSError):
        # Archivos antiguos guardados en la carpeta pública media/
        ruta = os.path.join(settings.MEDIA_ROOT, str(campo.name))
        if not os.path.isfile(ruta):
            return None
        archivo = open(ruta, 'rb')
    nombre = os.path.basename(str(campo.name))
    tipo = mimetypes.guess_type(nombre)[0] or 'application/octet-stream'
    respuesta = FileResponse(archivo, content_type=tipo)
    respuesta['Content-Disposition'] = f'inline; filename="{nombre_descarga or nombre}"'
    respuesta['Cache-Control'] = 'private, no-store'
    return respuesta


@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el propietario se validan dentro
def ver_voucher_matricula_api(request, solicitud_id):
    """Entrega el voucher de matrícula. Solo el estudiante dueño, el Personal INDI o el Admin."""
    user, error = exigir_usuario(request)
    if error:
        return error

    solicitud = SolicitudMatricula.objects.filter(id=solicitud_id).first()
    if solicitud is None or not solicitud.boucher_pago:
        return _error("No hay voucher para esta solicitud.", 404)

    if solicitud.estudiante_id != user.id and not es_personal_indi(user):
        return _error("No tienes permiso para ver este voucher.", 403)

    respuesta = _entregar_archivo(solicitud.boucher_pago)
    if respuesta is None:
        return _error("El archivo del voucher no está disponible. Pide al estudiante que lo suba nuevamente.", 404)
    return respuesta


@api_view(['GET', 'PUT'])
@permission_classes([AllowAny])  # la autenticación se valida dentro
def mi_perfil_api(request):
    """
    Datos de contacto y de postulante del usuario (los que dio al registrarse).
    GET los devuelve; PUT permite actualizarlos.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    if request.method == 'PUT':
        d = request.data
        if 'celular' in d:
            celular = str(d.get('celular') or '').strip()
            if celular and not (len(celular) == 9 and celular.isdigit()):
                return _error("El celular debe tener exactamente 9 dígitos.", 400)
            user.celular = celular
        if 'email' in d:
            email = str(d.get('email') or '').strip()
            try:
                validate_email(email)
            except ValidationError:
                return _error("Escribe un correo electrónico válido.", 400)
            user.email = email
        if 'correo_institucional' in d:
            ci = str(d.get('correo_institucional') or '').strip().lower()
            if ci:
                try:
                    validate_email(ci)
                except ValidationError:
                    return _error("Escribe un correo institucional válido.", 400)
                if User.objects.filter(correo_institucional__iexact=ci).exclude(id=user.id).exists():
                    return _error("Ese correo institucional ya está registrado en otra cuenta.", 400)
                user.correo_institucional = ci
            else:
                user.correo_institucional = None
        if 'tipo_postulante' in d:
            tipo = str(d.get('tipo_postulante') or '').upper()
            if tipo not in TIPOS_POSTULANTE:
                return _error("Tipo de postulante no válido.", 400)
            codigo = str(d.get('codigo_universitario') or '').strip()
            if tipo == 'UNSCH' and not (len(codigo) == 8 and codigo.isdigit()):
                return _error("El código de estudiante UNSCH debe tener exactamente 8 dígitos.", 400)
            user.tipo_postulante = tipo
            user.codigo_universitario = codigo if tipo == 'UNSCH' else ''
        user.save()

    return Response({
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "role": 'ADMIN' if user.is_superuser else (rol_de(user) or 'STUDENT'),
        "email": user.email,
        "correo_institucional": user.correo_institucional or "",
        "celular": user.celular,
        "tipo_postulante": user.tipo_postulante,
        "codigo_universitario": user.codigo_universitario,
    })


@api_view(['POST'])
@permission_classes([AllowAny])  # la autenticación se valida dentro
def cambiar_password_api(request):
    """
    El usuario cambia su propia contraseña. Exige la contraseña actual.
    Reglas: mínimo 8 caracteres, no solo números, distinta de la actual y de su DNI.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    actual = str(request.data.get('actual') or '')
    nueva = str(request.data.get('nueva') or '')
    confirmar = str(request.data.get('confirmar') or '')

    if not user.check_password(actual):
        return _error("La contraseña actual no es correcta.", 400)
    if len(nueva) < 8:
        return _error("La nueva contraseña debe tener al menos 8 caracteres.", 400)
    if nueva.isdigit():
        return _error("La nueva contraseña no puede ser solo números.", 400)
    if nueva == actual:
        return _error("La nueva contraseña debe ser distinta de la actual.", 400)
    if nueva == user.username:
        return _error("La contraseña no puede ser igual a tu DNI.", 400)
    if nueva != confirmar:
        return _error("La confirmación no coincide con la nueva contraseña.", 400)

    user.set_password(nueva)
    user.save(update_fields=['password'])
    registrar_auditoria(user, "CAMBIO DE CONTRASEÑA", f"El usuario {user.username} cambió su contraseña.")
    return Response({"status": "success", "message": "Contraseña actualizada correctamente."})


# ==========================================================
# MATERIALES DE CLASE (el docente publica, el estudiante consulta)
# ==========================================================

EXTENSIONES_MATERIAL = {
    '.pdf': (b'%PDF',), '.png': (b'\x89PNG',), '.jpg': (b'\xff\xd8',), '.jpeg': (b'\xff\xd8',),
    '.docx': (b'PK',), '.pptx': (b'PK',), '.xlsx': (b'PK',),
    '.doc': (b'\xd0\xcf\x11\xe0',), '.ppt': (b'\xd0\xcf\x11\xe0',), '.xls': (b'\xd0\xcf\x11\xe0',),
}
TAMANO_MAXIMO_MATERIAL = 10 * 1024 * 1024  # 10 MB


def puede_gestionar_curso(user, curso):
    """Docente titular del curso, Personal INDI o Admin."""
    if es_personal_indi(user):
        return True
    return rol_de(user) == 'DOCENTE' and curso.docente_id == user.id


def puede_ver_curso(user, curso):
    """Quien gestiona el curso o un estudiante matriculado (aprobado) en él."""
    if puede_gestionar_curso(user, curso):
        return True
    return Matricula.objects.filter(
        estudiante=user, curso=curso, status=Matricula.MatriculaStatus.APPROVED
    ).exists()


def _material_a_dict(m):
    return {
        "id": m.id,
        "curso_id": m.curso_id,
        "tipo": m.tipo,
        "tipo_nombre": m.get_tipo_display(),
        "titulo": m.titulo,
        "descripcion": m.descripcion,
        "enlace": m.enlace,
        "tiene_archivo": bool(m.archivo),
        "archivo_nombre": os.path.basename(m.archivo.name) if m.archivo else "",
        "semana": m.semana,
        "fecha": m.fecha.isoformat() if m.fecha else None,
        "publicado_por": (m.publicado_por.get_full_name() or m.publicado_por.username) if m.publicado_por else "",
        "creado": m.created_at.isoformat(),
    }


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def materiales_curso_api(request, curso_id):
    """
    GET: materiales del curso (docente del curso, INDI/Admin o estudiante matriculado).
    POST: el docente del curso (o INDI/Admin) publica un material: sílabo, enlace de clase,
          cronograma, material de estudio o aviso. Acepta multipart (con archivo) o JSON.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    curso = get_object_or_404(Curso, id=curso_id)

    if request.method == 'GET':
        if not puede_ver_curso(user, curso):
            return _error("No tienes acceso a los materiales de este curso.", 403)
        materiales = curso.materiales.select_related('publicado_por')
        return Response([_material_a_dict(m) for m in materiales])

    # POST
    if not puede_gestionar_curso(user, curso):
        return _error("Solo el docente de este curso puede publicar materiales.", 403)

    d = request.data
    titulo = str(d.get('titulo') or '').strip()
    tipo = str(d.get('tipo') or 'MATERIAL').strip().upper()
    descripcion = str(d.get('descripcion') or '').strip()
    enlace = str(d.get('enlace') or '').strip()
    archivo = request.FILES.get('archivo')

    if not titulo or len(titulo) > 150:
        return _error("Escribe un título (máximo 150 caracteres).", 400)
    if tipo not in Material.Tipo.values:
        return _error("Tipo de material no válido.", 400)
    if not (enlace or archivo or descripcion):
        return _error("Agrega un enlace, un archivo o una descripción.", 400)

    if enlace:
        if not enlace.lower().startswith(('http://', 'https://')) or len(enlace) > 500:
            return _error("El enlace debe comenzar con http:// o https://.", 400)

    semana = None
    if str(d.get('semana') or '').strip() not in ('', '0'):
        try:
            semana = int(d.get('semana'))
        except (TypeError, ValueError):
            return _error("La semana debe ser un número del 1 al 4.", 400)
        if not 1 <= semana <= 4:
            return _error("La semana debe estar entre 1 y 4.", 400)

    fecha = None
    if str(d.get('fecha') or '').strip():
        try:
            fecha = date.fromisoformat(str(d.get('fecha')).strip())
        except ValueError:
            return _error("La fecha no es válida.", 400)

    if archivo:
        extension = os.path.splitext(archivo.name)[1].lower()
        if extension not in EXTENSIONES_MATERIAL:
            return _error("Formato no permitido. Usa PDF, Word, PowerPoint, Excel o imagen.", 400)
        if archivo.size > TAMANO_MAXIMO_MATERIAL:
            return _error("El archivo es demasiado grande (máximo 10 MB).", 400)
        cabecera = archivo.read(8)
        archivo.seek(0)
        if not any(cabecera.startswith(f) for f in EXTENSIONES_MATERIAL[extension]):
            return _error("El contenido del archivo no corresponde a su formato.", 400)
        archivo.name = f"curso{curso.id}_{uuid.uuid4().hex[:8]}{extension}"

    material = Material.objects.create(
        curso=curso, tipo=tipo, titulo=titulo, descripcion=descripcion, enlace=enlace,
        archivo=archivo, semana=semana, fecha=fecha, publicado_por=user,
    )
    avisados = notificar_material_nuevo(material)
    return Response({
        "status": "success",
        "message": "Material publicado. Tus estudiantes ya pueden verlo."
                   + (f" Se avisó por correo a {avisados} estudiante(s)." if avisados else ""),
        "material": _material_a_dict(material),
    }, status=201)


@api_view(['DELETE'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def eliminar_material_api(request, material_id):
    user, error = exigir_usuario(request)
    if error:
        return error

    material = get_object_or_404(Material.objects.select_related('curso'), id=material_id)
    if not puede_gestionar_curso(user, material.curso):
        return _error("No puedes eliminar este material.", 403)

    if material.archivo:
        material.archivo.delete(save=False)
    material.delete()
    return Response({"status": "success", "message": "Material eliminado."})


@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el acceso al curso se validan dentro
def archivo_material_api(request, material_id):
    user, error = exigir_usuario(request)
    if error:
        return error

    material = get_object_or_404(Material.objects.select_related('curso'), id=material_id)
    if not material.archivo:
        return _error("Este material no tiene archivo.", 404)
    if not puede_ver_curso(user, material.curso):
        return _error("No tienes acceso a este archivo.", 403)

    respuesta = _entregar_archivo(material.archivo)
    if respuesta is None:
        return _error("El archivo no está disponible.", 404)
    return respuesta


@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def materiales_del_estudiante_api(request):
    """Cursos en los que el estudiante está matriculado, cada uno con sus materiales."""
    user, error = exigir_usuario(request)
    if error:
        return error
    if not es_estudiante(user):
        return _error("Esta sección es solo para estudiantes.", 403)

    matriculas = (
        Matricula.objects.filter(estudiante=user, status=Matricula.MatriculaStatus.APPROVED)
        .select_related('curso', 'curso__docente')
        .order_by('-fecha_matricula')
    )
    data = []
    for m in matriculas:
        c = m.curso
        curso = _curso_a_dict(c)
        curso["materiales"] = [
            _material_a_dict(x) for x in c.materiales.select_related('publicado_por')
        ]
        data.append(curso)
    return Response(data)


@api_view(['GET'])
@permission_classes([AllowAny])  # el rol se valida dentro
def listar_docentes_por_idioma(request):
    """Lista de docentes disponibles para asignar a un curso (Admin o Personal INDI)."""
    user, error = exigir_personal_indi(request)
    if error:
        return error

    idioma = request.GET.get('idioma')
    docentes = User.objects.filter(role='DOCENTE')

    data = [{
        "id": d.id,
        "first_name": d.first_name,
        "last_name": d.last_name,
        "username": d.username,
    } for d in docentes]

    return Response(data)


@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def cursos_del_docente_api(request):
    """
    Cursos del docente autenticado, con el número de estudiantes matriculados.
    El Personal INDI y el Admin ven todos los cursos activos.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    if rol_de(user) == 'DOCENTE':
        cursos = Curso.objects.filter(docente=user, activo=True)
    elif es_personal_indi(user):
        cursos = Curso.objects.filter(activo=True)
    else:
        return _error("No tienes permisos para ver estos cursos.", status.HTTP_403_FORBIDDEN)

    cursos = cursos.annotate(
        total_matriculados=models.Count(
            'matriculados',
            filter=models.Q(matriculados__status=Matricula.MatriculaStatus.APPROVED),
        )
    ).order_by('-created_at')

    data = [{
        "id": c.id,
        "nombre": c.nombre,
        "language": c.language,
        "idioma": idioma_legible(c.language),
        "level": c.level,
        "nivel": nivel_legible(c.level),
        "subnivel": c.subnivel,
        "periodo": c.periodo,
        "modalidad": c.modalidad,
        "horario": c.horario or "",
        "total_matriculados": c.total_matriculados,
        "cupos": c.cupos,
        "faltas_permitidas": c.faltas_permitidas,
    } for c in cursos]

    return Response(data, status=status.HTTP_200_OK)


@api_view(['GET', 'POST', 'DELETE'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def gestionar_evaluaciones_y_notas_api(request, curso_id):
    """
    Evaluaciones de un curso (examen parcial, final, práctica...).
    Solo el docente del curso, el Personal INDI o el Admin.
      GET    -> lista de evaluaciones y suma de pesos
      POST   -> crea una evaluación (titulo, peso en %, fecha opcional AAAA-MM-DD)
      DELETE -> elimina una evaluación que aún no tiene notas (cuerpo: {"id": ...})
    La suma de los pesos de un curso no puede superar 100%.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    curso = get_object_or_404(Curso, id=curso_id)

    es_docente_del_curso = (rol_de(user) == 'DOCENTE' and curso.docente_id == user.id)
    if not (es_docente_del_curso or es_personal_indi(user)):
        return _error("No tienes permisos sobre este curso.", status.HTTP_403_FORBIDDEN)

    def peso_total_actual():
        total = Evaluacion.objects.filter(curso=curso).aggregate(
            total=models.Sum('peso_porcentaje')
        )['total']
        return total or Decimal('0')

    def evaluacion_a_dict(ev):
        return {
            "id": ev.id,
            "titulo": ev.titulo,
            "peso": float(ev.peso_porcentaje),
            "fecha": ev.fecha_evaluacion.isoformat() if ev.fecha_evaluacion else None,
        }

    # ------------------------------------------------------
    if request.method == 'GET':
        evaluaciones = Evaluacion.objects.filter(curso=curso).order_by('id')
        return Response({
            "curso": {"id": curso.id, "nombre": curso.nombre},
            "evaluaciones": [evaluacion_a_dict(ev) for ev in evaluaciones],
            "peso_total": float(peso_total_actual()),
        }, status=status.HTTP_200_OK)

    # ------------------------------------------------------
    if request.method == 'POST':
        titulo = str(request.data.get('titulo') or '').strip()
        if not titulo:
            return _error("El título de la evaluación es obligatorio.", status.HTTP_400_BAD_REQUEST)

        try:
            peso = Decimal(str(request.data.get('peso')))
        except (InvalidOperation, TypeError, ValueError):
            return _error("El peso debe ser un número.", status.HTTP_400_BAD_REQUEST)

        if not peso.is_finite() or peso > 100:
            return _error("El peso debe estar entre 1 y 100 (en porcentaje).", status.HTTP_400_BAD_REQUEST)
        if peso < 1:
            return _error(
                "El peso se escribe en porcentaje: escribe 30 para un 30% (no 0.30). El mínimo es 1%.",
                status.HTTP_400_BAD_REQUEST
            )
        peso = peso.quantize(Decimal('0.01'))

        disponible = Decimal('100') - peso_total_actual()
        if peso > disponible:
            return _error(
                f"La suma de los pesos no puede superar 100%. Disponible: {disponible}%.",
                status.HTTP_400_BAD_REQUEST
            )

        fecha = None
        fecha_texto = request.data.get('fecha')
        if fecha_texto:
            try:
                fecha = datetime.strptime(str(fecha_texto), '%Y-%m-%d').date()
            except ValueError:
                return _error("La fecha debe tener el formato AAAA-MM-DD.", status.HTTP_400_BAD_REQUEST)

        evaluacion = Evaluacion.objects.create(
            curso=curso,
            titulo=titulo,
            peso_porcentaje=peso,
            fecha_evaluacion=fecha,
        )

        registrar_auditoria(
            user,
            "CREACIÓN DE EVALUACIÓN",
            f"Evaluación '{titulo}' ({peso}%) creada en el curso '{curso.nombre}'."
        )

        return Response({
            "status": "success",
            "message": "Evaluación creada correctamente.",
            "evaluacion": evaluacion_a_dict(evaluacion),
            "peso_total": float(peso_total_actual()),
        }, status=status.HTTP_201_CREATED)

    # ------------------------------------------------------
    # DELETE
    try:
        evaluacion = Evaluacion.objects.get(id=request.data.get('id'), curso=curso)
    except (Evaluacion.DoesNotExist, ValueError, TypeError):
        return _error("Evaluación no encontrada.", status.HTTP_404_NOT_FOUND)

    if Calificacion.objects.filter(evaluacion=evaluacion).exists():
        return _error(
            "No se puede eliminar: la evaluación ya tiene notas registradas.",
            status.HTTP_400_BAD_REQUEST
        )

    titulo = evaluacion.titulo
    evaluacion.delete()

    registrar_auditoria(
        user,
        "ELIMINACIÓN DE EVALUACIÓN",
        f"Evaluación '{titulo}' eliminada del curso '{curso.nombre}'."
    )

    return Response({
        "status": "success",
        "message": "Evaluación eliminada.",
        "peso_total": float(peso_total_actual()),
    }, status=status.HTTP_200_OK)



# ==========================================================
# NOTAS DE LOS ESTUDIANTES
# ==========================================================

# Nota mínima para aprobar un curso (escala de 0 a 20). Cámbiala aquí si el INDI usa otra.
NOTA_MINIMA_APROBATORIA = Decimal('11')


def calcular_resumen_notas(evaluaciones, notas):
    """
    evaluaciones: lista de Evaluacion del curso.
    notas: dict {evaluacion_id: Decimal} con las notas registradas de UN estudiante.
    Devuelve (acumulado, promedio_final):
      - acumulado = suma de (nota x peso / 100) de las notas ya registradas.
      - promedio_final solo existe si hay nota en TODAS las evaluaciones y los pesos suman 100%;
        en otro caso es None.
    """
    peso_total = sum((ev.peso_porcentaje for ev in evaluaciones), Decimal('0'))
    acumulado = sum(
        (notas[ev.id] * ev.peso_porcentaje / Decimal('100') for ev in evaluaciones if ev.id in notas),
        Decimal('0'),
    ).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)

    completo = (
        bool(evaluaciones)
        and peso_total == Decimal('100')
        and all(ev.id in notas for ev in evaluaciones)
    )
    return acumulado, (acumulado if completo else None)


@api_view(['GET', 'PUT'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def gestionar_notas_curso_api(request, curso_id):
    """
    Notas de los estudiantes matriculados en un curso.
    Solo el docente del curso, el Personal INDI o el Admin.
      GET -> tabla: estudiantes matriculados, nota por evaluación y promedio
      PUT -> guarda notas. Cuerpo: {"notas": [{"estudiante_id", "evaluacion_id", "nota"}]}
             Una nota vacía (null) borra la nota registrada. Todo se guarda o nada se guarda.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    curso = get_object_or_404(Curso, id=curso_id)

    es_docente_del_curso = (rol_de(user) == 'DOCENTE' and curso.docente_id == user.id)
    if not (es_docente_del_curso or es_personal_indi(user)):
        return _error("No tienes permisos sobre este curso.", status.HTTP_403_FORBIDDEN)

    evaluaciones = list(Evaluacion.objects.filter(curso=curso).order_by('id'))

    matriculas = (
        Matricula.objects
        .filter(curso=curso, status=Matricula.MatriculaStatus.APPROVED)
        .select_related('estudiante')
        .order_by('estudiante__last_name', 'estudiante__first_name')
    )

    # ------------------------------------------------------
    if request.method == 'GET':
        ids_estudiantes = [m.estudiante_id for m in matriculas]

        notas_por_estudiante = {}
        for c in Calificacion.objects.filter(evaluacion__in=evaluaciones, estudiante_id__in=ids_estudiantes):
            notas_por_estudiante.setdefault(c.estudiante_id, {})[c.evaluacion_id] = c.nota

        peso_total = sum((ev.peso_porcentaje for ev in evaluaciones), Decimal('0'))

        estudiantes = []
        for m in matriculas:
            est = m.estudiante
            notas = notas_por_estudiante.get(est.id, {})
            acumulado, promedio = calcular_resumen_notas(evaluaciones, notas)
            estudiantes.append({
                "id": est.id,
                "dni": est.username,
                "nombre": f"{est.last_name}, {est.first_name}".strip(", ") or est.username,
                "notas": {
                    str(ev.id): (float(notas[ev.id]) if ev.id in notas else None)
                    for ev in evaluaciones
                },
                "acumulado": float(acumulado),
                "promedio": float(promedio) if promedio is not None else None,
                "aprobado": (promedio >= NOTA_MINIMA_APROBATORIA) if promedio is not None else None,
            })

        return Response({
            "curso": {"id": curso.id, "nombre": curso.nombre},
            "evaluaciones": [{
                "id": ev.id,
                "titulo": ev.titulo,
                "peso": float(ev.peso_porcentaje),
                "fecha": ev.fecha_evaluacion.isoformat() if ev.fecha_evaluacion else None,
            } for ev in evaluaciones],
            "peso_total": float(peso_total),
            "nota_minima_aprobatoria": float(NOTA_MINIMA_APROBATORIA),
            "estudiantes": estudiantes,
        }, status=status.HTTP_200_OK)

    # ------------------------------------------------------
    # PUT: guardar notas
    datos = request.data.get('notas')
    if not isinstance(datos, list) or not datos:
        return _error("No se enviaron notas para guardar.", status.HTTP_400_BAD_REQUEST)
    if len(datos) > 2000:
        return _error("Demasiadas notas en una sola operación.", status.HTTP_400_BAD_REQUEST)

    evaluaciones_por_id = {ev.id: ev for ev in evaluaciones}
    dni_por_estudiante = {m.estudiante_id: m.estudiante.username for m in matriculas}

    validadas = []
    for i, item in enumerate(datos, start=1):
        if not isinstance(item, dict):
            return _error(f"Registro {i}: formato inválido.", status.HTTP_400_BAD_REQUEST)

        try:
            evaluacion_id = int(item.get('evaluacion_id'))
            estudiante_id = int(item.get('estudiante_id'))
        except (TypeError, ValueError):
            return _error(f"Registro {i}: faltan el estudiante o la evaluación.", status.HTTP_400_BAD_REQUEST)

        if evaluacion_id not in evaluaciones_por_id:
            return _error(f"Registro {i}: la evaluación no pertenece a este curso.", status.HTTP_400_BAD_REQUEST)
        if estudiante_id not in dni_por_estudiante:
            return _error(f"Registro {i}: el estudiante no está matriculado en este curso.", status.HTTP_400_BAD_REQUEST)

        nota_cruda = item.get('nota')
        if nota_cruda is None or str(nota_cruda).strip() == '':
            nota = None  # nota vacía: se borra la registrada
        else:
            try:
                nota = Decimal(str(nota_cruda))
            except (InvalidOperation, ValueError):
                return _error(f"Registro {i}: la nota debe ser un número.", status.HTTP_400_BAD_REQUEST)
            if not nota.is_finite() or nota < 0 or nota > 20:
                return _error(f"Registro {i}: la nota debe estar entre 0 y 20.", status.HTTP_400_BAD_REQUEST)
            nota = nota.quantize(Decimal('0.01'))

        validadas.append((evaluacion_id, estudiante_id, nota))

    nuevas = modificadas = borradas = 0
    cambios = []

    with transaction.atomic():
        for evaluacion_id, estudiante_id, nota in validadas:
            existente = Calificacion.objects.filter(
                evaluacion_id=evaluacion_id, estudiante_id=estudiante_id
            ).first()

            if nota is None:
                if existente:
                    existente.delete()
                    borradas += 1
                continue

            if existente is None:
                Calificacion.objects.create(
                    evaluacion_id=evaluacion_id, estudiante_id=estudiante_id, nota=nota
                )
                nuevas += 1
            elif existente.nota != nota:
                cambios.append(
                    f"{dni_por_estudiante[estudiante_id]} · "
                    f"{evaluaciones_por_id[evaluacion_id].titulo}: {existente.nota} → {nota}"
                )
                existente.nota = nota
                existente.save()
                modificadas += 1

    if nuevas or modificadas or borradas:
        detalle = (
            f"Curso '{curso.nombre}': {nuevas} nota(s) nueva(s), "
            f"{modificadas} modificada(s), {borradas} borrada(s)."
        )
        if cambios:
            detalle += " Cambios: " + "; ".join(cambios[:15]) + ("; ..." if len(cambios) > 15 else "")
        registrar_auditoria(user, "REGISTRO DE NOTAS", detalle)

    return Response({
        "status": "success",
        "message": f"Notas guardadas: {nuevas} nueva(s), {modificadas} modificada(s), {borradas} borrada(s).",
        "nuevas": nuevas,
        "modificadas": modificadas,
        "borradas": borradas,
    }, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def notas_del_estudiante_api(request):
    """
    Notas y promedio del estudiante autenticado en cada curso en el que está matriculado.
    Solo estudiantes: cada uno ve únicamente sus propias notas.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    if not es_estudiante(user):
        return _error("Solo los estudiantes pueden consultar sus notas.", status.HTTP_403_FORBIDDEN)

    matriculas = list(
        Matricula.objects
        .filter(estudiante=user, status=Matricula.MatriculaStatus.APPROVED)
        .select_related('curso', 'curso__docente')
        .order_by('-fecha_matricula')
    )
    ids_cursos = [m.curso_id for m in matriculas]

    evaluaciones_por_curso = {}
    for ev in Evaluacion.objects.filter(curso_id__in=ids_cursos).order_by('id'):
        evaluaciones_por_curso.setdefault(ev.curso_id, []).append(ev)

    notas = {
        c.evaluacion_id: c.nota
        for c in Calificacion.objects.filter(estudiante=user, evaluacion__curso_id__in=ids_cursos)
    }

    data = []
    for m in matriculas:
        curso = m.curso
        evaluaciones = evaluaciones_por_curso.get(curso.id, [])
        notas_curso = {ev.id: notas[ev.id] for ev in evaluaciones if ev.id in notas}

        acumulado, promedio = calcular_resumen_notas(evaluaciones, notas_curso)
        peso_total = sum((ev.peso_porcentaje for ev in evaluaciones), Decimal('0'))
        docente = curso.docente

        data.append({
            "curso_id": curso.id,
            "curso_nombre": curso.nombre,
            "periodo": curso.periodo,
            "idioma": idioma_legible(curso.language),
            "nivel": nivel_legible(curso.level),
            "subnivel": curso.subnivel,
            "anio": anio_del_periodo(curso.periodo),
            "docente": (docente.get_full_name() or docente.username) if docente else "Por asignar",
            "calificaciones": [{
                "evaluacion": ev.titulo,
                "peso": float(ev.peso_porcentaje),
                "nota": float(notas_curso[ev.id]) if ev.id in notas_curso else None,
                "fecha": ev.fecha_evaluacion.isoformat() if ev.fecha_evaluacion else None,
            } for ev in evaluaciones],
            "total_evaluaciones": len(evaluaciones),
            "notas_registradas": len(notas_curso),
            "peso_total": float(peso_total),
            "acumulado": float(acumulado),
            "promedio_final": float(promedio) if promedio is not None else None,
            "aprobado": (promedio >= NOTA_MINIMA_APROBATORIA) if promedio is not None else None,
            "nota_minima_aprobatoria": float(NOTA_MINIMA_APROBATORIA),
            "precio_certificado": float(settings.PRECIO_CERTIFICADO),
        })

    return Response(data, status=status.HTTP_200_OK)



@api_view(['PUT'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def editar_curso_api(request, curso_id):
    """
    Edita un curso existente: nombre, docente asignado, período, modalidad y horario.
    Solo Personal INDI o Admin. Solo se cambian los campos que se envían.
    "docente_id": null (o vacío) deja el curso sin docente.
    """
    user, error = exigir_personal_indi(request)
    if error:
        return error

    curso = get_object_or_404(Curso, id=curso_id)
    datos = request.data
    cambios = []

    if 'nombre' in datos:
        nombre = str(datos.get('nombre') or '').strip()
        if not nombre:
            return _error("El nombre del curso no puede estar vacío.", status.HTTP_400_BAD_REQUEST)
        if len(nombre) > 150:
            return _error("El nombre del curso es demasiado largo (máximo 150 caracteres).", status.HTTP_400_BAD_REQUEST)
        if nombre != curso.nombre:
            cambios.append(f"nombre: '{curso.nombre}' → '{nombre}'")
            curso.nombre = nombre

    if 'periodo' in datos:
        periodo = str(datos.get('periodo') or '').strip()
        if not periodo or len(periodo) > 20:
            return _error("El período es obligatorio (máximo 20 caracteres).", status.HTTP_400_BAD_REQUEST)
        if periodo != curso.periodo:
            cambios.append(f"período: {curso.periodo} → {periodo}")
            curso.periodo = periodo

    if 'modalidad' in datos:
        modalidad = str(datos.get('modalidad') or '').strip().upper()
        if modalidad not in Curso.Modalidad.values:
            return _error("La modalidad debe ser PRESENCIAL o VIRTUAL.", status.HTTP_400_BAD_REQUEST)
        if modalidad != curso.modalidad:
            cambios.append(f"modalidad: {curso.modalidad} → {modalidad}")
            curso.modalidad = modalidad

    if 'horario' in datos:
        horario = str(datos.get('horario') or '').strip()
        if len(horario) > 100:
            return _error("El horario es demasiado largo (máximo 100 caracteres).", status.HTTP_400_BAD_REQUEST)
        nuevo_horario = horario or None
        if nuevo_horario != curso.horario:
            cambios.append(f"horario: {curso.horario or 'sin horario'} → {nuevo_horario or 'sin horario'}")
            curso.horario = nuevo_horario

    if 'cupos' in datos:
        cupos, err = _leer_cupos(datos.get('cupos'))
        if err:
            return _error(err, status.HTTP_400_BAD_REQUEST)
        if cupos != curso.cupos:
            cambios.append(f"cupos: {curso.cupos if curso.cupos is not None else 'sin límite'} → {cupos if cupos is not None else 'sin límite'}")
            curso.cupos = cupos

    if 'faltas_permitidas' in datos:
        faltas, err = _leer_faltas(datos.get('faltas_permitidas'))
        if err:
            return _error(err, status.HTTP_400_BAD_REQUEST)
        if faltas != curso.faltas_permitidas:
            cambios.append(f"faltas permitidas: {curso.faltas_permitidas} → {faltas}")
            curso.faltas_permitidas = faltas

    if 'docente_id' in datos:
        docente_id = datos.get('docente_id')
        docente = None
        if docente_id not in (None, ''):
            try:
                docente = User.objects.filter(id=int(docente_id), role='DOCENTE', is_active=True).first()
            except (TypeError, ValueError):
                docente = None
            if docente is None:
                return _error(
                    "El docente seleccionado no existe, está inactivo o no tiene el rol de docente.",
                    status.HTTP_400_BAD_REQUEST
                )

        nuevo_id = docente.id if docente else None
        if nuevo_id != curso.docente_id:
            antes = curso.docente.username if curso.docente else 'sin asignar'
            despues = docente.username if docente else 'sin asignar'
            cambios.append(f"docente: {antes} → {despues}")
            curso.docente = docente

    if not cambios:
        return Response({
            "status": "success",
            "message": "No hubo cambios que guardar.",
            "cambios": [],
        }, status=status.HTTP_200_OK)

    curso.save()

    registrar_auditoria(
        user,
        "EDICIÓN DE CURSO",
        f"Curso #{curso.id}: " + "; ".join(cambios) + "."
    )

    return Response({
        "status": "success",
        "message": "Curso actualizado correctamente.",
        "cambios": cambios,
    }, status=status.HTTP_200_OK)



# ==========================================================
# AUXILIARES PARA SOLICITAR CERTIFICADOS DESDE UN CURSO APROBADO
# ==========================================================

NOMBRES_IDIOMAS = {
    'INGLES': 'Inglés', 'FRANCES': 'Francés', 'PORTUGUES': 'Portugués',
    'QUECHUA': 'Quechua', 'ITALIANO': 'Italiano',
}
NOMBRES_NIVELES = {'BASICO': 'Básico', 'INTERMEDIO': 'Intermedio', 'AVANZADO': 'Avanzado'}


def normalizar_codigo(texto):
    """'Inglés' -> 'INGLES', 'Básico' -> 'BASICO': sin tildes y en mayúsculas."""
    sin_tildes = ''.join(
        ch for ch in unicodedata.normalize('NFD', str(texto or ''))
        if unicodedata.category(ch) != 'Mn'
    )
    return sin_tildes.strip().upper()


def idioma_legible(valor):
    return NOMBRES_IDIOMAS.get(normalizar_codigo(valor), str(valor or ''))


def nivel_legible(valor):
    return NOMBRES_NIVELES.get(normalizar_codigo(valor), str(valor or ''))


def anio_del_periodo(periodo):
    """'2026-I' -> '2026'. Si el período no trae un año, usa el año actual."""
    coincidencia = re.search(r'(?:19|20)\d{2}', str(periodo or ''))
    return coincidencia.group(0) if coincidencia else str(timezone.now().year)


def promedio_del_estudiante_en_curso(estudiante, curso):
    """Promedio final del estudiante en el curso, o None si todavía no está completo."""
    evaluaciones = list(Evaluacion.objects.filter(curso=curso).order_by('id'))
    notas = {
        c.evaluacion_id: c.nota
        for c in Calificacion.objects.filter(estudiante=estudiante, evaluacion__curso=curso)
    }
    _, promedio = calcular_resumen_notas(evaluaciones, notas)
    return promedio



# ==========================================================
# PAGO DEL CERTIFICADO (orden de pago, voucher y revisión del INDI)
# ==========================================================

EXTENSIONES_VOUCHER = {'.jpg', '.jpeg', '.png', '.pdf'}
TAMANO_MAXIMO_VOUCHER = 5 * 1024 * 1024  # 5 MB


def _voucher_coincide_con_extension(archivo, extension):
    """Comprueba que el contenido del archivo corresponda a su extensión (PDF, PNG o JPG)."""
    cabecera = archivo.read(8)
    archivo.seek(0)
    if extension == '.pdf':
        return cabecera.startswith(b'%PDF')
    if extension == '.png':
        return cabecera.startswith(b'\x89PNG')
    if extension in ('.jpg', '.jpeg'):
        return cabecera.startswith(b'\xff\xd8')
    return False


@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el propietario se validan dentro
def orden_pago_certificado_pdf(request, request_id):
    """
    Orden de pago (Interbank) del certificado.
    Solo puede verla el estudiante dueño de la solicitud, el Personal INDI o el Admin.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    solicitud = CertificateRequest.objects.select_related('student', 'curso').filter(id=request_id).first()
    if solicitud is None:
        return Response({'message': 'Solicitud no encontrada'}, status=404)

    if solicitud.student_id != user.id and not es_personal_indi(user):
        return _error("No tienes permiso para ver esta orden de pago.", status.HTTP_403_FORBIDDEN)

    if solicitud.status == CertificateRequest.RequestStatus.REJECTED:
        return _error("Esta solicitud fue rechazada: ya no tiene una orden de pago vigente.", status.HTTP_400_BAD_REQUEST)

    estudiante = solicitud.student
    curso = solicitud.curso
    monto = solicitud.monto if solicitud.monto else settings.PRECIO_CERTIFICADO

    buffer = io.BytesIO()
    p = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    p.setFont("Helvetica-Bold", 12)
    p.drawString(100, height - 60, "UNIVERSIDAD NACIONAL DE SAN CRISTOBAL DE HUAMANGA")
    p.setFont("Helvetica", 10)
    p.drawString(100, height - 75, "Centro de Innovación, Desarrollo y Emprendimiento")
    p.drawString(100, height - 90, "Instituto De Idiomas")

    p.setFont("Helvetica-Bold", 14)
    p.drawCentredString(width / 2, height - 130, f"ORDEN DE PAGO - CERTIFICADO {solicitud.id:05d}")

    p.setFont("Helvetica-Bold", 10)
    y = height - 170

    datos = [
        ("DNI", f": {estudiante.username}"),
        ("APELLIDOS Y NOMBRES", f": {estudiante.last_name.upper()}, {estudiante.first_name.upper()}"),
        ("CURSO", f": {curso.nombre if curso else '-'}"),
        ("IDIOMA/NIVEL", f": {idioma_legible(solicitud.language)} / {nivel_legible(solicitud.level)} - {solicitud.subnivel}"),
        ("AÑO", f": {solicitud.anio}"),
        ("TASA DE PAGO", ""),
        ("  - Certificado de curso de idiomas", ""),
    ]

    for label, val in datos:
        p.drawString(100, y, label)
        if val:
            p.drawString(240, y, val)
        y -= 20

    p.setFont("Helvetica-Bold", 12)
    p.drawString(100, y - 5, "TOTAL")
    p.drawString(240, y - 5, f": S/.{monto:.2f}")

    p.setFont("Helvetica", 9)
    fecha_actual = datetime.now().strftime("%d/%m/%Y Hora: %H:%M:%S")
    p.drawString(100, y - 35, f"Fecha de impresión: {fecha_actual}")

    y_footer = y - 85
    p.setFont("Helvetica-Bold", 10)
    p.drawString(100, y_footer, "Pagar en:")
    p.setFont("Helvetica", 10)
    p.drawString(100, y_footer - 18, "AGENTES INTERBANK A NIVEL NACIONAL")
    p.setFont("Helvetica-Bold", 10)
    p.drawString(100, y_footer - 36, "DEBES PRESENTAR TU DNI Y LA ORDEN DE PAGO")
    p.drawString(100, y_footer - 54, "EN EL VOUCHER SE DEBE CONSIDERAR EL NUMERO DE DNI DEL ESTUDIANTE")

    p.setFont("Helvetica", 10)
    p.drawString(100, y_footer - 76, f"Código de Empresa: {settings.INTERBANK_CODIGO_EMPRESA}")
    p.drawString(100, y_footer - 92, f"Código de Servicio: {settings.INTERBANK_CODIGO_SERVICIO_CERTIFICADO}")

    p.setFont("Helvetica-Bold", 9)
    p.drawString(100, y_footer - 118, "NOTA: Solo pagar en las entidades antes mencionadas.")
    p.setFont("Helvetica", 9)
    p.drawString(100, y_footer - 144, "- Después de pagar, sube tu voucher en el sistema (Mis Solicitudes).")
    p.drawString(100, y_footer - 158, "- El INDI validará tu pago y emitirá tu certificado.")

    p.showPage()
    p.save()

    buffer.seek(0)
    response = HttpResponse(buffer, content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="Orden_Pago_Certificado_{solicitud.id}.pdf"'
    return response


@api_view(['POST'])
@permission_classes([AllowAny])  # la autenticación y el propietario se validan dentro
def subir_pago_certificado_api(request, request_id):
    """
    El estudiante envía el voucher de pago de SU solicitud (archivo + número de operación).
    Solo cuando la solicitud espera el pago o cuando el INDI observó el voucher anterior.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    solicitud = get_object_or_404(CertificateRequest, id=request_id)

    if solicitud.student_id != user.id:
        return _error("Solo puedes enviar el pago de tus propias solicitudes.", status.HTTP_403_FORBIDDEN)

    if solicitud.status not in (
        CertificateRequest.RequestStatus.AWAITING_PAYMENT,
        CertificateRequest.RequestStatus.PAYMENT_OBSERVED,
        CertificateRequest.RequestStatus.PAYMENT_REVIEW,  # aún no validado: puede corregir su voucher
    ):
        return _error("Esta solicitud no está esperando un voucher de pago.", status.HTTP_400_BAD_REQUEST)
    era_correccion = solicitud.status == CertificateRequest.RequestStatus.PAYMENT_REVIEW

    archivo = request.FILES.get('voucher_pago')
    if archivo is None:
        return _error("Debes adjuntar el voucher de pago.", status.HTTP_400_BAD_REQUEST)

    extension = os.path.splitext(archivo.name)[1].lower()
    if extension not in EXTENSIONES_VOUCHER:
        return _error("El voucher debe ser una imagen (JPG o PNG) o un PDF.", status.HTTP_400_BAD_REQUEST)
    if archivo.size > TAMANO_MAXIMO_VOUCHER:
        return _error("El archivo es demasiado grande (máximo 5 MB).", status.HTTP_400_BAD_REQUEST)
    if not _voucher_coincide_con_extension(archivo, extension):
        return _error("El archivo no es un voucher válido (imagen JPG, PNG o PDF).", status.HTTP_400_BAD_REQUEST)

    numero = re.sub(r'[\s-]', '', str(request.data.get('numero_operacion') or '')).upper()
    if not re.fullmatch(r'[A-Z0-9]{4,30}', numero):
        return _error(
            "Ingresa el número de operación del voucher (de 4 a 30 letras o números, sin espacios).",
            status.HTTP_400_BAD_REQUEST
        )

    en_uso = (
        CertificateRequest.objects
        .filter(numero_operacion=numero)
        .exclude(id=solicitud.id)
        .filter(status__in=[
            CertificateRequest.RequestStatus.PAYMENT_REVIEW,
            CertificateRequest.RequestStatus.IN_PROCESS,
            CertificateRequest.RequestStatus.APPROVED,
        ])
        .exists()
    )
    if en_uso:
        return _error("Ese número de operación ya fue usado en otra solicitud.", status.HTTP_400_BAD_REQUEST)

    # Si había un voucher anterior (observado), se reemplaza
    if solicitud.voucher_pago:
        solicitud.voucher_pago.delete(save=False)
    solicitud.voucher_pago.save(
        f"solicitud-{solicitud.id}-{uuid.uuid4().hex[:8]}{extension}", archivo, save=False
    )

    solicitud.numero_operacion = numero
    solicitud.pago_enviado_en = timezone.now()
    solicitud.pago_validado = False
    solicitud.comentarios_pago = ''
    solicitud.status = CertificateRequest.RequestStatus.PAYMENT_REVIEW
    solicitud.save()

    registrar_auditoria(
        user,
        "PAGO DE CERTIFICADO CORREGIDO" if era_correccion else "PAGO DE CERTIFICADO ENVIADO",
        f"Solicitud #{solicitud.id}: voucher con operación {numero} "
        + ("reemplazado por el estudiante antes de la validación." if era_correccion else "enviado a revisión.")
    )

    return Response({
        "status": "success",
        "message": "Corrección enviada. El INDI revisará tu nuevo voucher." if era_correccion
                   else "Voucher enviado. El INDI revisará tu pago.",
    }, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([AllowAny])  # la autenticación y el propietario se validan dentro
def cancelar_solicitud_certificado_api(request, request_id):
    """
    El estudiante cancela una solicitud de certificado hecha por error (curso equivocado).
    Solo si aún no tiene un pago en revisión ni validado.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    solicitud = get_object_or_404(CertificateRequest, id=request_id)
    if solicitud.student_id != user.id:
        return _error("Solo puedes cancelar tus propias solicitudes.", status.HTTP_403_FORBIDDEN)
    if solicitud.status not in (
        CertificateRequest.RequestStatus.AWAITING_PAYMENT,
        CertificateRequest.RequestStatus.PAYMENT_OBSERVED,
    ):
        return _error(
            "Solo puedes cancelar solicitudes que aún no tienen un pago en revisión o validado. "
            "Si necesitas ayuda, comunícate con el INDI.",
            status.HTTP_400_BAD_REQUEST
        )

    nombre = solicitud.curso.nombre if solicitud.curso else 'certificado'
    if solicitud.voucher_pago:
        try:
            solicitud.voucher_pago.delete(save=False)
        except Exception:
            pass
    registrar_auditoria(
        user, "CANCELACIÓN DE SOLICITUD DE CERTIFICADO",
        f"El estudiante {user.username} canceló su solicitud #{solicitud.id} ({nombre})."
    )
    solicitud.delete()
    return Response({"status": "success", "message": "Solicitud cancelada."})


@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el propietario se validan dentro
def ver_voucher_certificado_api(request, request_id):
    """
    Entrega el archivo del voucher. Solo el estudiante dueño, el Personal INDI o el Admin.
    Los vouchers no tienen dirección pública: solo se pueden ver por aquí.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    solicitud = CertificateRequest.objects.filter(id=request_id).first()
    if solicitud is None or not solicitud.voucher_pago:
        return Response({'message': 'No hay voucher para esta solicitud.'}, status=404)

    if solicitud.student_id != user.id and not es_personal_indi(user):
        return _error("No tienes permiso para ver este voucher.", status.HTTP_403_FORBIDDEN)

    nombre = solicitud.voucher_pago.name
    tipo = mimetypes.guess_type(nombre)[0] or 'application/octet-stream'

    respuesta = FileResponse(solicitud.voucher_pago.open('rb'), content_type=tipo)
    respuesta['Content-Disposition'] = f'inline; filename="{os.path.basename(nombre)}"'
    respuesta['Cache-Control'] = 'private, no-store'
    return respuesta


@api_view(['POST'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def revisar_pago_certificado_api(request, request_id):
    """
    El Personal INDI (o Admin) revisa el voucher de una solicitud.
      accion = "aprobar" -> el pago queda validado y el certificado pasa a "En trámite".
      accion = "observar" -> el estudiante debe subir otro voucher (se exige un motivo).
    """
    user, error = exigir_personal_indi(request)
    if error:
        return error

    solicitud = get_object_or_404(CertificateRequest, id=request_id)

    if solicitud.status != CertificateRequest.RequestStatus.PAYMENT_REVIEW:
        return _error("Esta solicitud no tiene un pago pendiente de revisión.", status.HTTP_400_BAD_REQUEST)

    accion = str(request.data.get('accion') or '').strip().lower()
    if accion not in ('aprobar', 'observar'):
        return _error("La acción debe ser 'aprobar' u 'observar'.", status.HTTP_400_BAD_REQUEST)

    comentarios = str(request.data.get('comments') or '').strip()
    if accion == 'observar' and not comentarios:
        return _error("Indica el motivo de la observación para que el estudiante pueda corregirlo.", status.HTTP_400_BAD_REQUEST)

    solicitud.pago_revisado_por = user
    solicitud.pago_revisado_en = timezone.now()

    if accion == 'aprobar':
        solicitud.status = CertificateRequest.RequestStatus.IN_PROCESS
        solicitud.pago_validado = True
        solicitud.comentarios_pago = ''
        mensaje = "Pago validado. La solicitud pasó a 'En trámite'."
        accion_log = "PAGO DE CERTIFICADO VALIDADO"
        detalle = f"Solicitud #{solicitud.id}: pago validado (operación {solicitud.numero_operacion})."
    else:
        solicitud.status = CertificateRequest.RequestStatus.PAYMENT_OBSERVED
        solicitud.pago_validado = False
        solicitud.comentarios_pago = comentarios
        mensaje = "Pago observado. El estudiante deberá subir otro voucher."
        accion_log = "PAGO DE CERTIFICADO OBSERVADO"
        detalle = f"Solicitud #{solicitud.id}: pago observado (operación {solicitud.numero_operacion}). Motivo: {comentarios}"

    solicitud.save()
    registrar_auditoria(user, accion_log, detalle)

    if accion == 'observar':
        _, nota_correo = notificar_pago_observado(solicitud)
        mensaje = f"{mensaje} {nota_correo}"
    else:
        _, nota_correo = notificar_pago_validado(solicitud)
        mensaje = f"{mensaje} {nota_correo}"

    return Response({"status": "success", "message": mensaje}, status=status.HTTP_200_OK)



# ==========================================================
# PLAZO DE ENTREGA (días hábiles)
# ==========================================================

ZONA_PERU = dt_timezone(timedelta(hours=-5))  # Perú está en UTC-5 todo el año


def hoy_peru():
    return datetime.now(ZONA_PERU).date()


def _feriados():
    """Feriados configurados en settings.FERIADOS (formato AAAA-MM-DD). Los inválidos se ignoran."""
    resultado = set()
    for texto in getattr(settings, 'FERIADOS', []):
        try:
            resultado.add(date.fromisoformat(str(texto).strip()))
        except ValueError:
            continue
    return resultado


def sumar_dias_habiles(inicio, dias):
    """Suma días hábiles (lunes a viernes, sin feriados) a una fecha."""
    feriados = _feriados()
    actual = inicio
    restantes = dias
    while restantes > 0:
        actual += timedelta(days=1)
        if actual.weekday() < 5 and actual not in feriados:
            restantes -= 1
    return actual


def fecha_limite_entrega(solicitud):
    """
    Fecha límite para entregar el certificado, contada desde que el estudiante envió su voucher.
    Solo aplica mientras el INDI tiene algo pendiente (pago en revisión o listo para emitir).
    """
    if solicitud.status not in (
        CertificateRequest.RequestStatus.PAYMENT_REVIEW,
        CertificateRequest.RequestStatus.IN_PROCESS,
    ) or not solicitud.pago_enviado_en:
        return None
    inicio = solicitud.pago_enviado_en.astimezone(ZONA_PERU).date()
    return sumar_dias_habiles(inicio, settings.PLAZO_ENTREGA_DIAS_HABILES)


# ==========================================================
# CORREOS DEL TRÁMITE
# ==========================================================

def correo_del_usuario(user):
    """Correo al que se le escribe al usuario (el personal; si no hay, el institucional)."""
    return (getattr(user, 'email', '') or getattr(user, 'correo_institucional', '') or '').strip()


def destinatarios_del_usuario(user):
    """
    Todos los correos a los que se avisa al usuario: el personal y, si lo tiene, el institucional
    (sin repetir). Lista vacía si no tiene ninguno.
    """
    lista = []
    for valor in (getattr(user, 'email', ''), getattr(user, 'correo_institucional', '')):
        valor = (valor or '').strip().lower()
        if valor and valor not in lista:
            lista.append(valor)
    return lista


def codigo_certificado_de(solicitud):
    """Código del certificado de una solicitud (misma fórmula que usa la emisión)."""
    return f"INDI-2026-{str(solicitud.language)[:3].upper()}-{solicitud.id:06d}"


def _cuerpo_correo(titulo, parrafos, boton=None):
    """Devuelve (texto, html) del correo con el formato del INDI."""
    texto = titulo + "\n\n" + "\n\n".join(parrafos)
    if boton:
        texto += f"\n\n{boton[0]}: {boton[1]}"
    texto += "\n\n--\nInstituto de Idiomas (INDI) - UNSCH\nEste es un mensaje automático; por favor no respondas a este correo."

    parrafos_html = "".join(
        f'<p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#334155">{escape(p)}</p>'
        for p in parrafos
    )
    boton_html = ""
    if boton:
        boton_html = (
            f'<p style="margin:22px 0 6px 0"><a href="{escape(boton[1])}" '
            'style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;'
            f'padding:11px 22px;border-radius:8px;font-weight:bold;font-size:14px">{escape(boton[0])}</a></p>'
        )
    html = (
        '<div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;padding:24px">'
        '<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;'
        'border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">'
        '<tr><td style="background:#1e293b;padding:16px 24px;color:#ffffff;font-size:13px;font-weight:bold;'
        'letter-spacing:.5px">INDI · UNIVERSIDAD NACIONAL DE SAN CRISTÓBAL DE HUAMANGA</td></tr>'
        '<tr><td style="padding:24px">'
        f'<h2 style="margin:0 0 16px 0;font-size:18px;color:#0f172a">{escape(titulo)}</h2>'
        f'{parrafos_html}{boton_html}'
        '</td></tr>'
        '<tr><td style="padding:14px 24px;background:#f8fafc;font-size:11px;color:#94a3b8">'
        'Este es un mensaje automático; por favor no respondas a este correo.</td></tr>'
        '</table></div>'
    )
    return texto, html


def enviar_correo_tramite(destinatario, asunto, titulo, parrafos, boton=None, adjuntos=None):
    """
    Envía un correo con el formato del INDI. Devuelve (True, '') o (False, motivo).
    NUNCA lanza excepciones: un problema con el correo no debe interrumpir el trámite.
    """
    try:
        texto, html = _cuerpo_correo(titulo, parrafos, boton)
        para = list(destinatario) if isinstance(destinatario, (list, tuple)) else [destinatario]
        mensaje = EmailMultiAlternatives(asunto, texto, settings.DEFAULT_FROM_EMAIL, para)
        mensaje.attach_alternative(html, "text/html")
        for nombre, contenido, tipo in (adjuntos or []):
            mensaje.attach(nombre, contenido, tipo)
        mensaje.send(fail_silently=False)
        return True, ''
    except Exception as e:
        print(f"No se pudo enviar el correo a {destinatario}: {e}")
        return False, str(e)


def _enlace_portal(ruta):
    return f"{str(settings.FRONTEND_URL).rstrip('/')}{ruta}"


def _resultado_aviso(destinatario, ok, motivo):
    if not destinatario:
        return False, "(El estudiante no tiene un correo registrado, por eso no se le pudo avisar.)"
    if ok:
        return True, "Se avisó al estudiante por correo."
    return False, f"(No se pudo enviar el correo al estudiante: {motivo})"


def notificar_pago_observado(solicitud):
    """Avisa al estudiante que su pago fue observado y qué debe corregir."""
    estudiante = solicitud.student
    destinatario = destinatarios_del_usuario(estudiante)
    if not destinatario:
        return _resultado_aviso('', False, '')

    ok, motivo = enviar_correo_tramite(
        destinatario,
        f"Tu pago del certificado fue observado (solicitud #{solicitud.id})",
        "Tu pago fue observado",
        [
            f"Hola {estudiante.get_full_name() or estudiante.username},",
            f"El INDI revisó el voucher de tu solicitud #{solicitud.id} "
            f"({solicitud.curso.nombre if solicitud.curso else 'certificado'}) y encontró un problema.",
            f"Motivo: {solicitud.comentarios_pago}",
            "Ingresa a tu portal, corrige el problema y vuelve a subir tu voucher para continuar con el trámite.",
        ],
        boton=("Ir a mis solicitudes", _enlace_portal('/estudiante/solicitudes')),
    )
    return _resultado_aviso(destinatario, ok, motivo)


def notificar_rechazo(solicitud):
    """Avisa al estudiante que su solicitud fue rechazada y por qué."""
    estudiante = solicitud.student
    destinatario = destinatarios_del_usuario(estudiante)
    if not destinatario:
        return _resultado_aviso('', False, '')

    ok, motivo = enviar_correo_tramite(
        destinatario,
        f"Tu solicitud de certificado fue rechazada (solicitud #{solicitud.id})",
        "Tu solicitud fue rechazada",
        [
            f"Hola {estudiante.get_full_name() or estudiante.username},",
            f"El INDI rechazó tu solicitud #{solicitud.id} "
            f"({solicitud.curso.nombre if solicitud.curso else 'certificado'}).",
            f"Motivo: {solicitud.review_comments}",
            "Puedes revisar el detalle en tu portal y reenviar la solicitud si corresponde.",
        ],
        boton=("Ir a mis solicitudes", _enlace_portal('/estudiante/solicitudes')),
    )
    return _resultado_aviso(destinatario, ok, motivo)


def notificar_certificado_emitido(solicitud, certificado, actor):
    """
    Envía al estudiante su certificado en PDF. Devuelve (enviado, nota para el INDI).
    Si falla el correo, el certificado igual queda emitido y se puede reenviar después.
    """
    estudiante = solicitud.student
    destinatario = destinatarios_del_usuario(estudiante)
    if not destinatario:
        return False, "El estudiante no tiene un correo registrado: podrá descargarlo desde su portal."

    adjuntos = []
    try:
        pdf = generar_pdf_certificado(certificado).getvalue()
        adjuntos.append((f"Certificado_{certificado.certificate_code}.pdf", pdf, "application/pdf"))
    except Exception as e:
        print(f"No se pudo generar el PDF para el correo: {e}")

    parrafos = [
        f"Hola {estudiante.get_full_name() or estudiante.username},",
        f"Tu certificado del curso {solicitud.curso.nombre if solicitud.curso else ''} ya está listo."
        + (" Lo encuentras adjunto a este correo en formato PDF." if adjuntos else " Puedes descargarlo desde tu portal."),
        f"Código del certificado: {certificado.certificate_code}",
        "Cualquier persona puede comprobar su autenticidad con ese código o escaneando el código QR del documento.",
    ]
    ok, motivo = enviar_correo_tramite(
        destinatario,
        f"Tu certificado del INDI ya está listo ({certificado.certificate_code})",
        "Tu certificado está listo",
        parrafos,
        boton=("Verificar mi certificado", _enlace_portal(f"/verificar/{certificado.certificate_code}")),
        adjuntos=adjuntos,
    )

    if not ok:
        return False, f"(No se pudo enviar el correo al estudiante: {motivo}. Puedes reenviarlo desde la bandeja.)"

    solicitud.certificado_enviado_en = timezone.now()
    solicitud.save(update_fields=['certificado_enviado_en'])
    registrar_auditoria(
        actor,
        "CERTIFICADO ENVIADO POR CORREO",
        f"Certificado {certificado.certificate_code} enviado a {', '.join(destinatario)}.",
        certificate=certificado,
    )
    return True, f"Se envió al correo del estudiante ({', '.join(destinatario)})."


def _enviar_lote(lote):
    for destinatarios, asunto, titulo, parrafos, boton in lote:
        enviar_correo_tramite(destinatarios, asunto, titulo, parrafos, boton=boton)


def enviar_lote(lote):
    """
    Envía varios avisos sin hacer esperar a quien los provocó (por ejemplo, un docente que publica
    material para 30 estudiantes). Con settings.CORREO_EN_SEGUNDO_PLANO = False se envía en el acto.
    """
    if not lote:
        return
    if getattr(settings, 'CORREO_EN_SEGUNDO_PLANO', True):
        threading.Thread(target=_enviar_lote, args=(lote,), daemon=True).start()
    else:
        _enviar_lote(lote)


def _nombre(user):
    return user.get_full_name() or user.username


def notificar_pago_validado(solicitud):
    """Avisa que el INDI validó el pago del certificado."""
    estudiante = solicitud.student
    destinatario = destinatarios_del_usuario(estudiante)
    if not destinatario:
        return _resultado_aviso('', False, '')
    ok, motivo = enviar_correo_tramite(
        destinatario,
        f"Tu pago fue validado (solicitud #{solicitud.id})",
        "Pago validado",
        [
            f"Hola {_nombre(estudiante)},",
            f"El INDI validó tu pago de la solicitud #{solicitud.id} "
            f"({solicitud.curso.nombre if solicitud.curso else 'certificado'}).",
            "Tu certificado ya está en trámite. Te avisaremos por este medio cuando esté emitido.",
        ],
        boton=("Ver mi solicitud", _enlace_portal('/estudiante/solicitudes')),
    )
    return _resultado_aviso(destinatario, ok, motivo)


def notificar_matricula_aprobada(solicitud):
    """Avisa que el pago de la matrícula fue validado y que ya figura como matriculado."""
    estudiante = solicitud.estudiante
    destinatario = destinatarios_del_usuario(estudiante)
    if not destinatario:
        return _resultado_aviso('', False, '')
    curso = solicitud.curso
    detalle = []
    if curso:
        detalle.append(f"Curso: {curso.nombre} ({curso.periodo})")
        detalle.append(f"Modalidad: {'Virtual' if curso.modalidad == 'VIRTUAL' else 'Presencial'}")
        if curso.horario:
            detalle.append(f"Horario: {curso.horario}")
    ok, motivo = enviar_correo_tramite(
        destinatario,
        "Tu matrícula fue aprobada",
        "Matrícula aprobada",
        [
            f"Hola {_nombre(estudiante)},",
            "El INDI validó tu pago y ya estás matriculado.",
            " · ".join(detalle) if detalle else "Revisa los detalles en tu portal.",
            "Desde tu portal puedes ver los materiales del curso, tus notas y tus órdenes de pago.",
        ],
        boton=("Ir a mi portal", _enlace_portal('/estudiante/materiales')),
    )
    return _resultado_aviso(destinatario, ok, motivo)


def notificar_matricula_rechazada(solicitud):
    """Avisa que la matrícula fue rechazada y explica el motivo."""
    estudiante = solicitud.estudiante
    destinatario = destinatarios_del_usuario(estudiante)
    if not destinatario:
        return _resultado_aviso('', False, '')
    ok, motivo = enviar_correo_tramite(
        destinatario,
        "Tu matrícula fue rechazada",
        "Matrícula rechazada",
        [
            f"Hola {_nombre(estudiante)},",
            f"El INDI rechazó tu inscripción en {solicitud.curso.nombre if solicitud.curso else 'el curso'}.",
            f"Motivo: {solicitud.motivo_rechazo}",
            "Si corresponde, puedes volver a inscribirte y subir un voucher correcto desde tu portal.",
        ],
        boton=("Ir a Inscripción a Cursos", _enlace_portal('/estudiante/matricula')),
    )
    return _resultado_aviso(destinatario, ok, motivo)


def notificar_material_nuevo(material):
    """Avisa (en segundo plano) a los estudiantes matriculados de que hay material nuevo."""
    curso = material.curso
    lote = []
    matriculas = Matricula.objects.filter(
        curso=curso, status=Matricula.MatriculaStatus.APPROVED
    ).select_related('estudiante')
    for mat in matriculas:
        est = mat.estudiante
        destinatario = destinatarios_del_usuario(est)
        if not destinatario:
            continue
        lote.append((
            destinatario,
            f"Nuevo material en {curso.nombre}",
            "Nuevo material en tu curso",
            [
                f"Hola {_nombre(est)},",
                f"Tu docente publicó \"{material.titulo}\" en {curso.nombre}.",
                f"Tipo: {material.get_tipo_display()}"
                + (f" · Semana {material.semana}" if material.semana else ""),
            ],
            ("Ver materiales", _enlace_portal('/estudiante/materiales')),
        ))
    enviar_lote(lote)
    return len(lote)


# ---------- Recuperar contraseña (olvidó su clave) ----------

DURACION_ENLACE_CLAVE = 60 * 60  # el enlace vale 1 hora


def _firma_clave(user):
    """Huella de la clave actual: al cambiarla, el enlace deja de servir (un solo uso)."""
    return user.password[-12:]


def _validar_clave_nueva(user, nueva, confirmar, actual=None):
    if len(nueva) < 8:
        return "La nueva contraseña debe tener al menos 8 caracteres."
    if nueva.isdigit():
        return "La nueva contraseña no puede ser solo números."
    if nueva == user.username:
        return "La nueva contraseña no puede ser igual a tu usuario."
    if actual is not None and nueva == actual:
        return "La nueva contraseña debe ser distinta de la actual."
    if nueva != confirmar:
        return "La confirmación no coincide con la nueva contraseña."
    return ''


@api_view(['POST'])
@permission_classes([AllowAny])
def olvide_password_api(request):
    """
    Pide un enlace para crear una contraseña nueva. Recibe el DNI (o el correo personal).
    SIEMPRE responde lo mismo, exista o no la cuenta, para no revelar quién está registrado.
    """
    respuesta = Response({
        "status": "success",
        "message": "Si los datos coinciden con una cuenta, enviamos un enlace al correo personal registrado. "
                   "Revisa también tu carpeta de spam. El enlace vale 1 hora.",
    })

    valor = str(request.data.get('username') or '').strip()
    if not valor:
        return _error("Escribe tu DNI o tu correo personal.", status.HTTP_400_BAD_REQUEST)

    if '@' in valor:
        candidatos = list(User.objects.filter(email__iexact=valor, is_active=True)[:2])
        user = candidatos[0] if len(candidatos) == 1 else None
    else:
        user = User.objects.filter(username=valor, is_active=True).first()

    if user is None or not (user.email or '').strip():
        return respuesta

    # Máximo un envío por minuto por cuenta
    if not cache.add(f"olvide_clave:{user.id}", 1, 60):
        return respuesta

    token = signing.dumps({"u": user.id, "f": _firma_clave(user)}, salt="restablecer-clave")
    enviar_correo_tramite(
        user.email.strip(),
        "Restablece tu contraseña del sistema del INDI",
        "Restablecer contraseña",
        [
            f"Hola {_nombre(user)},",
            "Recibimos una solicitud para crear una contraseña nueva en tu cuenta.",
            "El enlace vale 1 hora y solo se puede usar una vez. Si no fuiste tú, ignora este mensaje: "
            "tu contraseña actual no cambia.",
        ],
        boton=("Crear nueva contraseña", _enlace_portal(f"/restablecer?token={token}")),
    )
    registrar_auditoria(user, "RECUPERACIÓN DE CONTRASEÑA SOLICITADA", f"Se envió un enlace a {user.email}.")
    return respuesta


@api_view(['POST'])
@permission_classes([AllowAny])
def restablecer_password_api(request):
    """Crea la contraseña nueva usando el enlace recibido por correo."""
    token = str(request.data.get('token') or '')
    nueva = str(request.data.get('nueva') or '')
    confirmar = str(request.data.get('confirmar') or '')
    invalido = "El enlace no es válido o ya venció. Pide uno nuevo desde '¿Olvidaste tu contraseña?'."

    try:
        datos = signing.loads(token, salt="restablecer-clave", max_age=DURACION_ENLACE_CLAVE)
    except signing.BadSignature:
        return _error(invalido, status.HTTP_400_BAD_REQUEST)

    user = User.objects.filter(id=datos.get('u'), is_active=True).first()
    if user is None or datos.get('f') != _firma_clave(user):
        return _error(invalido, status.HTTP_400_BAD_REQUEST)

    problema = _validar_clave_nueva(user, nueva, confirmar)
    if problema:
        return _error(problema, status.HTTP_400_BAD_REQUEST)

    user.set_password(nueva)
    user.save(update_fields=['password'])
    registrar_auditoria(user, "CONTRASEÑA RESTABLECIDA POR CORREO", f"El usuario {user.username} creó una contraseña nueva.")
    return Response({"status": "success", "message": "Listo. Ya puedes iniciar sesión con tu nueva contraseña."})



@api_view(['POST'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def reenviar_correo_certificado_api(request, request_id):
    """El Personal INDI (o Admin) reenvía por correo un certificado ya emitido."""
    user, error = exigir_personal_indi(request)
    if error:
        return error

    solicitud = get_object_or_404(CertificateRequest, id=request_id)
    if solicitud.status != CertificateRequest.RequestStatus.APPROVED:
        return _error("Solo se puede reenviar el correo de un certificado ya emitido.", status.HTTP_400_BAD_REQUEST)

    certificado = Certificate.objects.filter(certificate_code=codigo_certificado_de(solicitud)).first()
    if certificado is None:
        return _error("No se encontró el certificado de esta solicitud.", status.HTTP_404_NOT_FOUND)
    if certificado.status == Certificate.Status.REVOKED:
        return _error("El certificado fue revocado: no se puede reenviar.", status.HTTP_400_BAD_REQUEST)

    enviado, nota = notificar_certificado_emitido(solicitud, certificado, user)
    if not enviado:
        return _error(nota, status.HTTP_400_BAD_REQUEST)

    return Response({"status": "success", "message": nota}, status=status.HTTP_200_OK)


@api_view(['GET', 'PUT'])
@permission_classes([AllowAny])  # la autenticación se valida dentro
def mi_correo_api(request):
    """
    El usuario consulta o actualiza SU correo. Ahí se le envía el certificado y los avisos del trámite.
    """
    user, error = exigir_usuario(request)
    if error:
        return error

    if request.method == 'GET':
        correo = correo_del_usuario(user)
        return Response({"correo": correo, "tiene_correo": bool(correo)}, status=status.HTTP_200_OK)

    correo = str(request.data.get('correo') or '').strip().lower()
    try:
        validate_email(correo)
    except ValidationError:
        return _error("Ingresa un correo electrónico válido.", status.HTTP_400_BAD_REQUEST)

    user.email = correo
    user.save(update_fields=['email'])
    return Response({
        "status": "success",
        "message": "Correo actualizado.",
        "correo": correo,
        "tiene_correo": True,
    }, status=status.HTTP_200_OK)


# ==========================================================
# VENCIMIENTO DE LA RESERVA (ampliar plazo)
# ==========================================================

@api_view(['POST'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def ampliar_reserva_api(request, solicitud_id):
    """
    El INDI amplía el plazo de pago de una orden aún sin pagar (excepciones).
    Cuerpo: {"dias": 5}  (1 a 30). El nuevo plazo se cuenta desde hoy o desde el vencimiento, lo que sea mayor.
    """
    user, error = exigir_personal_indi(request)
    if error:
        return error

    solicitud = get_object_or_404(SolicitudMatricula, id=solicitud_id)
    if solicitud.estado != 'ESPERANDO_PAGO':
        return _error("Solo se puede ampliar el plazo de una orden que aún no tiene voucher.", status.HTTP_400_BAD_REQUEST)

    try:
        dias = int(request.data.get('dias', SolicitudMatricula.RESERVA_DIAS))
    except (TypeError, ValueError):
        return _error("Indica los días como un número entero.", status.HTTP_400_BAD_REQUEST)
    if dias < 1 or dias > 30:
        return _error("El plazo se puede ampliar entre 1 y 30 días.", status.HTTP_400_BAD_REQUEST)

    base = max(timezone.now(), solicitud.vence_en or timezone.now())
    solicitud.reserva_hasta = base + timedelta(days=dias)
    solicitud.save(update_fields=['reserva_hasta'])
    registrar_auditoria(
        user, "AMPLIACIÓN DE PLAZO DE RESERVA",
        f"Solicitud de matrícula #{solicitud.id} ({solicitud.estudiante.username}): plazo ampliado {dias} día(s), "
        f"vence el {timezone.localtime(solicitud.reserva_hasta).strftime('%d/%m/%Y')}."
    )
    return Response({
        "status": "success",
        "message": f"Plazo ampliado {dias} día(s). Vence el {timezone.localtime(solicitud.reserva_hasta).strftime('%d/%m/%Y')}.",
        "reserva_vence": solicitud.reserva_hasta.isoformat(),
    })


# ==========================================================
# ASISTENCIA
# ==========================================================

def _riesgo_asistencia(faltas, permitidas):
    """AL_DIA / ATENCION (llegó al límite de faltas toleradas) / EN_RIESGO (superó el límite)."""
    if faltas > permitidas:
        return 'EN_RIESGO'
    if faltas > 0 and faltas == permitidas:
        return 'ATENCION'
    return 'AL_DIA'


_ORDEN_RIESGO = {'AL_DIA': 0, 'ATENCION': 1, 'EN_RIESGO': 2}


def _resumen_asistencia(curso, estudiante_ids):
    """Resumen por estudiante: presentes, faltas sin justificar, justificadas, % y riesgo."""
    clases = (Asistencia.objects.filter(curso=curso).values('fecha').distinct().count())
    conteo = {}
    for a in Asistencia.objects.filter(curso=curso, estudiante_id__in=estudiante_ids):
        c = conteo.setdefault(a.estudiante_id, {'PRESENTE': 0, 'FALTA': 0, 'JUSTIFICADA': 0})
        c[a.estado] += 1
    resumen = {}
    for eid in estudiante_ids:
        c = conteo.get(eid, {'PRESENTE': 0, 'FALTA': 0, 'JUSTIFICADA': 0})
        total = c['PRESENTE'] + c['FALTA'] + c['JUSTIFICADA']
        resumen[eid] = {
            "presentes": c['PRESENTE'],
            "faltas": c['FALTA'],
            "justificadas": c['JUSTIFICADA'],
            "registradas": total,
            "porcentaje": round(100 * (c['PRESENTE'] + c['JUSTIFICADA']) / total) if total else None,
            "riesgo": _riesgo_asistencia(c['FALTA'], curso.faltas_permitidas),
        }
    return clases, resumen


def _aviso_asistencia(estudiante, curso, faltas, riesgo):
    """Arma el correo de aviso (o None si no corresponde)."""
    destinatario = destinatarios_del_usuario(estudiante)
    if not destinatario or riesgo == 'AL_DIA':
        return None
    permitidas = curso.faltas_permitidas
    if riesgo == 'ATENCION':
        asunto = f"Aviso de asistencia: llegaste al límite de faltas en {curso.nombre}"
        titulo = "Llegaste al límite de faltas"
        parrafos = [
            f"Hola {_nombre(estudiante)},",
            f"Tienes {faltas} falta(s) sin justificar en {curso.nombre}. El INDI tolera {permitidas}.",
            "Una falta más sin justificar te pondría en riesgo de desaprobar el curso. "
            "Si tuviste un motivo, preséntalo a tu docente o al INDI.",
        ]
    else:
        asunto = f"Posible desaprobación por inasistencia en {curso.nombre}"
        titulo = "Posible desaprobación por inasistencia"
        parrafos = [
            f"Hola {_nombre(estudiante)},",
            f"Superaste las {permitidas} faltas toleradas en {curso.nombre} (tienes {faltas} sin justificar).",
            "Si no presentas una justificación, podrías desaprobar el curso por inasistencia. "
            "Comunícate con tu docente o con el INDI lo antes posible.",
        ]
    return (destinatario, asunto, titulo, parrafos, ("Ver mi asistencia", _enlace_portal('/estudiante/asistencia')))


def _fecha_asistencia(texto):
    try:
        return datetime.strptime(str(texto), '%Y-%m-%d').date()
    except (TypeError, ValueError):
        return None


@api_view(['GET', 'PUT'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def asistencia_curso_api(request, curso_id):
    """
    Asistencia de un curso, por día de clase. Solo el docente del curso, el Personal INDI o el Admin.
      GET ?fecha=AAAA-MM-DD -> estudiantes matriculados con su estado ese día y su resumen acumulado
      PUT {"fecha": "AAAA-MM-DD", "registros": [{"estudiante_id", "estado", "observacion"}]}
          estado: PRESENTE | FALTA | JUSTIFICADA (la justificada exige una observación).
    Al pasar el límite de faltas sin justificar, se avisa al estudiante por correo.
    """
    user, error = exigir_usuario(request)
    if error:
        return error
    curso = get_object_or_404(Curso, id=curso_id)
    if not ((rol_de(user) == 'DOCENTE' and curso.docente_id == user.id) or es_personal_indi(user)):
        return _error("No tienes permisos sobre este curso.", status.HTTP_403_FORBIDDEN)

    hoy = timezone.localdate()
    matriculas = list(
        Matricula.objects.filter(curso=curso, status=Matricula.MatriculaStatus.APPROVED)
        .select_related('estudiante').order_by('estudiante__last_name', 'estudiante__first_name')
    )
    ids = [m.estudiante_id for m in matriculas]

    if request.method == 'PUT':
        fecha = _fecha_asistencia(request.data.get('fecha'))
        if fecha is None:
            return _error("Indica la fecha de la clase (AAAA-MM-DD).", status.HTTP_400_BAD_REQUEST)
        if fecha > hoy:
            return _error("No se puede registrar asistencia de una fecha futura.", status.HTTP_400_BAD_REQUEST)
        registros = request.data.get('registros')
        if not isinstance(registros, list) or not registros:
            return _error("No se enviaron registros de asistencia.", status.HTTP_400_BAD_REQUEST)

        limpios = {}
        for item in registros:
            try:
                eid = int(item.get('estudiante_id'))
            except (TypeError, ValueError, AttributeError):
                return _error("Registro de asistencia no válido.", status.HTTP_400_BAD_REQUEST)
            if eid not in ids:
                return _error("Hay un estudiante que no está matriculado en este curso.", status.HTTP_400_BAD_REQUEST)
            estado = str(item.get('estado') or '').upper()
            if estado not in Asistencia.Estado.values:
                return _error("Estado de asistencia no válido.", status.HTTP_400_BAD_REQUEST)
            obs = str(item.get('observacion') or '').strip()
            if len(obs) > 200:
                return _error("La observación es demasiado larga (máximo 200 caracteres).", status.HTTP_400_BAD_REQUEST)
            if estado == 'JUSTIFICADA' and len(obs) < 3:
                return _error("Para marcar una falta como justificada escribe el motivo.", status.HTTP_400_BAD_REQUEST)
            limpios[eid] = (estado, obs)

        _, antes = _resumen_asistencia(curso, list(limpios))
        with transaction.atomic():
            for eid, (estado, obs) in limpios.items():
                Asistencia.objects.update_or_create(
                    curso=curso, estudiante_id=eid, fecha=fecha,
                    defaults={'estado': estado, 'observacion': obs, 'registrado_por': user},
                )
        _, despues = _resumen_asistencia(curso, list(limpios))

        lote = []
        alumnos = {m.estudiante_id: m.estudiante for m in matriculas}
        for eid in limpios:
            if _ORDEN_RIESGO[despues[eid]['riesgo']] > _ORDEN_RIESGO[antes[eid]['riesgo']]:
                aviso = _aviso_asistencia(alumnos[eid], curso, despues[eid]['faltas'], despues[eid]['riesgo'])
                if aviso:
                    lote.append(aviso)
        enviar_lote(lote)

        registrar_auditoria(
            user, "REGISTRO DE ASISTENCIA",
            f"Curso #{curso.id} ({curso.nombre}), clase del {fecha.strftime('%d/%m/%Y')}: "
            f"{len(limpios)} estudiante(s) registrados, {len(lote)} aviso(s) por faltas enviados."
        )
        en_riesgo = sum(1 for e in limpios if despues[e]['riesgo'] == 'EN_RIESGO')
        return Response({
            "status": "success",
            "message": f"Asistencia del {fecha.strftime('%d/%m/%Y')} guardada."
                       + (f" Se avisó a {len(lote)} estudiante(s) por sus faltas." if lote else ""),
            "avisos": len(lote),
            "en_riesgo": en_riesgo,
        })

    # GET
    fecha = _fecha_asistencia(request.query_params.get('fecha')) or hoy
    clases, resumen = _resumen_asistencia(curso, ids)
    del_dia = {a.estudiante_id: a for a in Asistencia.objects.filter(curso=curso, fecha=fecha)}
    fechas = [f.isoformat() for f in
              Asistencia.objects.filter(curso=curso).values_list('fecha', flat=True).distinct().order_by('-fecha')]

    estudiantes = []
    for m in matriculas:
        e = m.estudiante
        a = del_dia.get(e.id)
        estudiantes.append({
            "id": e.id,
            "nombre": e.get_full_name() or e.username,
            "dni": e.username,
            "estado": a.estado if a else None,
            "observacion": a.observacion if a else "",
            **resumen[e.id],
        })
    return Response({
        "curso": {"id": curso.id, "nombre": curso.nombre, "faltas_permitidas": curso.faltas_permitidas,
                  "horario": curso.horario or ""},
        "fecha": fecha.isoformat(),
        "hoy": hoy.isoformat(),
        "clases_registradas": clases,
        "fechas": fechas,
        "ya_registrada": bool(del_dia),
        "en_riesgo": sum(1 for x in estudiantes if x['riesgo'] == 'EN_RIESGO'),
        "estudiantes": estudiantes,
    })


@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def mi_asistencia_api(request):
    """Asistencia del estudiante autenticado, curso por curso (resumen y detalle por día)."""
    user, error = exigir_usuario(request)
    if error:
        return error
    if not es_estudiante(user):
        return _error("Solo los estudiantes tienen esta vista.", status.HTTP_403_FORBIDDEN)

    salida = []
    matriculas = Matricula.objects.filter(
        estudiante=user, status=Matricula.MatriculaStatus.APPROVED
    ).select_related('curso').order_by('-fecha_matricula')
    for m in matriculas:
        curso = m.curso
        clases, resumen = _resumen_asistencia(curso, [user.id])
        r_ = resumen[user.id]
        detalle = [{
            "fecha": a.fecha.isoformat(), "estado": a.estado, "observacion": a.observacion,
        } for a in Asistencia.objects.filter(curso=curso, estudiante=user).order_by('-fecha')]
        salida.append({
            "curso_id": curso.id,
            "curso_nombre": curso.nombre,
            "idioma": idioma_legible(curso.language),
            "periodo": curso.periodo,
            "horario": curso.horario or "",
            "faltas_permitidas": curso.faltas_permitidas,
            "clases_registradas": clases,
            **r_,
            "detalle": detalle,
        })
    return Response(salida)


@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def exportar_asistencia_excel_api(request, curso_id):
    """
    Descarga la asistencia del curso en Excel: una fila por estudiante, una columna por día de clase
    (P = presente, F = falta, J = justificada) y los totales. Solo el docente del curso, el INDI o el Admin.
    """
    user, error = exigir_usuario(request)
    if error:
        return error
    curso = get_object_or_404(Curso, id=curso_id)
    if not ((rol_de(user) == 'DOCENTE' and curso.docente_id == user.id) or es_personal_indi(user)):
        return _error("No tienes permisos sobre este curso.", status.HTTP_403_FORBIDDEN)

    try:
        from openpyxl import Workbook
        from openpyxl.styles import Alignment, Font, PatternFill
        from openpyxl.utils import get_column_letter
    except ImportError:
        return _error("Falta instalar openpyxl en el servidor (pip install openpyxl).", status.HTTP_500_INTERNAL_SERVER_ERROR)

    matriculas = list(
        Matricula.objects.filter(curso=curso, status=Matricula.MatriculaStatus.APPROVED)
        .select_related('estudiante').order_by('estudiante__last_name', 'estudiante__first_name')
    )
    ids = [m.estudiante_id for m in matriculas]
    fechas = sorted(set(Asistencia.objects.filter(curso=curso).values_list('fecha', flat=True)))
    mapa = {(a.estudiante_id, a.fecha): a for a in Asistencia.objects.filter(curso=curso, estudiante_id__in=ids)}
    _, resumen = _resumen_asistencia(curso, ids)
    etiqueta = {'PRESENTE': 'P', 'FALTA': 'F', 'JUSTIFICADA': 'J'}
    riesgo_txt = {'AL_DIA': 'Al día', 'ATENCION': 'Límite de faltas', 'EN_RIESGO': 'En riesgo'}

    wb = Workbook()
    ws = wb.active
    ws.title = "Asistencia"
    ws['A1'] = f"Asistencia - {curso.nombre}"
    ws['A1'].font = Font(bold=True, size=14)
    docente = (curso.docente.get_full_name() or curso.docente.username) if curso.docente else "Sin asignar"
    ws['A2'] = f"Docente: {docente}  |  Horario: {curso.horario or '-'}  |  Período: {curso.periodo}  |  Faltas permitidas: {curso.faltas_permitidas}"
    ws['A3'] = "P = Presente   F = Falta   J = Falta justificada"
    ws['A3'].font = Font(italic=True, color="666666")

    fila_cab = 5
    cabecera = ["N°", "DNI", "Estudiante"] + [f.strftime('%d/%m') for f in fechas] + ["Presentes", "Faltas", "Justificadas", "% Asistencia", "Estado"]
    relleno = PatternFill("solid", fgColor="1E293B")
    for i, t in enumerate(cabecera, 1):
        c = ws.cell(row=fila_cab, column=i, value=t)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = relleno
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)

    rojo = PatternFill("solid", fgColor="FECACA")
    amarillo = PatternFill("solid", fgColor="FEF3C7")
    verde = PatternFill("solid", fgColor="D1FAE5")
    for n, m in enumerate(matriculas, 1):
        e = m.estudiante
        r = resumen[e.id]
        fila = fila_cab + n
        ws.cell(row=fila, column=1, value=n)
        ws.cell(row=fila, column=2, value=e.username)
        ws.cell(row=fila, column=3, value=e.get_full_name() or e.username)
        for j, f in enumerate(fechas):
            a = mapa.get((e.id, f))
            c = ws.cell(row=fila, column=4 + j, value=etiqueta[a.estado] if a else "")
            c.alignment = Alignment(horizontal="center")
            if a:
                c.fill = {'PRESENTE': verde, 'FALTA': rojo, 'JUSTIFICADA': amarillo}[a.estado]
        base = 4 + len(fechas)
        ws.cell(row=fila, column=base, value=r['presentes'])
        ws.cell(row=fila, column=base + 1, value=r['faltas'])
        ws.cell(row=fila, column=base + 2, value=r['justificadas'])
        ws.cell(row=fila, column=base + 3, value=(r['porcentaje'] / 100) if r['porcentaje'] is not None else None).number_format = '0%'
        est = ws.cell(row=fila, column=base + 4, value=riesgo_txt[r['riesgo']])
        if r['riesgo'] == 'EN_RIESGO':
            est.fill = rojo
        elif r['riesgo'] == 'ATENCION':
            est.fill = amarillo

    ws.column_dimensions['A'].width = 5
    ws.column_dimensions['B'].width = 12
    ws.column_dimensions['C'].width = 34
    for j in range(len(fechas)):
        ws.column_dimensions[get_column_letter(4 + j)].width = 7
    for k in range(5):
        ws.column_dimensions[get_column_letter(4 + len(fechas) + k)].width = 14
    ws.freeze_panes = ws.cell(row=fila_cab + 1, column=4)

    buf = io.BytesIO()
    wb.save(buf)
    nombre = re.sub(r'[^A-Za-z0-9_-]+', '_', curso.nombre).strip('_') or 'curso'
    respuesta = HttpResponse(
        buf.getvalue(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    respuesta['Content-Disposition'] = f'attachment; filename="asistencia_{nombre}.xlsx"'
    registrar_auditoria(user, "EXPORTACIÓN DE ASISTENCIA", f"Curso #{curso.id} ({curso.nombre}): Excel de asistencia descargado.")
    return respuesta


# ==========================================================
# REPORTES DEL INDI (resumen en pantalla y Excel)
# ==========================================================

def _rango_fechas(request):
    """(desde, hasta, error) a partir de ?desde=AAAA-MM-DD&hasta=AAAA-MM-DD. Ambos opcionales."""
    desde = hasta = None
    for nombre in ('desde', 'hasta'):
        texto = request.query_params.get(nombre)
        if texto:
            valor = _fecha_asistencia(texto)
            if valor is None:
                return None, None, f"La fecha '{nombre}' no es válida (usa AAAA-MM-DD)."
            if nombre == 'desde':
                desde = valor
            else:
                hasta = valor
    if desde and hasta and desde > hasta:
        return None, None, "La fecha 'desde' no puede ser posterior a 'hasta'."
    return desde, hasta, None


def _tipo_de_matricula(m, tipos):
    return tipos.get((m.estudiante_id, m.curso_id), 'PUBLICO')


def _datos_ingresos(desde, hasta):
    """
    Ingresos validados por el INDI en el rango:
      - matrículas aprobadas (monto según el tipo de postulante), fechadas al matricularse;
      - certificados con pago validado, fechados al validarse el pago.
    """
    mats = Matricula.objects.filter(status=Matricula.MatriculaStatus.APPROVED).select_related('estudiante', 'curso')
    if desde:
        mats = mats.filter(fecha_matricula__date__gte=desde)
    if hasta:
        mats = mats.filter(fecha_matricula__date__lte=hasta)
    mats = list(mats.order_by('fecha_matricula'))
    tipos = {
        (s.estudiante_id, s.curso_id): s.tipo_postulante
        for s in SolicitudMatricula.objects.filter(estado='APROBADA')
    }
    filas_mat = []
    for m in mats:
        tipo = _tipo_de_matricula(m, tipos)
        filas_mat.append({
            "fecha": timezone.localtime(m.fecha_matricula).date(),
            "dni": m.estudiante.username,
            "estudiante": m.estudiante.get_full_name() or m.estudiante.username,
            "curso": m.curso.nombre,
            "curso_id": m.curso_id,
            "tipo": tipo,
            "monto": monto_matricula(tipo),
        })

    certs = CertificateRequest.objects.filter(pago_validado=True).select_related('student', 'curso')
    if desde:
        certs = certs.filter(pago_revisado_en__date__gte=desde)
    if hasta:
        certs = certs.filter(pago_revisado_en__date__lte=hasta)
    filas_cert = []
    for c in certs.order_by('pago_revisado_en'):
        filas_cert.append({
            "fecha": timezone.localtime(c.pago_revisado_en).date() if c.pago_revisado_en else None,
            "dni": c.student.username,
            "estudiante": c.student.get_full_name() or c.student.username,
            "curso": c.curso.nombre if c.curso else f"{idioma_legible(c.language)} {nivel_legible(c.level)}",
            "operacion": c.numero_operacion or "",
            "monto": c.monto or settings.PRECIO_CERTIFICADO,
        })
    return filas_mat, filas_cert


@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def reporte_resumen_api(request):
    """Resumen de ingresos y matriculados por curso, para la pantalla de reportes del INDI."""
    user, error = exigir_personal_indi(request)
    if error:
        return error
    desde, hasta, err = _rango_fechas(request)
    if err:
        return _error(err, status.HTTP_400_BAD_REQUEST)

    filas_mat, filas_cert = _datos_ingresos(desde, hasta)
    total_mat = sum((f['monto'] for f in filas_mat), Decimal('0'))
    total_cert = sum((f['monto'] for f in filas_cert), Decimal('0'))

    por_curso = {}
    for f in filas_mat:
        d = por_curso.setdefault(f['curso_id'], {"curso": f['curso'], "matriculados": 0, "ingresos": Decimal('0')})
        d['matriculados'] += 1
        d['ingresos'] += f['monto']

    return Response({
        "desde": desde.isoformat() if desde else "",
        "hasta": hasta.isoformat() if hasta else "",
        "matriculas": {"cantidad": len(filas_mat), "total": float(total_mat)},
        "certificados": {"cantidad": len(filas_cert), "total": float(total_cert)},
        "total_general": float(total_mat + total_cert),
        "por_curso": sorted(
            [{"curso": v["curso"], "matriculados": v["matriculados"], "ingresos": float(v["ingresos"])} for v in por_curso.values()],
            key=lambda x: -x["ingresos"],
        ),
    })


def _estilo_cabecera(ws, fila, titulos):
    from openpyxl.styles import Alignment, Font, PatternFill
    for i, t in enumerate(titulos, 1):
        c = ws.cell(row=fila, column=i, value=t)
        c.font = Font(bold=True, color="FFFFFF")
        c.fill = PatternFill("solid", fgColor="1E293B")
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)


def _anchos(ws, anchos):
    from openpyxl.utils import get_column_letter
    for i, a in enumerate(anchos, 1):
        ws.column_dimensions[get_column_letter(i)].width = a


def _respuesta_excel(wb, nombre):
    buf = io.BytesIO()
    wb.save(buf)
    r = HttpResponse(buf.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    r['Content-Disposition'] = f'attachment; filename="{nombre}"'
    return r


@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def reporte_ingresos_excel_api(request):
    """Excel de ingresos (matrículas y certificados) con totales. Filtros: ?desde=&hasta="""
    user, error = exigir_personal_indi(request)
    if error:
        return error
    desde, hasta, err = _rango_fechas(request)
    if err:
        return _error(err, status.HTTP_400_BAD_REQUEST)
    try:
        from openpyxl import Workbook
        from openpyxl.styles import Font
    except ImportError:
        return _error("Falta instalar openpyxl en el servidor (pip install openpyxl).", 500)

    filas_mat, filas_cert = _datos_ingresos(desde, hasta)
    wb = Workbook()
    rango = f"{desde.strftime('%d/%m/%Y') if desde else 'inicio'} al {hasta.strftime('%d/%m/%Y') if hasta else 'hoy'}"

    ws = wb.active
    ws.title = "Resumen"
    ws['A1'] = "Reporte de ingresos - INDI UNSCH"
    ws['A1'].font = Font(bold=True, size=14)
    ws['A2'] = f"Periodo: {rango}"
    total_mat = sum((f['monto'] for f in filas_mat), Decimal('0'))
    total_cert = sum((f['monto'] for f in filas_cert), Decimal('0'))
    _estilo_cabecera(ws, 4, ["Concepto", "Cantidad", "Total (S/)"])
    ws.append(["Matrículas aprobadas", len(filas_mat), float(total_mat)])
    ws.append(["Certificados con pago validado", len(filas_cert), float(total_cert)])
    ws.append(["TOTAL", len(filas_mat) + len(filas_cert), float(total_mat + total_cert)])
    for c in ws[7]:
        c.font = Font(bold=True)
    for fila in ws.iter_rows(min_row=5, max_row=7, min_col=3, max_col=3):
        fila[0].number_format = '#,##0.00'
    _anchos(ws, [34, 12, 14])

    wm = wb.create_sheet("Matrículas")
    _estilo_cabecera(wm, 1, ["Fecha", "DNI", "Estudiante", "Curso", "Tipo de postulante", "Monto (S/)"])
    for f in filas_mat:
        wm.append([f['fecha'].strftime('%d/%m/%Y'), f['dni'], f['estudiante'], f['curso'],
                   'Estudiante UNSCH' if f['tipo'] == 'UNSCH' else 'Público general', float(f['monto'])])
    wm.append(["", "", "", "", "TOTAL", float(total_mat)])
    for c in wm[wm.max_row]:
        c.font = Font(bold=True)
    for fila in wm.iter_rows(min_row=2, min_col=6, max_col=6):
        fila[0].number_format = '#,##0.00'
    _anchos(wm, [12, 12, 32, 36, 20, 12])

    wc = wb.create_sheet("Certificados")
    _estilo_cabecera(wc, 1, ["Fecha de validación", "DNI", "Estudiante", "Curso", "N° operación", "Monto (S/)"])
    for f in filas_cert:
        wc.append([f['fecha'].strftime('%d/%m/%Y') if f['fecha'] else '', f['dni'], f['estudiante'], f['curso'], f['operacion'], float(f['monto'])])
    wc.append(["", "", "", "", "TOTAL", float(total_cert)])
    for c in wc[wc.max_row]:
        c.font = Font(bold=True)
    for fila in wc.iter_rows(min_row=2, min_col=6, max_col=6):
        fila[0].number_format = '#,##0.00'
    _anchos(wc, [18, 12, 32, 36, 16, 12])

    registrar_auditoria(user, "EXPORTACIÓN DE REPORTE", f"Reporte de ingresos ({rango}) descargado en Excel.")
    return _respuesta_excel(wb, "ingresos_indi.xlsx")


@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def reporte_matriculados_excel_api(request):
    """
    Excel de estudiantes matriculados, una hoja por curso. Filtros opcionales:
    ?idioma=INGLES  ?periodo=2026-I  ?curso_id=3
    """
    user, error = exigir_personal_indi(request)
    if error:
        return error
    try:
        from openpyxl import Workbook
    except ImportError:
        return _error("Falta instalar openpyxl en el servidor (pip install openpyxl).", 500)

    cursos = Curso.objects.filter(activo=True).select_related('docente').order_by('language', 'subnivel', 'horario')
    idioma = normalizar_codigo(request.query_params.get('idioma'))
    if idioma:
        cursos = cursos.filter(language=idioma)
    periodo = str(request.query_params.get('periodo') or '').strip()
    if periodo:
        cursos = cursos.filter(periodo=periodo)
    curso_id = request.query_params.get('curso_id')
    if curso_id:
        try:
            cursos = cursos.filter(id=int(curso_id))
        except ValueError:
            return _error("Curso no válido.", status.HTTP_400_BAD_REQUEST)
    cursos = list(cursos)
    if not cursos:
        return _error("No hay cursos con esos filtros.", status.HTTP_404_NOT_FOUND)

    tipos = {
        (s.estudiante_id, s.curso_id): s.tipo_postulante
        for s in SolicitudMatricula.objects.filter(estado='APROBADA', curso__in=cursos)
    }
    wb = Workbook()
    wb.remove(wb.active)
    usados = set()
    total = 0
    for curso in cursos:
        base = re.sub(r'[\\/*?:\[\]]', ' ', f"{curso.nombre} {curso.horario or ''}").strip()[:28] or "Curso"
        nombre, n = base, 2
        while nombre in usados:
            nombre = f"{base[:25]} {n}"
            n += 1
        usados.add(nombre)
        ws = wb.create_sheet(nombre)
        ws['A1'] = curso.nombre
        ws['A2'] = (f"Período {curso.periodo} · {curso.get_modalidad_display()} · {curso.horario or '-'} · "
                    f"Docente: {(curso.docente.get_full_name() or curso.docente.username) if curso.docente else 'sin asignar'}")
        _estilo_cabecera(ws, 4, ["N°", "DNI", "Estudiante", "Correo personal", "Correo institucional", "Celular", "Tipo", "Fecha de matrícula"])
        mats = (Matricula.objects.filter(curso=curso, status=Matricula.MatriculaStatus.APPROVED)
                .select_related('estudiante').order_by('estudiante__last_name', 'estudiante__first_name'))
        for i, m in enumerate(mats, 1):
            e = m.estudiante
            ws.append([i, e.username, e.get_full_name() or e.username, e.email or '',
                       getattr(e, 'correo_institucional', '') or '', getattr(e, 'celular', '') or '',
                       'UNSCH' if tipos.get((e.id, curso.id)) == 'UNSCH' else 'Público',
                       timezone.localtime(m.fecha_matricula).strftime('%d/%m/%Y')])
            total += 1
        _anchos(ws, [5, 12, 32, 30, 32, 12, 10, 16])
        ws.freeze_panes = "A5"

    registrar_auditoria(user, "EXPORTACIÓN DE REPORTE", f"Lista de matriculados ({len(cursos)} curso(s), {total} estudiante(s)) descargada en Excel.")
    return _respuesta_excel(wb, "matriculados_indi.xlsx")
