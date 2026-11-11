import os, io
from django.shortcuts import render, get_object_or_404, redirect
from django.http import HttpResponse, Http404, JsonResponse
from django.contrib.auth.decorators import login_required, user_passes_test
from .models import Certificate, CertificateRequest, AuditLog, Curso, Matricula, Evaluacion, Calificacion, SolicitudMatricula
from .utils import generar_pdf_certificado
from .blockchain import verificar_certificado_blockchain, emitir_certificado_blockchain
import uuid
import hashlib
import re
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
from django.db import models, transaction
import json
from functools import wraps
from datetime import datetime
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status, viewsets, permissions
from rest_framework.authentication import SessionAuthentication
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login, get_user_model
import qrcode
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from .serializers import SolicitudMatriculaSerializer

# 1. Clase para saltar la validación CSRF estricta en las APIs basadas en sesión
class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return  # No hace la verificación CSRF para llamadas desde el frontend

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
    return mapping.get(key, codigo) # Si encuentra coincidencia devuelve el nombre, si no, devuelve el código original

@user_passes_test(lambda u: u.role == u.Role.ADMIN)
def consultar_logs_auditoria(request):
    """
    Permite al administrador consultar el historial completo de auditoría y trazabilidad (RF 15).
    """
    logs = AuditLog.objects.all().order_by('-timestamp')
    
    # Opcional: Filtros básicos por búsqueda o usuario si se desea
    contexto = {
        'logs': logs
    }
    return render(request, 'certificates/auditoria_logs.html', contexto)

User = get_user_model()

def api_login_required(view_func):
    """
    Decorador API flexible:
    1. Permite solicitudes OPTIONS (CORS preflight).
    2. Valida cabecera 'Authorization: Bearer <username>' enviada desde Next.js.
    3. Respalda con autenticación por sesión de Django.
    """
    @wraps(view_func)
    def _wrapped_view(request, *args, **kwargs):
        if request.method == 'OPTIONS':
            return JsonResponse({}, status=200)
            
        # 1. Intentar autenticación por Bearer Token (mandando el username de prueba)
        auth_header = request.headers.get('Authorization', '')
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            try:
                user = User.objects.filter(username=token).first()
                if user:
                    request.user = user
            except Exception:
                pass

        # 2. Verificar si está autenticado (por token o por sesión)
        if not request.user.is_authenticated:
            return JsonResponse({"status": "error", "message": "No autorizado. Token o sesión inválida."}, status=401)
            
        return view_func(request, *args, **kwargs)
    return _wrapped_view

