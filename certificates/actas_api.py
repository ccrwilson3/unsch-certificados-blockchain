"""Vistas del acta de notas: ver, firmar (docente / Dirección), observar, reabrir, ampliar plazo y PDF."""
import io

from django.core.cache import cache
from django.db import transaction
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from . import actas as A
from .models import ActaEvento, ActaNotas, Curso, Matricula, User
from .views import (
    _enlace_portal, _error, destinatarios_del_usuario, enviar_lote,
    es_personal_indi, exigir_usuario, registrar_auditoria, rol_de,
)

E = ActaNotas.Estado


def _nombre(u):
    return (u.get_full_name() or u.username) if u else ''


def _es_docente_del_curso(user, curso):
    return rol_de(user) == 'DOCENTE' and curso.docente_id == user.id


def _puede_ver(user, curso):
    return _es_docente_del_curso(user, curso) or es_personal_indi(user) or rol_de(user) == 'GRADOS_TITULOS'


def _iso(dt):
    return timezone.localtime(dt).isoformat() if dt else None


def _correos_indi():
    lista = []
    for u in User.objects.filter(role='INDI', is_active=True):
        lista.extend(c for c in destinatarios_del_usuario(u) if c not in lista)
    return lista


def _evento(acta, accion, user, comentario='', hash_=''):
    return ActaEvento.objects.create(
        acta=acta, accion=accion, usuario=user, comentario=comentario, version=acta.version, hash=hash_,
    )


def _acta_a_dict(curso, acta):
    limite = A.plazo_limite(curso, acta)
    return {
        "codigo": acta.codigo,
        "estado": acta.estado,
        "estado_texto": acta.get_estado_display(),
        "version": acta.version,
        "hash": acta.hash_vigente,
        "plazo_limite": limite.isoformat() if limite else None,
        "plazo_vencido": A.plazo_vencido(curso, acta) and acta.estado == E.BORRADOR,
        "plazo_extra_dias": acta.plazo_extra_dias,
        "plazo_base_dias": A.plazo_dias_base(),
        "fecha_fin_curso": curso.fecha_fin.isoformat() if curso.fecha_fin else None,
        "firma_docente": {"por": _nombre(acta.firmada_docente_por), "en": _iso(acta.firmada_docente_en)}
        if acta.firmada_docente_en else None,
        "firma_direccion": {"por": _nombre(acta.firmada_direccion_por), "en": _iso(acta.firmada_direccion_en)}
        if acta.firmada_direccion_en else None,
    }


# ----------------------------------------------------------
# VER EL ACTA DE UN CURSO
# ----------------------------------------------------------
@api_view(['GET'])
@permission_classes([AllowAny])  # la autenticación y el rol se validan dentro
def acta_curso_api(request, curso_id):
    user, error = exigir_usuario(request)
    if error:
        return error
    curso = get_object_or_404(Curso, id=curso_id)
    if not _puede_ver(user, curso):
        return _error("No tienes permisos sobre esta acta.", status.HTTP_403_FORBIDDEN)

    acta = A.obtener_acta(curso)
    editable = acta.estado in A.ESTADOS_EDITABLES
    vivo = A.construir_snapshot(curso)
    firmado = acta.estado in (E.FIRMADA_DOCENTE, E.CERRADA) and acta.snapshot
    tabla = acta.snapshot if firmado else vivo
    integridad = A.integridad(curso, acta)
    cambio_tras_firma = bool(firmado and A.hash_snapshot(vivo) != acta.hash_vigente)

    es_doc = _es_docente_del_curso(user, curso)
    es_indi = es_personal_indi(user)
    problemas = A.problemas_para_firmar(vivo) if editable else []
    bloqueo = A.motivo_bloqueo_notas(curso)

    permisos = {
        "firmar_docente": es_doc and editable and not bloqueo and not problemas,
        "observar": es_indi and acta.estado == E.FIRMADA_DOCENTE,
        "firmar_direccion": es_indi and acta.estado == E.FIRMADA_DOCENTE and not cambio_tras_firma,
        "reabrir": es_indi and acta.estado == E.CERRADA,
        "ampliar_plazo": es_indi and acta.estado == E.BORRADOR and bool(curso.fecha_fin),
        "descargar_pdf": True,
    }

    eventos = [{
        "accion": ev.accion, "por": _nombre(ev.usuario), "comentario": ev.comentario,
        "version": ev.version, "fecha": _iso(ev.fecha), "ip": ev.ip_address or "",
        "hash": ev.hash,
    } for ev in acta.eventos.select_related('usuario')]

    return Response({
        "acta": _acta_a_dict(curso, acta),
        "tabla": tabla,
        "tabla_es_firmada": bool(firmado),
        "editable": editable and not bloqueo,
        "motivo_bloqueo": bloqueo,
        "problemas": problemas,
        "integridad": integridad,
        "cambio_tras_firma": cambio_tras_firma,
        "permisos": permisos,
        "eventos": eventos,
    })


