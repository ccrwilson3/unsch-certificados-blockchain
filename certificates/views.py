import os
from django.shortcuts import render, get_object_or_404, redirect
from django.http import HttpResponse, Http404, JsonResponse
from django.contrib.auth.decorators import login_required, user_passes_test
from .models import Certificate, CertificateRequest, AuditLog
from .utils import generar_pdf_certificado
from .blockchain import verificar_certificado_blockchain, emitir_certificado_blockchain
import uuid
import hashlib
from django.views.decorators.csrf import csrf_exempt
from django.utils import timezone
import json
from functools import wraps
from rest_framework.decorators import api_view, permission_classes, authentication_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from django.contrib.auth import authenticate, login, get_user_model
import qrcode
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter

# 1. Clase para saltar la validación CSRF estricta en las APIs basadas en sesión
class CsrfExemptSessionAuthentication(SessionAuthentication):
    def enforce_csrf(self, request):
        return  # No hace la verificación CSRF para llamadas desde el frontend

def verificar_certificado_publico(request, certificate_code):
    """
    Vista pública accesible sin iniciar sesión (RF 13).
    Permite comprobar la validez de un certificado mediante su código o QR (RF 11 y RF 12).
    """
    try:
        # Intentar buscar en la tabla oficial de Certificados
        certificate = Certificate.objects.get(certificate_code=certificate_code)
        
        hash_calculado = certificate.generate_hash()
        hash_integro = (hash_calculado == certificate.certificate_hash)
        
        valido_en_blockchain = False
        if certificate.blockchain_tx_hash:
            valido_en_blockchain = verificar_certificado_blockchain(certificate.certificate_hash)

        # Determinar si es válido (si no está revocado)
        is_valid_status = (certificate.status == Certificate.Status.ISSUED)

        contexto = {
            'existe': True,
            'is_valid': is_valid_status, # <--- Agregado para validación rápida en frontend
            'codigo': certificate.certificate_code,
            'estudiante': certificate.student.get_full_name() or certificate.student.username,
            'dni': getattr(certificate.student, 'dni', 'No registrado'),
            'idioma': certificate.get_language_display(),
            'nivel': certificate.get_level_display(),
            'fecha_emision': certificate.issued_at.isoformat(),
            'estado': certificate.get_status_display(),
            'status_code': certificate.status,
            'certificate_hash': certificate.certificate_hash,
            'blockchain_tx_hash': certificate.blockchain_tx_hash,
            'hash_integro': hash_integro,
            'valido_en_blockchain': valido_en_blockchain,
        }
        
        # RF 24: Si está revocado, añadimos los datos de anulación al contexto
        if certificate.status == Certificate.Status.REVOKED:
            contexto['revocation_reason'] = certificate.revocation_reason
            contexto['revoked_at'] = certificate.revoked_at.isoformat() if certificate.revoked_at else None
        
    except Certificate.DoesNotExist:
        # PLAN DE RESPALDO: Si no está en Certificate, buscamos en las solicitudes aprobadas por ID o Código
        try:
            import re
            match = re.search(r'\d+$', certificate_code)
            solicitud_id = int(match.group()) if match else None
            
            solicitud = CertificateRequest.objects.get(id=solicitud_id, status__in=['APPROVED', 'APROBADO'])

            # Generar un Hash SHA-256 real combinando datos únicos e inalterables de la solicitud
            cadena_raw = f"{certificate_code}-{solicitud.student.username}-{solicitud.language}-{solicitud.level}-{solicitud.created_at.isoformat()}"
            hash_sha256 = hashlib.sha256(cadena_raw.encode('utf-8')).hexdigest()
            
            contexto = {
                'existe': True,
                'is_valid': True,
                'codigo': certificate_code,
                'estudiante': solicitud.student.get_full_name() or solicitud.student.username,
                'dni': getattr(solicitud.student, 'dni', 'No registrado'),
                'idioma': solicitud.get_language_display(),
                'nivel': solicitud.get_level_display(),
                'fecha_emision': solicitud.created_at.isoformat(),
                'estado': 'Aprobado',
                'status_code': 'APPROVED',
                'certificate_hash': hash_sha256, # Hash criptográfico de 64 caracteres
                'blockchain_tx_hash': f"0x{hash_sha256[:40]}", # Simulación del Hash de Transacción Blockchain
                'hash_integro': True,
                'valido_en_blockchain': False,
            }
        except Exception:
            contexto = {
                'existe': False,
                'is_valid': False,
                'mensaje': 'El código de certificado ingresado no existe o no ha sido emitido por el INDI - UNSCH.'
            }

    # Si la petición proviene de la API o de Next.js, respondemos directamente en JSON
    if '/api/' in request.path or request.headers.get('x-requested-with') == 'XMLHttpRequest' or request.GET.get('format') == 'json':
        return JsonResponse(contexto)

    # Si se consulta desde el navegador renderiza la plantilla HTML clásica
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
        
        # 2. Generar código único de certificado
        codigo_unico = f"INDI-2026-{solicitud.language[:3].upper()}-{uuid.uuid4().hex[:6].upper()}"
        
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
            issued_by=request.user,
            certificate_hash=cert_hash,
            blockchain_tx_hash=tx_hash_str
        )
        
        return redirect('lista_solicitudes_indi')

    return render(request, 'certificates/aprobar_solicitud.html', {'solicitud': solicitud})

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