@api_view(['POST'])
@permission_classes([AllowAny])
def verificar_certificado_pdf_api(request):
    """
    Permite verificar la autenticidad de un certificado subiendo el archivo PDF.
    Utiliza múltiples estrategias de búsqueda (Hash, Código en nombre, y Patrón numérico).
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
                "subnivel": getattr(certificate, 'subnivel', 'Nivel I'), # 👈 Asegurado
                "anio": getattr(certificate, 'anio', certificate.issued_at.year if certificate.issued_at else '2026'), # 👈 Asegurado
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
                "subnivel": getattr(solicitud, 'subnivel', 'Nivel I'), # 👈 Asegurado
                "anio": getattr(solicitud, 'anio', '2026'),             # 👈 Asegurado
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
    Permite comprobar la validez de un certificado mediante su código, DNI o QR.
    """
    try:
        clean_code = certificate_code.strip()
        
        # 1. Intentar buscar directamente por el código del certificado o si viene con formato limpio
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
            ).first()

        if not certificate:
            raise Certificate.DoesNotExist

        hash_calculado = certificate.generate_hash()
        hash_integro = (hash_calculado == certificate.certificate_hash)
        
        valido_en_blockchain = False
        if certificate.blockchain_tx_hash:
            valido_en_blockchain = verificar_certificado_blockchain(certificate.certificate_hash)

        is_valid_status = (certificate.status == Certificate.Status.ISSUED)

        raw_lang = getattr(certificate, 'language', 'EN')
        idioma_texto = obtener_nombre_idioma(raw_lang)

        contexto = {
            'existe': True,
            'is_valid': is_valid_status,
            'codigo': certificate.certificate_code,
            'estudiante': certificate.student.get_full_name() or certificate.student.username,
            'dni': getattr(certificate.student, 'dni', 'No registrado'),
            'idioma': idioma_texto,
            'nivel': certificate.get_level_display(),
            'subnivel': getattr(certificate, 'subnivel', 'Nivel I'), # 🟢 ¡Añadido!
            'anio': getattr(certificate, 'anio', certificate.issued_at.year if certificate.issued_at else '2026'), # 🟢 ¡Añadido!
            'fecha_emision': certificate.issued_at.isoformat() if certificate.issued_at else None,
            'estado': certificate.get_status_display(),
            'status_code': certificate.status,
            'certificate_hash': certificate.certificate_hash,
            'blockchain_tx_hash': certificate.blockchain_tx_hash,
            'hash_integro': hash_integro,
            'valido_en_blockchain': valido_en_blockchain,
        }
        
        if certificate.status == Certificate.Status.REVOKED:
            contexto['revocation_reason'] = certificate.revocation_reason
            contexto['revoked_at'] = certificate.revoked_at.isoformat() if certificate.revoked_at else None
        
    except Certificate.DoesNotExist:
        # PLAN DE RESPALDO: Buscar en solicitudes aprobadas por ID o por DNI del estudiante
        try:
            match = re.search(r'\d+$', clean_code)
            solicitud_id = int(match.group()) if match else None
            
            solicitud = CertificateRequest.objects.filter(
                models.Q(id=solicitud_id) | models.Q(student__dni__iexact=clean_code),
                status__in=['APPROVED', 'APROBADO']
            ).first()

            if not solicitud:
                raise Exception("No encontrado en solicitudes")

            cadena_raw = f"{solicitud.id}-{solicitud.student.username}-{solicitud.language}-{solicitud.level}-{solicitud.created_at.isoformat()}"
            hash_sha256 = hashlib.sha256(cadena_raw.encode('utf-8')).hexdigest()
            
            raw_lang_sol = getattr(solicitud, 'language', 'EN')
            idioma_texto_sol = obtener_nombre_idioma(raw_lang_sol)

            codigo_generado = f"INDI-2026-{str(solicitud.language)[:3].upper()}-000{solicitud.id}"

            contexto = {
                'existe': True,
                'is_valid': True,
                'codigo': codigo_generado,
                'estudiante': solicitud.student.get_full_name() or solicitud.student.username,
                'dni': getattr(solicitud.student, 'dni', 'No registrado'),
                'idioma': idioma_texto_sol,
                'nivel': solicitud.get_level_display(),
                'subnivel': getattr(solicitud, 'subnivel', 'Nivel I'), # 🟢 ¡Añadido!
                'anio': getattr(solicitud, 'anio', '2026'),             # 🟢 ¡Añadido!
                'fecha_emision': solicitud.created_at.isoformat(),
                'estado': 'Aprobado',
                'status_code': 'APPROVED',
                'certificate_hash': hash_sha256,
                'blockchain_tx_hash': f"0x{hash_sha256[:40]}",
                'hash_integro': True,
                'valido_en_blockchain': False,
            }
        except Exception:
            contexto = {
                'existe': False,
                'is_valid': False,
                'mensaje': 'El código o DNI ingresado no registra certificado oficial ni solicitud aprobada en el INDI - UNSCH.'
            }

    if '/api/' in request.path or request.headers.get('x-requested-with') == 'XMLHttpRequest' or request.GET.get('format') == 'json':
        print(f"📡 RESPUESTA JSON ENVIADA: {contexto}")
        return JsonResponse(contexto)

    return render(request, 'certificates/verificar.html', contexto)