# ----------------------------------------------------------
# LISTA DE ACTAS (INDI / Administrador / Grados y Títulos)
# ----------------------------------------------------------
@api_view(['GET'])
@permission_classes([AllowAny])
def actas_lista_api(request):
    user, error = exigir_usuario(request)
    if error:
        return error
    if not (es_personal_indi(user) or rol_de(user) == 'GRADOS_TITULOS'):
        return _error("No tienes permisos para ver las actas.", status.HTTP_403_FORBIDDEN)

    cursos = list(Curso.objects.select_related('docente').order_by('-periodo', 'nombre'))
    actas = {a.curso_id: a for a in ActaNotas.objects.all()}
    matriculados = {}
    for cid in Matricula.objects.filter(status=Matricula.MatriculaStatus.APPROVED).values_list('curso_id', flat=True):
        matriculados[cid] = matriculados.get(cid, 0) + 1

    data = []
    for c in cursos:
        a = actas.get(c.id) or ActaNotas(curso=c)
        limite = A.plazo_limite(c, a)
        data.append({
            "curso_id": c.id, "curso": c.nombre, "periodo": c.periodo,
            "idioma": c.get_language_display(), "nivel": c.get_level_display(), "subnivel": c.subnivel,
            "docente": _nombre(c.docente) or "Sin docente",
            "matriculados": matriculados.get(c.id, 0),
            "estado": a.estado, "estado_texto": a.get_estado_display(),
            "codigo": f"ACTA-{c.periodo}-{c.id:04d}",
            "version": a.version,
            "fecha_fin_curso": c.fecha_fin.isoformat() if c.fecha_fin else None,
            "plazo_limite": limite.isoformat() if limite else None,
            "plazo_vencido": bool(a.estado == E.BORRADOR and A.plazo_vencido(c, a)),
            "firmada_docente_en": _iso(a.firmada_docente_en),
            "cerrada_en": _iso(a.firmada_direccion_en),
            "integridad": A.integridad(c, a) if a.pk else None,
        })
    return Response(data)