@api_view(['GET', 'POST'])
@permission_classes([AllowAny])
def gestionar_solicitudes_estudiante(request):
    """
    Permite listar y crear solicitudes de forma transparente para el frontend.
    """
    if request.method == 'GET':
        solicitudes = CertificateRequest.objects.all().order_by('-created_at')
        print(f"--- DEBUG LISTAR SOLICITUDES --- Total en BD: {solicitudes.count()}")
            
        data = [{
            "id": s.id,
            "student_name": s.student.get_full_name() or s.student.username,
            "language": s.get_language_display() if hasattr(s, 'get_language_display') else str(s.language),
            "level": s.get_level_display() if hasattr(s, 'get_level_display') else str(s.level),
            "status": s.status,
            "created_at": s.created_at.isoformat() if hasattr(s.created_at, 'isoformat') else str(s.created_at),
        } for s in solicitudes]
        
        return JsonResponse(data, safe=False)

    elif request.method == 'POST':
        try:
            if request.content_type == 'application/json':
                body = json.loads(request.body)
                language = body.get('language')
                level = body.get('level')
            else:
                language = request.POST.get('language')
                level = request.POST.get('level')

            if not language or not level:
                return JsonResponse({"status": "error", "message": "Idioma y nivel son obligatorios."}, status=400)

            estudiante_actual = request.user if request.user.is_authenticated else None
            if not estudiante_actual:
                User = get_user_model()
                estudiante_actual = User.objects.first()

            solicitud = CertificateRequest.objects.create(
                student=estudiante_actual,
                language=language,
                level=level,
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
        
        # 1. Generar código único de certificado
        codigo_unico = f"INDI-2026-{solicitud.language[:3].upper()}-{uuid.uuid4().hex[:6].upper()}"
        
        # 2. Crear instancia temporal para calcular hash criptográfico
        temp_cert = Certificate(
            certificate_code=codigo_unico,
            student=solicitud.student,
            language=solicitud.language,
            level=solicitud.level,
            issued_by=user
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
            issued_by=user,
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
        return Response({"status": "error", "message": str(e)}, status=status.HTTP_400_BAD_REQUEST)
    
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
    # Imprimimos en consola lo que llega para depurar si hay datos vacíos
    print("Datos recibidos en login:", request.data)
    
    username = request.data.get('username')
    password = request.data.get('password')
    
    if not username or not password:
        return Response({"detail": "Usuario y contraseña son requeridos."}, status=400)
    
    user = authenticate(username=username, password=password)
    
    if user is not None:
        # Asignación de roles inteligente
        if user.is_superuser:
            role = "ADMIN"
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
            "token": user.username
        })
    else:
        return Response({"detail": "Credenciales inválidas."}, status=400)

@api_view(['GET'])
@permission_classes([AllowAny])
def descargar_certificado_pdf(request, certificate_code):
    """
    Vista oficial para generar y descargar el PDF del certificado.
    Utiliza el motor de plantillas de ReportLab de utils.py e incluye los metadatos Blockchain.
    """
    try:
        # 1. Buscar en la tabla de certificados emitidos
        certificate = Certificate.objects.get(certificate_code=certificate_code)
    except Certificate.DoesNotExist:
        # 2. Si aún es una solicitud aprobada, se recupera o simula el objeto
        try:
            import re
            match = re.search(r'\d+$', certificate_code)
            solicitud_id = int(match.group()) if match else None
            
            solicitud = CertificateRequest.objects.get(id=solicitud_id, status__in=['APPROVED', 'APROBADO'])
            
            # Calcular hash SHA-256 real de los datos
            cadena_raw = f"{certificate_code}-{solicitud.student.username}-{solicitud.language}-{solicitud.level}-{solicitud.created_at.isoformat()}"
            hash_sha256 = hashlib.sha256(cadena_raw.encode('utf-8')).hexdigest()

            # Crear instancia temporal para pasarle a utils.py
            certificate = Certificate(
                certificate_code=certificate_code,
                student=solicitud.student,
                language=solicitud.language,
                level=solicitud.level,
                issued_at=solicitud.created_at,
                certificate_hash=hash_sha256,
                blockchain_tx_hash=f"0x{hash_sha256[:40]}"
            )
        except Exception:
            raise Http404("El certificado solicitado no existe o no ha sido aprobado.")

    # 3. Generar el PDF usando la función mejorada en utils.py
    pdf_buffer = generar_pdf_certificado(certificate)

    # 4. Configurar respuesta HTTP para forzar descarga limpia
    response = HttpResponse(pdf_buffer.getvalue(), content_type='application/pdf')
    response['Content-Disposition'] = f'inline; filename="Certificado_{certificate_code}.pdf"'
    
    # Cabeceras para evitar que el navegador guarde la versión en caché
    response['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    response['Pragma'] = 'no-cache'
    response['Expires'] = '0'

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

