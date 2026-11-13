import qrcode
from io import BytesIO
from datetime import timezone as dt_timezone, timedelta
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from django.conf import settings

MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
]

# Perú está en UTC-5 todo el año (sin horario de verano)
ZONA_PERU = dt_timezone(timedelta(hours=-5))


def fecha_en_espanol(fecha):
    """Devuelve la fecha como '30 de octubre del 2026', en hora de Perú."""
    if fecha.tzinfo is not None:
        fecha = fecha.astimezone(ZONA_PERU)
    return f"{fecha.day} de {MESES[fecha.month - 1]} del {fecha.year}"


def partir_hash(valor, tamano=33):
    """Parte un hash largo en trozos para que no se corte a mitad de la página."""
    return [valor[i:i + tamano] for i in range(0, len(valor), tamano)]


def generar_qr_codigo(verification_url):
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=1,
    )
    qr.add_data(verification_url)
    qr.make(fit=True)

    img = qr.make_image(fill_color="black", back_color="white")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer


def generar_pdf_certificado(certificate):
    buffer = BytesIO()

    # Documento horizontal con márgenes limpios
    doc = SimpleDocTemplate(
        buffer,
        pagesize=landscape(letter),
        rightMargin=36,
        leftMargin=36,
        topMargin=20,
        bottomMargin=20
    )

    story = []
    styles = getSampleStyleSheet()

    # Estilos tipográficos institucionales
    uni_style = ParagraphStyle(
        'UniStyle', parent=styles['Heading1'],
        fontName='Helvetica-Bold', fontSize=13, leading=15,
        alignment=1, textColor=colors.HexColor("#1A365D")
    )

    centro_style = ParagraphStyle(
        'CentroStyle', parent=styles['Normal'],
        fontName='Helvetica-Bold', fontSize=9, leading=11,
        alignment=1, textColor=colors.HexColor("#2D3748")
    )

    indi_style = ParagraphStyle(
        'IndiStyle', parent=styles['Heading2'],
        fontName='Helvetica-Bold', fontSize=15, leading=17,
        alignment=1, textColor=colors.HexColor("#B7791F")  # Dorado/bronce institucional
    )

    cert_title_style = ParagraphStyle(
        'CertTitleStyle', parent=styles['Heading1'],
        fontName='Helvetica-Bold', fontSize=20, leading=24,
        alignment=1, textColor=colors.HexColor("#2C5282")
    )

    body_style = ParagraphStyle(
        'BodyStyle', parent=styles['Normal'],
        fontName='Helvetica', fontSize=10, leading=13.5,
        alignment=1, textColor=colors.HexColor("#2D3748")
    )

    bold_name_style = ParagraphStyle(
        'BoldNameStyle', parent=styles['Heading2'],
        fontName='Helvetica-Bold', fontSize=14, leading=17,
        alignment=1, textColor=colors.HexColor("#1A202C")
    )

    blockchain_style = ParagraphStyle(
        'BlockchainStyle', parent=styles['Normal'],
        fontName='Courier', fontSize=5.5, leading=7.5,
        alignment=0, textColor=colors.HexColor("#4A5568")
    )

    firma_style = ParagraphStyle(
        'FirmaStyle', parent=styles['Normal'],
        fontName='Helvetica', fontSize=7.5, leading=9.5,
        alignment=1, textColor=colors.HexColor("#2D3748")
    )

    revocado_style = ParagraphStyle(
        'RevocadoStyle', parent=styles['Normal'],
        fontName='Helvetica-Bold', fontSize=9, leading=11,
        alignment=1, textColor=colors.HexColor("#C53030")
    )

    # --- ENCABEZADO OFICIAL ---
    story.append(Paragraph("UNIVERSIDAD NACIONAL DE SAN CRISTÓBAL DE HUAMANGA", uni_style))
    story.append(Spacer(1, 2))
    story.append(Paragraph("CENTRO DE PRODUCCIÓN DE BIENES Y SERVICIOS", centro_style))
    story.append(Spacer(1, 2))
    story.append(Paragraph("INSTITUTO DE IDIOMAS — INDI • UNSCH", indi_style))
    story.append(Spacer(1, 8))

    story.append(Paragraph("CERTIFICADO", cert_title_style))
    story.append(Paragraph(f"<font size=8.5 color='#718096'>N° {certificate.certificate_code}</font>", ParagraphStyle('SubNum', alignment=1)))

    # Aviso visible si el certificado fue revocado
    if getattr(certificate, 'status', None) == 'REVOKED':
        story.append(Spacer(1, 3))
        story.append(Paragraph("CERTIFICADO REVOCADO — ESTE DOCUMENTO YA NO TIENE VALIDEZ", revocado_style))

    story.append(Spacer(1, 10))

    # --- CUERPO DEL CERTIFICADO ---
    story.append(Paragraph("Otorgado a:", ParagraphStyle('Otorgado', parent=body_style, alignment=0, leftIndent=40)))
    story.append(Spacer(1, 2))

    nombre_estudiante = certificate.student.get_full_name() or certificate.student.username
    story.append(Paragraph(nombre_estudiante.upper(), bold_name_style))
    story.append(Spacer(1, 6))

    # Datos dinámicos (Idioma, Nivel, Subnivel y Año)
    nombres_idiomas = {
        'EN': 'INGLÉS',
        'QU': 'QUECHUA',
        'FR': 'FRANCÉS',
        'PT': 'PORTUGUÉS',
        'IT': 'ITALIANO',
        'INGLES': 'INGLÉS',
        'QUECHUA': 'QUECHUA',
        'FRANCES': 'FRANCÉS',
        'PORTUGUES': 'PORTUGUÉS',
        'ITALIANO': 'ITALIANO'
    }
    raw_lang = str(certificate.language).strip().upper()
    idioma_desc = nombres_idiomas.get(raw_lang, raw_lang)

    nivel_desc = certificate.get_level_display().upper() if hasattr(certificate, 'get_level_display') else str(certificate.level).upper()

    subnivel_desc = getattr(certificate, 'subnivel', None)
    if not subnivel_desc:
        subnivel_desc = 'NIVEL I'
    subnivel_desc = str(subnivel_desc).upper()

    anio_curso = getattr(certificate, 'anio', None)
    if not anio_curso and hasattr(certificate, 'issued_at') and certificate.issued_at:
        anio_curso = certificate.issued_at.year
    if not anio_curso:
        anio_curso = '2026'

    texto_logro = (
        f"Por haber concluido satisfactoriamente sus estudios en el idioma <b>{idioma_desc}</b>, "
        f"nivel <b>{nivel_desc}</b> - <b>{subnivel_desc}</b>, cursado en el año <b>{anio_curso}</b>, "
        f"habiendo acumulado las horas académicas reglamentarias y aprobado satisfactoriamente."
    )
    story.append(Paragraph(texto_logro, body_style))
    story.append(Spacer(1, 8))

    texto_fines = "Se le confiere el presente certificado a solicitud del interesado y para sus fines que considere pertinentes."
    story.append(Paragraph(texto_fines, body_style))
    story.append(Spacer(1, 10))

    # Fecha de emisión (mes en español y hora de Perú)
    fecha_emision_str = f"Ayacucho, {fecha_en_espanol(certificate.issued_at)}"
    story.append(Paragraph(fecha_emision_str, ParagraphStyle('Fecha', parent=body_style, alignment=2, rightIndent=40)))
    story.append(Spacer(1, 12))

    # --- BLOQUE INFERIOR: QR, BLOCKCHAIN Y FIRMAS ---
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    verification_url = f"{frontend_url}/verificar/{certificate.certificate_code}"
    qr_buffer = generar_qr_codigo(verification_url)
    qr_image = Image(qr_buffer, width=42, height=42)

    hash_sha256 = certificate.certificate_hash or "N/A"
    tx_hash = certificate.blockchain_tx_hash

    # Los hashes se parten en dos líneas parejas para que no se corten a mitad de cadena
    if tx_hash:
        tx_partes = partir_hash(tx_hash)
        tx_texto = f"<b>TX HASH:</b> {tx_partes[0]}" + "".join(f"<br/>{p}" for p in tx_partes[1:])
    else:
        tx_texto = "<b>TX HASH:</b> No registrado en blockchain"

    sha_partes = partir_hash(hash_sha256)
    sha_texto = f"<b>HASH SHA-256:</b> {sha_partes[0]}" + "".join(f"<br/>{p}" for p in sha_partes[1:])

    blockchain_info = Paragraph(
        f"<b>VERIFICACIÓN BLOCKCHAIN (INDI-UNSCH)</b><br/>"
        f"{tx_texto}<br/>"
        f"{sha_texto}<br/>"
        f"<i>Escanee el QR para validar la autenticidad en línea.</i>",
        blockchain_style
    )

    # Firmas institucionales: espacio para firmar, línea y nombre debajo
    firma_rector = Paragraph("<b>Dr. Antonio Jerí Chávez</b><br/>Rector - UNSCH", firma_style)
    firma_cpbs = Paragraph("<b>Econ. Carlos A. Ascue Medina</b><br/>Gerente General CPBS", firma_style)
    firma_indi = Paragraph("<b>Prof. Wilmer Rivera Fuentes</b><br/>Gerente INDI", firma_style)

    color_linea = colors.HexColor("#2D3748")
    firmas_table = Table(
        [
            ['', '', '', '', ''],  # fila vacía: espacio para la firma
            [firma_rector, '', firma_cpbs, '', firma_indi],
        ],
        colWidths=[148, 12, 148, 12, 148],
        rowHeights=[24, None],
    )
    firmas_table.setStyle(TableStyle([
        ('LINEABOVE', (0, 1), (0, 1), 0.6, color_linea),
        ('LINEABOVE', (2, 1), (2, 1), 0.6, color_linea),
        ('LINEABOVE', (4, 1), (4, 1), 0.6, color_linea),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    # Pie: [QR] [texto blockchain] [firmas]
    footer_table = Table(
        [[qr_image, blockchain_info, firmas_table]],
        colWidths=[48, 200, 468],
    )
    footer_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('LEFTPADDING', (0, 0), (0, 0), 0),
        ('LEFTPADDING', (1, 0), (1, 0), 10),  # separación entre el QR y el texto
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
    ]))

    story.append(footer_table)

    doc.build(story)
    buffer.seek(0)
    return buffer