# ----------------------------------------------------------
# ACCIONES SOBRE EL ACTA
# ----------------------------------------------------------
@api_view(['POST'])
@permission_classes([AllowAny])
def acta_accion_api(request, curso_id):
    """
    Cuerpo: {"accion": firmar_docente | observar | firmar_direccion | reabrir | ampliar_plazo,
             "password": "...", "comentario": "...", "dias": 7}
    Las firmas y la reapertura piden la contraseña de quien actúa (firma electrónica).
    """
    user, error = exigir_usuario(request)
    if error:
        return error
    curso = get_object_or_404(Curso, id=curso_id)
    accion = str(request.data.get('accion') or '').strip()
    comentario = str(request.data.get('comentario') or '').strip()

    if accion in ('firmar_docente', 'firmar_direccion', 'reabrir'):
        # Tope de contraseñas erróneas por usuario (la firma pide la clave: no debe servir para adivinarla)
        clave_fallos = f"firma_acta_fallos:{user.id}"
        if cache.get(clave_fallos, 0) >= 5:
            return _error("Demasiados intentos con contraseña incorrecta. Espera 10 minutos.", status.HTTP_429_TOO_MANY_REQUESTS)
        if not user.check_password(str(request.data.get('password') or '')):
            cache.add(clave_fallos, 0, 10 * 60)
            try:
                cache.incr(clave_fallos)
            except ValueError:
                cache.set(clave_fallos, 1, 10 * 60)
            registrar_auditoria(user, "FIRMA DE ACTA RECHAZADA", f"Contraseña incorrecta al intentar '{accion}' en el curso '{curso.nombre}'.")
            return _error("La contraseña no es correcta. La firma no se realizó.", status.HTTP_400_BAD_REQUEST)
        cache.delete(clave_fallos)

    with transaction.atomic():
        acta = ActaNotas.objects.select_for_update().get_or_create(curso=curso)[0]

        # ---------------- Firma del docente ----------------
        if accion == 'firmar_docente':
            if not _es_docente_del_curso(user, curso):
                return _error("Solo el docente del curso puede firmar el acta.", status.HTTP_403_FORBIDDEN)
            if acta.estado not in A.ESTADOS_EDITABLES:
                return _error("El acta ya fue firmada o cerrada.", status.HTTP_409_CONFLICT)
            bloqueo = A.motivo_bloqueo_notas(curso)
            if bloqueo:
                return _error(bloqueo, status.HTTP_423_LOCKED)
            snap = A.construir_snapshot(curso)
            problemas = A.problemas_para_firmar(snap)
            if problemas:
                return _error("El acta aún no está lista para firmar: " + " ".join(problemas), status.HTTP_400_BAD_REQUEST)

            acta.snapshot = snap
            acta.hash_vigente = A.hash_snapshot(snap)
            acta.estado = E.FIRMADA_DOCENTE
            acta.firmada_docente_por = user
            acta.firmada_docente_en = timezone.now()
            acta.firmada_direccion_por = None
            acta.firmada_direccion_en = None
            acta.save()
            _evento(acta, 'FIRMA_DOCENTE', user, hash_=acta.hash_vigente)
            registrar_auditoria(user, "FIRMA DE ACTA (DOCENTE)", f"{acta.codigo} v{acta.version} firmada. Hash {acta.hash_vigente[:16]}…")

            correos = _correos_indi()
            if correos:
                enviar_lote([(
                    correos, f"Acta lista para revisión: {curso.nombre}", "Hay un acta para revisar",
                    [f"El docente {_nombre(user)} firmó el acta de notas de {curso.nombre} ({curso.periodo}).",
                     "Revísala y, si está correcta, fírmala como Dirección del INDI."],
                    ("Ir a las actas", _enlace_portal('/indi/actas')),
                )])
            return Response({"status": "success", "message": "Acta firmada. Quedó enviada al INDI para su revisión."})

        # ---------------- Acciones del INDI ----------------
        if not es_personal_indi(user):
            return _error("Solo el personal del INDI puede realizar esta acción.", status.HTTP_403_FORBIDDEN)

        if accion == 'observar':
            if acta.estado != E.FIRMADA_DOCENTE:
                return _error("Solo se puede observar un acta que el docente ya firmó.", status.HTTP_409_CONFLICT)
            if len(comentario) < 5:
                return _error("Escribe qué debe corregir el docente (mínimo 5 caracteres).", status.HTTP_400_BAD_REQUEST)
            _evento(acta, 'OBSERVACION', user, comentario, acta.hash_vigente)
            acta.estado = E.OBSERVADA
            acta.snapshot, acta.hash_vigente = {}, ''
            acta.firmada_docente_por = acta.firmada_docente_en = None
            acta.save()
            registrar_auditoria(user, "ACTA OBSERVADA", f"{acta.codigo}: {comentario}")
            if curso.docente:
                enviar_lote([(
                    destinatarios_del_usuario(curso.docente), f"Acta observada: {curso.nombre}", "El INDI observó tu acta",
                    [f"Hola {_nombre(curso.docente)},",
                     f"El INDI devolvió el acta de {curso.nombre} para su corrección.",
                     f"Observación: {comentario}",
                     "Corrige las notas y vuelve a firmar el acta."],
                    ("Ir al registro de notas", _enlace_portal(f'/docente/notas/{curso.id}')),
                )] if destinatarios_del_usuario(curso.docente) else [])
            return Response({"status": "success", "message": "Acta devuelta al docente con tu observación."})

        if accion == 'firmar_direccion':
            if acta.estado != E.FIRMADA_DOCENTE:
                return _error("Solo se puede firmar un acta que el docente ya firmó.", status.HTTP_409_CONFLICT)
            if A.hash_snapshot(A.construir_snapshot(curso)) != acta.hash_vigente:
                return _error(
                    "Las notas o la lista de matriculados cambiaron después de la firma del docente. "
                    "Observa el acta para que el docente la revise y la firme de nuevo.", status.HTTP_409_CONFLICT)
            acta.estado = E.CERRADA
            acta.firmada_direccion_por = user
            acta.firmada_direccion_en = timezone.now()
            acta.save()
            _evento(acta, 'FIRMA_DIRECCION', user, comentario, acta.hash_vigente)
            registrar_auditoria(user, "ACTA CERRADA (DIRECCIÓN)", f"{acta.codigo} v{acta.version} firmada por la Dirección y cerrada.")
            if curso.docente and destinatarios_del_usuario(curso.docente):
                enviar_lote([(
                    destinatarios_del_usuario(curso.docente), f"Acta aprobada: {curso.nombre}", "Tu acta fue aprobada",
                    [f"Hola {_nombre(curso.docente)},",
                     f"El acta de {curso.nombre} fue firmada por la Dirección del INDI y quedó cerrada."],
                    None,
                )])
            return Response({"status": "success", "message": "Acta firmada por la Dirección y cerrada. Las notas quedaron bloqueadas."})

        if accion == 'reabrir':
            if acta.estado != E.CERRADA:
                return _error("Solo se puede reabrir un acta cerrada.", status.HTTP_409_CONFLICT)
            if len(comentario) < 10:
                return _error("Escribe el motivo de la corrección (mínimo 10 caracteres).", status.HTTP_400_BAD_REQUEST)
            _evento(acta, 'REAPERTURA', user, comentario, acta.hash_vigente)
            acta.version += 1
            acta.estado = E.REABIERTA
            acta.snapshot, acta.hash_vigente = {}, ''
            acta.firmada_docente_por = acta.firmada_docente_en = None
            acta.firmada_direccion_por = acta.firmada_direccion_en = None
            acta.save()
            registrar_auditoria(user, "ACTA REABIERTA", f"{acta.codigo} reabierta (nueva versión {acta.version}). Motivo: {comentario}")
            if curso.docente and destinatarios_del_usuario(curso.docente):
                enviar_lote([(
                    destinatarios_del_usuario(curso.docente), f"Acta reabierta: {curso.nombre}", "Tu acta fue reabierta para corrección",
                    [f"Hola {_nombre(curso.docente)},",
                     f"El INDI reabrió el acta de {curso.nombre}. Motivo: {comentario}",
                     "Haz la corrección y vuelve a firmar el acta."],
                    ("Ir al registro de notas", _enlace_portal(f'/docente/notas/{curso.id}')),
                )])
            return Response({"status": "success", "message": "Acta reabierta. El docente debe corregir y firmar de nuevo."})

        if accion == 'ampliar_plazo':
            if acta.estado != E.BORRADOR:
                return _error("Solo se amplía el plazo de un acta que el docente aún no firma.", status.HTTP_409_CONFLICT)
            if not curso.fecha_fin:
                return _error("Este curso no tiene fecha de culminación; no hay plazo que ampliar.", status.HTTP_400_BAD_REQUEST)
            try:
                dias = int(request.data.get('dias', 7))
            except (TypeError, ValueError):
                return _error("Indica los días como número.", status.HTTP_400_BAD_REQUEST)
            if dias < 1 or dias > 30:
                return _error("Puedes ampliar entre 1 y 30 días.", status.HTTP_400_BAD_REQUEST)
            if acta.plazo_extra_dias + dias > 90:
                return _error("El plazo total ampliado no puede pasar de 90 días.", status.HTTP_400_BAD_REQUEST)
            acta.plazo_extra_dias += dias
            acta.save(update_fields=['plazo_extra_dias', 'actualizada'])
            nuevo = A.plazo_limite(curso, acta)
            _evento(acta, 'AMPLIACION_PLAZO', user, f"+{dias} días. Nuevo límite: {nuevo.strftime('%d/%m/%Y')}. {comentario}".strip())
            registrar_auditoria(user, "PLAZO DE ACTA AMPLIADO", f"{acta.codigo}: +{dias} día(s), nuevo límite {nuevo.strftime('%d/%m/%Y')}.")
            if curso.docente and destinatarios_del_usuario(curso.docente):
                enviar_lote([(
                    destinatarios_del_usuario(curso.docente), f"Plazo ampliado: {curso.nombre}", "El INDI amplió tu plazo",
                    [f"Hola {_nombre(curso.docente)},",
                     f"Puedes registrar y firmar las notas de {curso.nombre} hasta el {nuevo.strftime('%d/%m/%Y')}."],
                    ("Ir al registro de notas", _enlace_portal(f'/docente/notas/{curso.id}')),
                )])
            return Response({"status": "success", "message": f"Plazo ampliado hasta el {nuevo.strftime('%d/%m/%Y')}."})

    return _error("Acción no válida.", status.HTTP_400_BAD_REQUEST)