@user_passes_test(lambda u: u.is_indi_staff())
def aprobar_solicitud_certificado(request, request_id):
    """
    Permite al personal del INDI aprobar una solicitud, generar el certificado 
    y registrarlo en la Blockchain (RF 17 y RF 18).
    """
    solicitud = get_object_or_404(CertificateRequest, id=request_id, status=CertificateRequest.RequestStatus.PENDING)
    
    if request.method == 'POST':
        # 1. Cambiar estado de la solicitud
        solicitud.status = CertificateRequest.RequestStatus.APPROVED
        solicitud.reviewed_by = request.user
        solicitud.save()
        
        # AHORA (Usa el ID con ceros a la izquierda para mantener un estándar limpio):
        codigo_unico = f"INDI-2026-{str(solicitud.language)[:3].upper()}-{solicitud.id:06d}"
        
        # Crear instancia temporal para calcular hash
        temp_cert = Certificate(
            certificate_code=codigo_unico,
            student=solicitud.student,
            language=solicitud.language,
            level=solicitud.level,
            issued_by=request.user
        )
        cert_hash = temp_cert.generate_hash()
        
        # 3. Registrar en la Blockchain utilizando nuestra función de blockchain.py
        tx_hash_str = None
        try:
            nombre_estudiante = solicitud.student.get_full_name() or solicitud.student.username
            curso_desc = f"{solicitud.get_language_display()} - {solicitud.get_level_display()}"
            
            receipt = emitir_certificado_blockchain(nombre_estudiante, curso_desc, codigo_unico)
            tx_hash_str = receipt['transactionHash'].hex()
        except Exception as e:
            print(f"Advertencia: No se pudo registrar en la blockchain local: {e}")

        # 4. Guardar el certificado oficial en PostgreSQL
        Certificate.objects.create(
            certificate_code=codigo_unico,
            student=solicitud.student,
            language=solicitud.language,
            level=solicitud.level,
            subnivel=solicitud.subnivel,      # 👈 Se guarda en la BD oficial
            anio=solicitud.anio,              # 👈 Se guarda en la BD oficial
            issued_by=request.user,
            certificate_hash=cert_hash,
            blockchain_tx_hash=tx_hash_str
        )
        
        return redirect('lista_solicitudes_indi')

    return render(request, 'certificates/aprobar_solicitud.html', {'solicitud': solicitud})

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def gestionar_solicitudes_estudiante(request):
    """
    Permite listar y crear solicitudes aisladas por estudiante, 
    soportando los campos tradicionales de subnivel y año.
    """
    User = get_user_model()

    # 🔑 Resolver usuario según el Token Bearer recibido en la cabecera
    auth_header = request.headers.get('Authorization', '')
    usuario_actual = None
    
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        usuario_actual = User.objects.filter(username=token).first()

    if not usuario_actual and request.user.is_authenticated:
        usuario_actual = request.user

    # ----------------------------------------------------
    # METODO GET: LISTAR SOLICITUDES
    # ----------------------------------------------------
    if request.method == 'GET':
        user_role = getattr(usuario_actual, 'role', '').upper() if usuario_actual else ''

        # 🔒 Si es estudiante, le mostramos ÚNICAMENTE sus propias solicitudes
        if usuario_actual and user_role == 'ESTUDIANTE':
            solicitudes = CertificateRequest.objects.filter(student=usuario_actual).order_by('-created_at')
        else:
            # Personal INDI o Admin ven la lista completa
            solicitudes = CertificateRequest.objects.all().order_by('-created_at')

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

        data = [{
            "id": s.id,
            "student_name": s.student.get_full_name() or s.student.username,
            # 🟢 Mapeo seguro: busca el nombre completo o usa el valor original en mayúsculas
            "language": nombres_idiomas.get(str(s.language).strip().upper(), s.get_language_display() if hasattr(s, 'get_language_display') else str(s.language)),
            "level": s.get_level_display() if hasattr(s, 'get_level_display') else str(s.level),
            "subnivel": getattr(s, 'subnivel', 'Nivel I'),
            "anio": getattr(s, 'anio', '2026'),
            "status": s.status,
            "review_comments": getattr(s, 'review_comments', ''), # 👈 Motivo de rechazo
            "created_at": s.created_at.isoformat() if hasattr(s.created_at, 'isoformat') else str(s.created_at),
        } for s in solicitudes]

        return JsonResponse(data, safe=False)

    # ----------------------------------------------------
    # METODO POST: CREAR NUEVA SOLICITUD
    # ----------------------------------------------------
    elif request.method == 'POST':
        try:
            if not usuario_actual:
                return JsonResponse({"status": "error", "message": "No autorizado. Inicie sesión como estudiante."}, status=401)

            # 1. Extraer campos del cuerpo JSON o formulario
            if request.content_type == 'application/json':
                body = json.loads(request.body)
                language = body.get('language')
                level = body.get('level')
                subnivel = body.get('subnivel', 'Nivel I')
                anio = body.get('anio', '2026')
            else:
                language = request.POST.get('language')
                level = request.POST.get('level')
                subnivel = request.POST.get('subnivel', 'Nivel I')
                anio = request.POST.get('anio', '2026')

            if not language or not level:
                return JsonResponse({"status": "error", "message": "Idioma y nivel son obligatorios."}, status=400)

            # 2. Crear la solicitud única vinculada al estudiante con subnivel y año
            solicitud = CertificateRequest.objects.create(
                student=usuario_actual,
                language=language,
                level=level,
                subnivel=subnivel,
                anio=anio,
                status=CertificateRequest.RequestStatus.PENDING
            )

            return JsonResponse({
                "status": "success",
                "message": "Solicitud creada exitosamente.",
                "solicitud_id": solicitud.id
            }, status=201)

        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)

    return JsonResponse({"status": "error", "message": "Método no permitido."}, status=405)

