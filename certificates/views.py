import io
import json
import mimetypes
import os
import re
import unicodedata
import hashlib
import uuid
from datetime import date, datetime, timedelta, timezone as dt_timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.shortcuts import render, get_object_or_404
from django.http import FileResponse, HttpResponse, Http404, JsonResponse
from django.contrib.auth import authenticate, get_user_model
from django.conf import settings
from django.core.exceptions import ValidationError
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
    Evaluacion, Calificacion, SolicitudMatricula,
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

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def gestionar_cursos_api(request):
    """
    GET: Lista todos los cursos activos (público: lo usa el registro de nuevos estudiantes).
    POST: Permite al rol INDI o ADMIN crear un nuevo curso y asignarle un docente.
    """
    if request.method == 'GET':
        cursos = Curso.objects.filter(activo=True).order_by('-created_at')
        data = [{
            "id": c.id,
            "nombre": c.nombre,
            "language": c.language,
            "level": c.level,
            "subnivel": c.subnivel,
            "periodo": c.periodo,
            "modalidad": c.modalidad,
            "horario": c.horario or "",
            "docente_id": c.docente.id if c.docente else None,
            "docente_nombre": c.docente.get_full_name() or c.docente.username if c.docente else "Por asignar",
        } for c in cursos]
        return Response(data, status=status.HTTP_200_OK)

    # POST: solo Admin o Personal INDI
    user, error = exigir_personal_indi(request)
    if error:
        return error

    nombre = request.data.get('nombre')
    language = request.data.get('language')
    level = request.data.get('level')
    subnivel = request.data.get('subnivel', 'Nivel I')
    periodo = request.data.get('periodo', '2026-I')
    docente_id = request.data.get('docente_id')

    if not nombre or not language or not level:
        return Response({"status": "error", "message": "Nombre, idioma y nivel son obligatorios."}, status=status.HTTP_400_BAD_REQUEST)

    docente = None
    if docente_id:
        docente = User.objects.filter(id=docente_id, role='DOCENTE').first()

    curso = Curso.objects.create(
        nombre=nombre,
        language=language,
        level=level,
        subnivel=subnivel,
        periodo=periodo,
        docente=docente
    )

    registrar_auditoria(
        user,
        "CREACIÓN DE CURSO",
        f"Curso '{nombre}' creado (período {periodo}, docente: {docente.username if docente else 'sin asignar'})."
    )

    return Response({
        "status": "success",
        "message": "Curso creado y docente asignado correctamente.",
        "curso_id": curso.id
    }, status=status.HTTP_201_CREATED)


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
        if es_personal_indi(user):
            solicitudes = SolicitudMatricula.objects.all().order_by('-fecha_solicitud')
        elif es_estudiante(user):
            solicitudes = SolicitudMatricula.objects.filter(estudiante=user).order_by('-fecha_solicitud')
        else:
            return _error("No tienes permisos para ver las matrículas.", status.HTTP_403_FORBIDDEN)

        data = [{
            "id": s.id,
            "estudiante": s.estudiante.get_full_name() or s.estudiante.username,
            "curso_id": s.curso.id if s.curso else None,
            "curso_nombre": s.curso.nombre if s.curso else "Curso libre",
            "status": s.estado,
            "estado": s.estado,
            "voucher_pago": s.boucher_pago.url if getattr(s, 'boucher_pago', None) else '',
            "fecha": s.fecha_solicitud.isoformat() if s.fecha_solicitud else ""
        } for s in solicitudes]
        return Response(data, status=status.HTTP_200_OK)

    # POST
    curso_id = request.data.get('curso_id')
    if not curso_id:
        return Response({"status": "error", "message": "Debe seleccionar un curso."}, status=status.HTTP_400_BAD_REQUEST)

    curso = get_object_or_404(Curso, id=curso_id)

    if SolicitudMatricula.objects.filter(estudiante=user, curso=curso).exclude(estado='RECHAZADA').exists():
        return Response({"status": "error", "message": "Ya cuentas con una solicitud activa en este curso."}, status=status.HTTP_400_BAD_REQUEST)

    solicitud = SolicitudMatricula.objects.create(
        estudiante=user,
        curso=curso,
        tipo_postulante='UNSCH' if getattr(user, 'codigo_universitario', '') else 'PUBLICO',
        estado='ESPERANDO_PAGO'
    )

    return Response({
        "status": "success",
        "message": "Solicitud de matrícula enviada con éxito.",
        "solicitud_id": solicitud.id
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
        return Response({
            "status": "success",
            "message": "Matrícula aprobada. El estudiante quedó matriculado en el curso."
        })

    # Rechazo
    solicitud.estado = 'RECHAZADA'
    solicitud.save()
    registrar_auditoria(user, "RECHAZO DE MATRÍCULA", f"{detalle_base} rechazada.")
    return Response({"status": "success", "message": "Matrícula rechazada."})


@api_view(['POST'])
@permission_classes([AllowAny])
def registrarse_y_generar_orden(request):
    """Registro público de un nuevo estudiante con su orden de pago."""
    data = request.data
    username = data.get('username')  # DNI
    password = data.get('password')
    first_name = data.get('first_name')
    last_name = data.get('last_name')
    email = data.get('email', '')
    celular = data.get('celular', '')
    tipo_postulante = data.get('tipo_postulante', 'PUBLICO')
    codigo_universitario = data.get('codigo_universitario', '')
    curso_id = data.get('curso_id')

    if User.objects.filter(username=username).exists():
        return Response({'message': 'El DNI ya se encuentra registrado. Inicia sesión.'}, status=400)

    try:
        curso = Curso.objects.get(id=curso_id, activo=True)

        with transaction.atomic():
            user = User.objects.create_user(
                username=username,
                password=password,
                first_name=first_name,
                last_name=last_name,
                email=email
            )
            if hasattr(user, 'role'):
                user.role = 'ESTUDIANTE'
                user.save()

            solicitud = SolicitudMatricula.objects.create(
                estudiante=user,
                curso=curso,
                tipo_postulante=tipo_postulante,
                codigo_universitario=codigo_universitario if tipo_postulante == 'UNSCH' else '',
                estado='ESPERANDO_PAGO'
            )

        return Response({
            'status': 'success',
            'solicitud_id': solicitud.id,
            'message': 'Cuenta creada y orden de pago generada con éxito.'
        }, status=201)

    except Curso.DoesNotExist:
        return Response({'message': 'El curso seleccionado no existe.'}, status=400)
    except Exception as e:
        return Response({'message': f'Error al procesar: {str(e)}'}, status=500)


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
        monto_total = "S/.90.00"
    else:
        concepto_tasa = "Pensión (Público General)"
        monto_total = "S/.120.00"

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
        ("IDIOMA/NIVEL", f": {curso.language}/{curso.level}-{curso.subnivel}"),
        ("GRUPO", f': "{getattr(curso, "horario", "L-V 20:00-22:00")}"'),
        ("SEDE", f": {getattr(curso, 'modalidad', 'Virtual')}"),
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
    Permite al estudiante subir su voucher de pago vinculándolo a SU solicitud.
    """
    if request.method == 'OPTIONS':
        return Response({}, status=200)

    user, error = exigir_usuario(request)
    if error:
        return error

    archivo_voucher = request.FILES.get('voucher_pago') or request.FILES.get('boucher_pago')
    solicitud_id = request.data.get('solicitud_id')

    if not archivo_voucher:
        return Response({'message': 'Debe adjuntar el archivo del voucher.'}, status=400)

    if not solicitud_id:
        return Response({'message': 'No se especificó la solicitud de matrícula.'}, status=400)

    try:
        # Verificamos que la solicitud pertenezca realmente al estudiante autenticado
        solicitud = SolicitudMatricula.objects.get(id=solicitud_id, estudiante=user)
        solicitud.boucher_pago = archivo_voucher
        solicitud.estado = 'PENDIENTE'
        solicitud.save()

        return Response({
            'status': 'success',
            'message': 'Voucher subido correctamente. Su matrícula se encuentra en revisión.'
        }, status=200)

    except SolicitudMatricula.DoesNotExist:
        return Response({'message': 'No se encontró la solicitud de matrícula o no te pertenece.'}, status=404)
    except Exception as e:
        return Response({'message': f'Error al procesar el archivo: {str(e)}'}, status=400)


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
        "level": c.level,
        "subnivel": c.subnivel,
        "periodo": c.periodo,
        "modalidad": c.modalidad,
        "horario": c.horario or "",
        "total_matriculados": c.total_matriculados,
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
    ):
        return _error("Esta solicitud no está esperando un voucher de pago.", status.HTTP_400_BAD_REQUEST)

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
        "PAGO DE CERTIFICADO ENVIADO",
        f"Solicitud #{solicitud.id}: voucher con operación {numero} enviado a revisión."
    )

    return Response({
        "status": "success",
        "message": "Voucher enviado. El INDI revisará tu pago.",
    }, status=status.HTTP_200_OK)


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
        mensaje = EmailMultiAlternatives(asunto, texto, settings.DEFAULT_FROM_EMAIL, [destinatario])
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
    destinatario = correo_del_usuario(estudiante)
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
    destinatario = correo_del_usuario(estudiante)
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
    destinatario = correo_del_usuario(estudiante)
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
        f"Certificado {certificado.certificate_code} enviado a {destinatario}.",
        certificate=certificado,
    )
    return True, f"Se envió al correo del estudiante ({destinatario})."


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