# ----------------------------------------------------------
# PDF DEL ACTA
# ----------------------------------------------------------
def _fmt_fecha(dt):
    return timezone.localtime(dt).strftime('%d/%m/%Y %H:%M') if dt else ''


@api_view(['GET'])
@permission_classes([AllowAny])
def acta_pdf_api(request, curso_id):
    user, error = exigir_usuario(request)
    if error:
        return error
    curso = get_object_or_404(Curso, id=curso_id)
    if not _puede_ver(user, curso):
        return _error("No tienes permisos sobre esta acta.", status.HTTP_403_FORBIDDEN)

    acta = A.obtener_acta(curso)
    firmado = acta.estado in (E.FIRMADA_DOCENTE, E.CERRADA) and acta.snapshot
    snap = acta.snapshot if firmado else A.construir_snapshot(curso)
    cerrada = acta.estado == E.CERRADA

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=landscape(A4), leftMargin=1.5 * cm, rightMargin=1.5 * cm,
                            topMargin=1.5 * cm, bottomMargin=1.5 * cm, title=f"Acta de notas {acta.codigo}")
    base = getSampleStyleSheet()
    titulo = ParagraphStyle('t', parent=base['Title'], fontSize=14, spaceAfter=2)
    centro = ParagraphStyle('c', parent=base['Normal'], alignment=1, fontSize=9)
    normal = ParagraphStyle('n', parent=base['Normal'], fontSize=9, leading=12)
    chico = ParagraphStyle('s', parent=base['Normal'], fontSize=7.5, leading=10, textColor=colors.HexColor('#475569'))

    c = snap["curso"]
    elementos = [
        Paragraph("UNIVERSIDAD NACIONAL DE SAN CRISTÓBAL DE HUAMANGA", centro),
        Paragraph("INSTITUTO DE IDIOMAS — INDI", centro),
        Paragraph(f"ACTA DE NOTAS · {acta.codigo}", titulo),
    ]
    if not cerrada:
        elementos.append(Paragraph(
            f"<font color='#b91c1c'><b>DOCUMENTO SIN VALOR OFICIAL — Estado: {acta.get_estado_display()}</b></font>", centro))
    elementos += [
        Spacer(1, 0.3 * cm),
        Paragraph(f"<b>Curso:</b> {c['nombre']} &nbsp;&nbsp; <b>Idioma:</b> {c['idioma']} &nbsp;&nbsp; "
                  f"<b>Nivel:</b> {c['nivel']} - {c['subnivel']} &nbsp;&nbsp; <b>Período:</b> {c['periodo']}", normal),
        Paragraph(f"<b>Docente:</b> {snap['docente'] or '—'} &nbsp;&nbsp; <b>Modalidad:</b> {c['modalidad']} "
                  f"&nbsp;&nbsp; <b>Horario:</b> {c['horario'] or '—'} &nbsp;&nbsp; <b>Versión del acta:</b> {acta.version}", normal),
        Spacer(1, 0.3 * cm),
    ]

    cabecera = ['N°', 'DNI', 'Apellidos y nombres'] + [f"{e['titulo']}\n({e['peso'].rstrip('0').rstrip('.')}%)" for e in snap['evaluaciones']] + ['Promedio', 'Condición']
    filas = [cabecera]
    aprobados = desaprobados = 0
    for i, e in enumerate(snap['estudiantes'], start=1):
        cond = e['condicion']
        aprobados += cond == 'APROBADO'
        desaprobados += cond == 'DESAPROBADO'
        filas.append([i, e['dni'], f"{e['apellidos']}, {e['nombres']}".strip(', ')]
                     + [n if n is not None else '—' for n in e['notas']]
                     + [e['promedio'] or '—', (cond or '—').title()])
    tabla = Table(filas, repeatRows=1)
    tabla.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 8), ('GRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#94a3b8')),
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0')), ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (3, 0), (-1, -1), 'CENTER'), ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8fafc')]),
    ]))
    elementos += [tabla, Spacer(1, 0.3 * cm),
                  Paragraph(f"Total: {len(snap['estudiantes'])} estudiante(s) · Aprobados: {aprobados} · Desaprobados: {desaprobados} · "
                            f"Nota mínima aprobatoria: 11", normal), Spacer(1, 0.5 * cm)]

    def bloque_firma(titulo_firma, por, en):
        if not en:
            return [Paragraph(f"<b>{titulo_firma}</b>", normal), Paragraph("Pendiente de firma", chico)]
        return [Paragraph(f"<b>{titulo_firma}</b>", normal),
                Paragraph(f"Firmado electrónicamente por <b>{_nombre(por)}</b>", chico),
                Paragraph(f"{_fmt_fecha(en)}", chico)]

    firmas = Table([[
        bloque_firma("Docente del curso", acta.firmada_docente_por, acta.firmada_docente_en),
        bloque_firma("Dirección del INDI", acta.firmada_direccion_por, acta.firmada_direccion_en),
    ]], colWidths=[12 * cm, 12 * cm])
    firmas.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'TOP'), ('BOX', (0, 0), (-1, -1), 0.4, colors.HexColor('#94a3b8')),
                                ('INNERGRID', (0, 0), (-1, -1), 0.4, colors.HexColor('#94a3b8')), ('TOPPADDING', (0, 0), (-1, -1), 8),
                                ('BOTTOMPADDING', (0, 0), (-1, -1), 8)]))
    elementos.append(firmas)
    if acta.hash_vigente:
        elementos += [Spacer(1, 0.3 * cm),
                      Paragraph(f"Huella digital de las notas firmadas (SHA-256): {acta.hash_vigente}", chico)]
    elementos.append(Paragraph(f"Generado el {_fmt_fecha(timezone.now())} desde el sistema de certificados del INDI.", chico))

    doc.build(elementos)
    respuesta = HttpResponse(buffer.getvalue(), content_type='application/pdf')
    respuesta['Content-Disposition'] = f'inline; filename="{acta.codigo}.pdf"'
    registrar_auditoria(user, "DESCARGA DE ACTA", f"{acta.codigo} ({acta.get_estado_display()}).")
    return respuesta