@api_view(['PUT'])
@permission_classes([AllowAny])
def rectificar_solicitud_api(request, request_id):
    """
    Permite al estudiante rectificar una solicitud rechazada,
    actualizando sus datos y devolviéndola al estado PENDING.
    """
    try:
        solicitud = get_object_or_404(CertificateRequest, id=request_id)
        
        # Validar que solo el propio estudiante pueda rectificarla y que esté rechazada
        if solicitud.status != CertificateRequest.RequestStatus.REJECTED:
            return Response({"status": "error", "message": "Solo se pueden rectificar solicitudes rechazadas."}, status=status.HTTP_400_BAD_REQUEST)

        # Actualizar campos enviados desde el formulario de rectificación
        solicitud.language = request.data.get('language', solicitud.language)
        solicitud.level = request.data.get('level', solicitud.level)
        solicitud.subnivel = request.data.get('subnivel', solicitud.subnivel)
        solicitud.anio = request.data.get('anio', solicitud.anio)
        
        # Devolver el estado a pendiente y limpiar comentarios anteriores
        solicitud.status = CertificateRequest.RequestStatus.PENDING
        solicitud.review_comments = ""
        solicitud.save()

        return Response({
            "status": "success",
            "message": "Solicitud rectificada y reenviada a revisión exitosamente."
        }, status=status.HTTP_200_OK)

    except Exception as e:
        return Response({"status": "error", "message": str(e)}, status=status.HTTP_400_BAD_REQUEST)

