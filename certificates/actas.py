"""
Lógica del acta de notas (sin vistas): instantánea de notas, hash, plazo, bloqueo e integridad.
Las vistas están en actas_api.py. Este archivo no importa views.py al cargarse para evitar
importaciones circulares (views.py usa estas funciones).
"""
import hashlib
import json
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.utils import timezone

from .models import ActaNotas, Calificacion, Evaluacion, Matricula

ESTADOS_EDITABLES = (ActaNotas.Estado.BORRADOR, ActaNotas.Estado.OBSERVADA, ActaNotas.Estado.REABIERTA)


def plazo_dias_base():
    return int(getattr(settings, 'PLAZO_ACTA_DIAS', 7))


def obtener_acta(curso):
    acta, _ = ActaNotas.objects.get_or_create(curso=curso)
    return acta


def plazo_limite(curso, acta):
    """Último día en que el docente puede registrar/firmar notas. None si el curso no tiene fecha de culminación."""
    if not curso.fecha_fin:
        return None
    return curso.fecha_fin + timedelta(days=plazo_dias_base() + (acta.plazo_extra_dias or 0))


def plazo_vencido(curso, acta):
    limite = plazo_limite(curso, acta)
    return bool(limite and timezone.localdate() > limite)


def construir_snapshot(curso):
    """Notas actuales del curso en forma ordenada y estable (la base de la firma y del hash)."""
    from .views import calcular_resumen_notas, NOTA_MINIMA_APROBATORIA  # import tardío (evita ciclo)

    evaluaciones = list(Evaluacion.objects.filter(curso=curso).order_by('id'))
    matriculas = (
        Matricula.objects.filter(curso=curso, status=Matricula.MatriculaStatus.APPROVED)
        .select_related('estudiante')
    )
    ids = [m.estudiante_id for m in matriculas]
    notas = {}
    for c in Calificacion.objects.filter(evaluacion__in=evaluaciones, estudiante_id__in=ids):
        notas.setdefault(c.estudiante_id, {})[c.evaluacion_id] = c.nota

    estudiantes = []
    for m in matriculas:
        e = m.estudiante
        propias = notas.get(e.id, {})
        _, promedio = calcular_resumen_notas(evaluaciones, propias)
        estudiantes.append({
            "dni": str(getattr(e, 'dni', None) or e.username),
            "apellidos": (e.last_name or '').strip(),
            "nombres": (e.first_name or '').strip(),
            "notas": [f"{propias[ev.id]:.2f}" if ev.id in propias else None for ev in evaluaciones],
            "promedio": f"{promedio:.2f}" if promedio is not None else None,
            "condicion": (
                None if promedio is None
                else ("APROBADO" if promedio >= NOTA_MINIMA_APROBATORIA else "DESAPROBADO")
            ),
        })
    estudiantes.sort(key=lambda x: (x["apellidos"].lower(), x["nombres"].lower(), x["dni"]))

    return {
        "curso": {
            "id": curso.id, "nombre": curso.nombre, "idioma": curso.get_language_display(),
            "nivel": curso.get_level_display(), "subnivel": curso.subnivel, "periodo": curso.periodo,
            "modalidad": curso.get_modalidad_display(), "horario": curso.horario or '',
        },
        "docente": (curso.docente.get_full_name() or curso.docente.username) if curso.docente else '',
        "evaluaciones": [{"titulo": ev.titulo, "peso": f"{ev.peso_porcentaje:.2f}"} for ev in evaluaciones],
        "estudiantes": estudiantes,
    }


def hash_snapshot(snap):
    """
    SHA-256 de lo que realmente se firma: curso, evaluaciones (título y peso) y, por estudiante,
    DNI, notas y promedio. Los datos de presentación (nombre del curso, horario) no entran,
    para que un cambio legítimo de nombre no se confunda con una alteración de notas.
    """
    nucleo = {
        "curso_id": snap["curso"]["id"],
        "evaluaciones": [[e["titulo"], e["peso"]] for e in snap["evaluaciones"]],
        "estudiantes": sorted(
            ([e["dni"], e["notas"], e["promedio"]] for e in snap["estudiantes"]),
            key=lambda x: x[0],
        ),
    }
    texto = json.dumps(nucleo, sort_keys=True, ensure_ascii=False, separators=(',', ':'))
    return hashlib.sha256(texto.encode('utf-8')).hexdigest()


def problemas_para_firmar(snap):
    """Lista de motivos por los que el acta todavía no se puede firmar (vacía = lista para firmar)."""
    problemas = []
    if not snap["evaluaciones"]:
        problemas.append("El curso no tiene evaluaciones definidas.")
    else:
        total = sum(Decimal(e["peso"]) for e in snap["evaluaciones"])
        if total != Decimal('100'):
            problemas.append(f"Las evaluaciones suman {total.normalize()}%; deben sumar 100%.")
    if not snap["estudiantes"]:
        problemas.append("El curso no tiene estudiantes matriculados.")
    faltantes = [e for e in snap["estudiantes"] if e["promedio"] is None]
    if snap["evaluaciones"] and faltantes:
        problemas.append(f"Faltan notas de {len(faltantes)} estudiante(s).")
    return problemas


def integridad(curso, acta):
    """
    Solo para actas cerradas: compara las notas actuales con las firmadas.
    Devuelve 'INTEGRA', 'ALTERADA' o None (acta no cerrada).
    """
    if acta.estado != ActaNotas.Estado.CERRADA or not acta.hash_vigente:
        return None
    return 'INTEGRA' if hash_snapshot(construir_snapshot(curso)) == acta.hash_vigente else 'ALTERADA'


def motivo_bloqueo_notas(curso):
    """
    Texto con el motivo por el que NO se pueden modificar las notas/evaluaciones del curso, o None si se puede.
    """
    acta = ActaNotas.objects.filter(curso=curso).first()
    if acta is None:
        if curso.fecha_fin and plazo_vencido(curso, ActaNotas(curso=curso)):
            return _msg_plazo(curso, ActaNotas(curso=curso))
        return None
    if acta.estado == ActaNotas.Estado.FIRMADA_DOCENTE:
        return ("El acta de este curso ya fue firmada y está en revisión del INDI: las notas no se pueden modificar. "
                "Si hay un error, el INDI debe observar el acta para devolvértela.")
    if acta.estado == ActaNotas.Estado.CERRADA:
        return ("El acta de este curso está firmada por la Dirección del INDI y cerrada: las notas no se pueden modificar. "
                "Una corrección debe pedirse al INDI (reapertura con motivo).")
    if acta.estado == ActaNotas.Estado.BORRADOR and plazo_vencido(curso, acta):
        return _msg_plazo(curso, acta)
    return None


def _msg_plazo(curso, acta):
    limite = plazo_limite(curso, acta)
    return (f"Venció el plazo para registrar notas de este curso (hasta el {limite.strftime('%d/%m/%Y')}). "
            "Pide al INDI que amplíe el plazo.")


def estado_acta_de_curso(curso):
    """Estado del acta (sin crearla). Un curso sin acta equivale a BORRADOR."""
    acta = ActaNotas.objects.filter(curso=curso).first()
    return acta.estado if acta else ActaNotas.Estado.BORRADOR
