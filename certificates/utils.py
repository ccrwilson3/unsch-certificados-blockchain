import qrcode
from io import BytesIO
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from django.conf import settings

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
        alignment=1, textColor=colors.HexColor("#B7791F") # Dorado/bronce institucional
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

    # --- ENCABEZADO OFICIAL ---
    story.append(Paragraph("UNIVERSIDAD NACIONAL DE SAN CRISTÓBAL DE HUAMANGA", uni_style))
    story.append(Spacer(1, 2))
    story.append(Paragraph("CENTRO DE PRODUCCIÓN DE BIENES Y SERVICIOS", centro_style))
    story.append(Spacer(1, 2))
    story.append(Paragraph("INSTITUTO DE IDIOMAS — INDI • UNSCH", indi_style))
    story.append(Spacer(1, 8))
    
    story.append(Paragraph("CERTIFICADO", cert_title_style))
    story.append(Paragraph(f"<font size=8.5 color='#718096'>N° {certificate.certificate_code}</font>", ParagraphStyle('SubNum', alignment=1)))
    story.append(Spacer(1, 10))
    
    # --- CUERPO DEL CERTIFICADO ---
    story.append(Paragraph("Otorgado a:", ParagraphStyle('Otorgado', parent=body_style, alignment=0, leftIndent=40)))
    story.append(Spacer(1, 2))
    
    nombre_estudiante = certificate.student.get_full_name() or certificate.student.username
    story.append(Paragraph(nombre_estudiante.upper(), bold_name_style))
    story.append(Spacer(1, 6))
    
    # Obtenemos datos dinámicos (Idioma, Nivel, Subnivel tradicional y Año)
    anio_curso = certificate.issued_at.year
    nombres_idiomas = {
        'EN': 'INGLÉS',
        'QU': 'QUECHUA',
        'FR': 'FRANCÉS',
        'PT': 'PORTUGUÉS',
        'INGLES': 'INGLÉS',
        'QUECHUA': 'QUECHUA',
        'FRANCES': 'FRANCÉS',
        'PORTUGUES': 'PORTUGUÉS'
    }
    raw_lang = str(certificate.language).strip().upper()
    idioma_desc = nombres_idiomas.get(raw_lang, raw_lang)
    
    nivel_desc = certificate.get_level_display().upper() if hasattr(certificate, 'get_level_display') else str(certificate.level).upper()
    
    # Recuperamos el subnivel directamente del objeto certificado o su respaldo
    subnivel_desc = getattr(certificate, 'subnivel', None)
    if not subnivel_desc:
        subnivel_desc = 'NIVEL I'
    subnivel_desc = str(subnivel_desc).upper()

    # Año del curso
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
    
    # Fecha de emisión
    fecha_emision_str = f"Ayacucho, {certificate.issued_at.strftime('%d de %B del %Y')}"
    story.append(Paragraph(fecha_emision_str, ParagraphStyle('Fecha', parent=body_style, alignment=2, rightIndent=40)))
    story.append(Spacer(1, 15))

    # --- BLOQUE INFERIOR: FIRMAS, QR Y BLOCKCHAIN ---
    frontend_url = getattr(settings, 'FRONTEND_URL', 'http://localhost:3000')
    verification_url = f"{frontend_url}/verificar/{certificate.certificate_code}"
    qr_buffer = generar_qr_codigo(verification_url)
    qr_image = Image(qr_buffer, width=42, height=42)
    
    hash_sha256 = certificate.certificate_hash or "N/A"
    tx_hash = certificate.blockchain_tx_hash or "Pendiente de minado local"

    blockchain_info = Paragraph(
        f"<b>VERIFICACIÓN BLOCKCHAIN (INDI-UNSCH):</b><br/>"
        f"<b>TX HASH:</b> {tx_hash}<br/>"
        f"<b>HASH SHA-256:</b> {hash_sha256}<br/>"
        f"<i>Escanee el código QR para validar autenticidad en línea.</i>",
        blockchain_style
    )

    # Columnas de firmas institucionales oficiales
    firma_rector = Paragraph("__________________________________________<br/><b>Dr. Antonio Jerí Chávez</b><br/>Rector - UNSCH", firma_style)
    firma_cpbs = Paragraph("__________________________________________<br/><b>Econ. Carlos A. Ascue Medina</b><br/>Gerente General CPBS", firma_style)
    firma_indi = Paragraph("__________________________________________<br/><b>Prof. Wilmer Rivera Fuentes</b><br/>Gerente INDI", firma_style)

    # Tabla general del pie organizando [QR + Blockchain] y las [3 Firmas oficiales]
    # Ancho total aproximado para la página horizontal (Letter landscape ~ 792 pts - márgenes)
    footer_data = [
        [qr_image, blockchain_info, firma_rector, firma_cpbs, firma_indi]
    ]
    
    footer_table = Table(footer_data, colWidths=[45, 180, 160, 160, 160])
    footer_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
        ('ALIGN', (0,0), (1,0), 'LEFT'),
        ('ALIGN', (2,0), (-1,0), 'CENTER'),
        ('LEFTPADDING', (1,0), (1,0), 6),
        ('RIGHTPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))
    
    story.append(footer_table)

    doc.build(story)
    buffer.seek(0)
    return buffer