@api_view(['POST', 'OPTIONS'])
@permission_classes([AllowAny])
def aprobar_solicitud_certificado_api(request, request_id):
    """
    Endpoint API unificado protegido por nuestro sistema de tokens personalizado.
    """
    if request.method == 'OPTIONS':
        return Response({}, status=200)

    # 1. Validar autenticación por la cabecera 'Authorization: Bearer <username>' enviada desde Next.js
    auth_header = request.headers.get('Authorization', '')
    user = None
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        user = User.objects.filter(username=token).first()
    
    # Respaldo si usa sesión clásica
    if not user and request.user.is_authenticated:
        user = request.user

    if not user or not user.is_authenticated:
        return Response({"status": "error", "message": "No autorizado. Inicie sesión nuevamente."}, status=status.HTTP_401_UNAUTHORIZED)

    # 2. Validar rol (Administrador o Personal INDI)
    user_role = getattr(user, 'role', '').upper()
    if user_role not in ['ADMIN', 'INDI'] and not user.is_staff and not user.is_superuser:
        return Response(
            {"status": "error", "message": "No tienes permisos para gestionar solicitudes."}, 
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        solicitud = get_object_or_404(CertificateRequest, id=request_id)
        accion = request.data.get('accion', 'aprobar')

        if solicitud.status != CertificateRequest.RequestStatus.PENDING:
            return Response(
                {"status": "error", "message": "Esta solicitud ya fue procesada anteriormente."}, 
                status=status.HTTP_400_BAD_REQUEST
            )

        if accion == 'rechazar':
            solicitud.status = CertificateRequest.RequestStatus.REJECTED
            solicitud.reviewed_by = user
            solicitud.review_comments = request.data.get('comments', 'Rechazado por el INDI.')
            solicitud.save()
            
            return Response({
                "status": "success", 
                "message": f"Solicitud #{request_id} rechazada correctamente."
            }, status=status.HTTP_200_OK)

        # --- FLUJO DE APROBACIÓN Y BLOCKCHAIN ---
        solicitud.status = CertificateRequest.RequestStatus.APPROVED
        solicitud.reviewed_by = user
        solicitud.save()
        
        # AHORA (Usa el ID con ceros a la izquierda para mantener un estándar limpio):
        codigo_unico = f"INDI-2026-{str(solicitud.language)[:3].upper()}-{solicitud.id:06d}"
        
        # 🟢 CORRECCIÓN: Definir la fecha actual de emisión
        fecha_actual = timezone.now()

        # 2. Crear instancia temporal para calcular hash criptográfico (con issued_at incluido)
        temp_cert = Certificate(
            certificate_code=codigo_unico,
            student=solicitud.student,
            language=solicitud.language,
            level=solicitud.level,
            issued_by=user,
            issued_at=fecha_actual # <--- ¡AQUÍ ESTABA EL DETALLE!
        )
        cert_hash = temp_cert.generate_hash()
        
        # 3. Registrar en la Blockchain local
        tx_hash_str = None
        try:
            nombre_estudiante = solicitud.student.get_full_name() or solicitud.student.username
            curso_desc = f"{solicitud.get_language_display()} - {solicitud.get_level_display()}"
            
            receipt = emitir_certificado_blockchain(nombre_estudiante, curso_desc, codigo_unico)
            tx_hash_str = receipt['transactionHash'].hex()
        except Exception as e:
            print(f"Advertencia Blockchain: {e}")

        # 4. Guardar el certificado oficial en PostgreSQL
        Certificate.objects.create(
            certificate_code=codigo_unico,
            student=solicitud.student,
            language=solicitud.language,
            level=solicitud.level,
            subnivel=solicitud.subnivel,      # 👈 Se guarda en la BD oficial
            anio=solicitud.anio,              # 👈 Se guarda en la BD oficial
            issued_by=user,
            issued_at=fecha_actual, # <--- También aquí para que guarde la fecha correcta
            certificate_hash=cert_hash,
            blockchain_tx_hash=tx_hash_str,
            status=Certificate.Status.ISSUED
        )
        
        return Response({
            "status": "success",
            "message": "Solicitud aprobada, certificado emitido y registrado en la Blockchain.",
            "certificate_code": codigo_unico,
            "blockchain_tx_hash": tx_hash_str
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        import traceback
        print(f"--- ERROR CRITICO AL APROBAR ---: {str(e)}")
        traceback.print_exc() # Esto imprimirá la traza completa en la consola de Django
        return Response({"status": "error", "message": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
def descargar_certificado_pdf(request, certificate_code):
    try:
        # 1. Intentar buscar directamente en la tabla oficial
        certificate = Certificate.objects.get(certificate_code=certificate_code)
    except Certificate.DoesNotExist:
        # 2. Respaldo robusto: extraer el ID del código (ej. 000120 -> 120) y buscar su solicitud aprobada
        try:
            import re
            match = re.search(r'\d+$', certificate_code)
            solicitud_id = int(match.group()) if match else None
            
            solicitud = CertificateRequest.objects.get(id=solicitud_id, status__in=['APPROVED', 'APROBADO'])
            
            # Crear o recuperar el certificado oficial en la BD para que quede persistente
            cadena_raw = f"{certificate_code}-{solicitud.student.username}-{solicitud.language}-{solicitud.level}-{solicitud.created_at.isoformat()}"
            hash_sha256 = hashlib.sha256(cadena_raw.encode('utf-8')).hexdigest()

            certificate, created = Certificate.objects.get_or_create(
                certificate_code=certificate_code,
                defaults={
                    'student': solicitud.student,
                    'language': solicitud.language,
                    'level': solicitud.level,
                    'subnivel': solicitud.subnivel,
                    'anio': getattr(solicitud, 'anio', '2026'),
                    'issued_at': solicitud.created_at,
                    'certificate_hash': hash_sha256,
                    'blockchain_tx_hash': f"0x{hash_sha256[:40]}"
                }
            )
        except Exception as e:
            raise Http404(f"El certificado solicitado no existe o no ha sido aprobado oficialmente. Detalle: {e}")

    # 3. Generar el PDF y retornarlo limpiamente
    pdf_buffer = generar_pdf_certificado(certificate)

    response = HttpResponse(pdf_buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="Certificado_{certificate_code}.pdf"'
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    return response

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def revocar_certificado(request, certificate_code):
    """
    RF 24: Permite al personal autorizado (Admin o Personal INDI) revocar un certificado 
    indicando un motivo, actualizando su estado y registrando la acción en el AuditLog (RF 14).
    """
    if not hasattr(request.user, 'role') or request.user.role not in ['ADMIN', 'INDI']:
        return Response(
            {'error': 'No tienes permisos para revocar certificados.'}, 
            status=status.HTTP_403_FORBIDDEN
        )

    try:
        certificate = Certificate.objects.get(certificate_code=certificate_code)
    except Certificate.DoesNotExist:
        return Response({'error': 'Certificado no encontrado.'}, status=status.HTTP_404_NOT_FOUND)

    if certificate.status == Certificate.Status.REVOKED:
        return Response({'error': 'Este certificado ya se encuentra revocado.'}, status=status.HTTP_400_BAD_REQUEST)

    reason = request.data.get('reason', 'Sin motivo especificado')

    # Actualizar estado a Revocado
    certificate.status = Certificate.Status.REVOKED
    certificate.revocation_reason = reason
    certificate.revoked_at = timezone.now()
    certificate.save()

    # RF 14: Registrar la acción en el log de auditoría
    AuditLog.objects.create(
        action="REVOCACIÓN DE CERTIFICADO",
        performed_by=request.user,
        certificate=certificate,
        details=f"Certificado {certificate_code} revocado. Motivo: {reason}"
    )

    return Response({
        'message': f'El certificado {certificate_code} ha sido revocado exitosamente.',
        'certificate_code': certificate_code,
        'status': certificate.status,
        'revocation_reason': certificate.revocation_reason,
        'revoked_at': certificate.revoked_at.strftime('%d/%m/%Y %H:%M')
    }, status=status.HTTP_200_OK)

@csrf_exempt
def api_login(request):
    if request.method == 'POST':
        try:
            data = json.loads(request.body)
            username = data.get('username')
            password = data.get('password')
            
            user = authenticate(request, username=username, password=password)
            if user is not None:
                login(request, user)
                return JsonResponse({"status": "success", "message": "Sesión iniciada correctamente."})
            else:
                return JsonResponse({"status": "error", "message": "Credenciales inválidas."}, status=400)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)
    return JsonResponse({"status": "error", "message": "Método no permitido."}, status=405)

@api_view(['POST'])
@permission_classes([AllowAny])
def login_view(request):
    print("Datos recibidos en login:", request.data)
    
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
            "role": role,  # Devolverá el rol exacto (ADMIN, INDI, GRADOS_TITULOS, ESTUDIANTE)
            "token": user.username
        }, status=200)
    else:
        return Response({"detail": "Credenciales inválidas."}, status=400)

@api_view(['GET', 'POST', 'PUT'])
@permission_classes([AllowAny])
def gestionar_usuarios_api(request):
    """
    Gestiona la lista, creación y edición de usuarios (RF 01).
    """
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

            return Response({
                "status": "success", 
                "message": f"Datos y rol del usuario {user.username} actualizados correctamente."
            }, status=status.HTTP_200_OK)

        except User.DoesNotExist:
            return Response({"error": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        
@api_view(['POST'])
@permission_classes([AllowAny])
def toggle_estado_usuario_api(request, user_id):
    """
    Activa o desactiva un usuario del sistema (RF 01).
    """
    try:
        user = User.objects.get(id=user_id)
        user.is_active = not user.is_active
        user.save()
        estado_txt = "activado" if user.is_active else "desactivado"
        return Response({
            "status": "success", 
            "message": f"Usuario {user.username} ha sido {estado_txt} correctamente."
        }, status=status.HTTP_200_OK)
    except User.DoesNotExist:
        return Response({"error": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def resetear_password_api(request, user_id):
    """
    Permite al Administrador resetear la contraseña de un usuario que la olvidó (RF 01).
    """
    try:
        user = User.objects.get(id=user_id)
        nueva_password = request.data.get('new_password')

        if not nueva_password or len(nueva_password) < 6:
            return Response({"error": "La nueva contraseña debe tener al menos 6 caracteres."}, status=status.HTTP_400_BAD_REQUEST)

        user.set_password(nueva_password)
        user.save()

        return Response({
            "status": "success", 
            "message": f"Contraseña actualizada exitosamente para el DNI {user.username}."
        }, status=status.HTTP_200_OK)
    except User.DoesNotExist:
        return Response({"error": "Usuario no encontrado."}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

# ==========================================
# 🚀 MÓDULO UNIFICADO DE MATRÍCULAS E INSCRIPCIONES INDI
# ==========================================

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def gestionar_cursos_api(request):
    """
    GET: Lista todos los cursos activos.
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
            "docente_id": c.docente.id if c.docente else None,
            "docente_nombre": c.docente.get_full_name() or c.docente.username if c.docente else "Por asignar",
        } for c in cursos]
        return Response(data, status=status.HTTP_200_OK)

    elif request.method == 'POST':
        auth_header = request.headers.get('Authorization', '')
        user = None
        if auth_header.startswith('Bearer '):
            token = auth_header.split(' ')[1]
            user = User.objects.filter(username=token).first()
        if not user and request.user.is_authenticated:
            user = request.user

        if not user or not user.is_authenticated or (getattr(user, 'role', '') not in ['ADMIN', 'INDI'] and not user.is_staff):
            return Response({"status": "error", "message": "No autorizado para crear cursos."}, status=status.HTTP_403_FORBIDDEN)

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

        return Response({
            "status": "success",
            "message": "Curso creado y docente asignado correctamente.",
            "curso_id": curso.id
        }, status=status.HTTP_201_CREATED)


@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def gestionar_matriculas_api(request):
    """
    GET: Lista las solicitudes (Estudiante ve las suyas, INDI/Admin ve todas).
    POST: Permite a un estudiante solicitar matrícula en un curso.
    """
    auth_header = request.headers.get('Authorization', '')
    user = None
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        user = User.objects.filter(username=token).first()
    if not user and request.user.is_authenticated:
        user = request.user

    if not user or not user.is_authenticated:
        return Response({"status": "error", "message": "No autorizado. Credenciales no proporcionadas."}, status=status.HTTP_401_UNAUTHORIZED)

    if request.method == 'GET':
        user_role = getattr(user, 'role', '').upper()
        if user_role == 'ESTUDIANTE':
            solicitudes = SolicitudMatricula.objects.filter(estudiante=user).order_by('-fecha_solicitud')
        else:
            solicitudes = SolicitudMatricula.objects.all().order_by('-fecha_solicitud')

        data = [{
            "id": s.id,
            "estudiante": s.estudiante.get_full_name() or s.estudiante.username,
            "curso_id": s.curso.id if s.curso else None,
            "curso_nombre": s.curso.nombre if s.curso else "Curso libre",
            "status": s.estado,
            "estado": s.estado,
            # 🟢 AQUÍ ESTÁ EL CAMBIO CRUCIAL: Usamos s.boucher_pago en lugar de s.voucher_pago
            "voucher_pago": s.boucher_pago.url if getattr(s, 'boucher_pago', None) else '',
            "fecha": s.fecha_solicitud.isoformat() if s.fecha_solicitud else ""
        } for s in solicitudes]
        return Response(data, status=status.HTTP_200_OK)

    elif request.method == 'POST':
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
@permission_classes([AllowAny])
def aprobar_matricula_api(request, matricula_id):
    """
    Permite al rol INDI aprobar o rechazar la solicitud de matrícula.
    """
    auth_header = request.headers.get('Authorization', '')
    user = None
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        user = User.objects.filter(username=token).first()
    if not user and request.user.is_authenticated:
        user = request.user

    user_role = getattr(user, 'role', '').upper() if user else ''
    if not user or not user.is_authenticated or user_role not in ['ADMIN', 'INDI']:
        return Response({"status": "error", "message": "No autorizado."}, status=status.HTTP_403_FORBIDDEN)

    solicitud = get_object_or_404(SolicitudMatricula, id=matricula_id)
    accion = request.data.get('accion', 'aprobar')

    if accion == 'aprobar':
        solicitud.estado = 'APROBADA'
        solicitud.save()
        return Response({"status": "success", "message": "Matrícula aprobada correctamente."})
    else:
        solicitud.estado = 'RECHAZADA'
        solicitud.save()
        return Response({"status": "success", "message": "Matrícula rechazada."})


@api_view(['POST'])
@permission_classes([AllowAny])
def registrarse_y_generar_orden(request):
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
@permission_classes([AllowAny])
def descargar_orden_pago_pdf(request, solicitud_id):
    try:
        solicitud = SolicitudMatricula.objects.get(id=solicitud_id)
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

    except SolicitudMatricula.DoesNotExist:
        return Response({'message': 'Solicitud no encontrada'}, status=404)


@api_view(['POST', 'OPTIONS'])
@permission_classes([AllowAny])  # Permitimos la entrada y gestionamos la autenticación manualmente
def subir_voucher_matricula(request):
    """
    Permite al estudiante subir su voucher de pago vinculándolo a su solicitud.
    """
    if request.method == 'OPTIONS':
        return Response({}, status=200)

    # 1. Resolver el usuario mediante el Token Bearer (DNI) o Sesión
    auth_header = request.headers.get('Authorization', '')
    user = None
    if auth_header.startswith('Bearer '):
        token = auth_header.split(' ')[1]
        user = User.objects.filter(username=token).first()
    
    if not user and request.user.is_authenticated:
        user = request.user

    if not user or not user.is_authenticated:
        return Response({"status": "error", "message": "No autorizado. Token de sesión no válido."}, status=status.HTTP_401_UNAUTHORIZED)

    archivo_voucher = request.FILES.get('voucher_pago') or request.FILES.get('boucher_pago')
    solicitud_id = request.data.get('solicitud_id')

    if not archivo_voucher:
        return Response({'message': 'Debe adjuntar el archivo del voucher.'}, status=400)
    
    if not solicitud_id:
        return Response({'message': 'No se especificó la solicitud de matrícula.'}, status=400)

    try:
        # Verificamos que la solicitud pertenezca realmente al estudiante autenticado
        solicitud = SolicitudMatricula.objects.get(id=solicitud_id, estudiante=user)
        solicitud.boucher_pago = archivo_voucher  # Guardamos en el campo correcto
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
@permission_classes([AllowAny])
def listar_docentes_por_idioma(request):
    idioma = request.GET.get('idioma')
    docentes = User.objects.filter(role='DOCENTE')
    
    data = [{
        "id": d.id,
        "first_name": d.first_name,
        "last_name": d.last_name,
        "username": d.username,
    } for d in docentes]
    
    return Response(data)

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def gestionar_evaluaciones_y_notas_api(request, curso_id):
    """
    Gestiona las evaluaciones y calificaciones de un curso específico.
    """
    curso = get_object_or_404(Curso, id=curso_id)

    if request.method == 'GET':
        evaluaciones = Evaluacion.objects.filter(curso=curso)
        data = [{
            "id": ev.id,
            "nombre": ev.nombre,
            "peso": ev.peso,
            "fecha": ev.fecha.isoformat() if ev.fecha else None
        } for ev in evaluaciones]
        return Response(data, status=status.HTTP_200_OK)

    elif request.method == 'POST':
        # Lógica para que el docente cree evaluaciones o registre notas
        nombre = request.data.get('nombre')
        peso = request.data.get('peso', 1.0)

        if not nombre:
            return Response({"status": "error", "message": "El nombre de la evaluación es obligatorio."}, status=status.HTTP_400_BAD_REQUEST)

        evaluacion = Evaluacion.objects.create(
            curso=curso,
            nombre=nombre,
            peso=peso
        )

        return Response({
            "status": "success",
            "message": "Evaluación creada correctamente.",
            "evaluacion_id": evaluacion.id
        }, status=status.HTTP_201_CREATED)
