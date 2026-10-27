import qrcode
from io import BytesIO
from reportlab.lib.pagesizes import letter, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

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
        topMargin=25,
        bottomMargin=25
    )
    
    story = []
    styles = getSampleStyleSheet()
    
    # Estilos tipográficos institucionales
    uni_style = ParagraphStyle(
        'UniStyle', parent=styles['Heading1'],
        fontName='Helvetica-Bold', fontSize=14, leading=16,
        alignment=1, textColor=colors.HexColor("#1A365D")
    )
    
    centro_style = ParagraphStyle(
        'CentroStyle', parent=styles['Normal'],
        fontName='Helvetica-Bold', fontSize=10, leading=12,
        alignment=1, textColor=colors.HexColor("#2D3748")
    )
    
    indi_style = ParagraphStyle(
        'IndiStyle', parent=styles['Heading2'],
        fontName='Helvetica-Bold', fontSize=16, leading=18,
        alignment=1, textColor=colors.HexColor("#B7791F") # Tono dorado/bronce institucional
    )
    
    cert_title_style = ParagraphStyle(
        'CertTitleStyle', parent=styles['Heading1'],
        fontName='Helvetica-Bold', fontSize=22, leading=26,
        alignment=1, textColor=colors.HexColor("#2C5282")
    )
    
    body_style = ParagraphStyle(
        'BodyStyle', parent=styles['Normal'],
        fontName='Helvetica', fontSize=10.5, leading=14,
        alignment=1, textColor=colors.HexColor("#2D3748")
    )
    
    bold_name_style = ParagraphStyle(
        'BoldNameStyle', parent=styles['Heading2'],
        fontName='Helvetica-Bold', fontSize=15, leading=18,
        alignment=1, textColor=colors.HexColor("#1A202C")
    )

    blockchain_style = ParagraphStyle(
        'BlockchainStyle', parent=styles['Normal'],
        fontName='Courier', fontSize=6.5, leading=9,
        alignment=0, textColor=colors.HexColor("#4A5568")
    )

    # --- ENCABEZADO OFICIAL ---
    story.append(Paragraph("UNIVERSIDAD NACIONAL DE SAN CRISTÓBAL DE HUAMANGA", uni_style))
    story.append(Spacer(1, 2))
    story.append(Paragraph("CENTRO DE PRODUCCIÓN DE BIENES Y SERVICIOS", centro_style))
    story.append(Spacer(1, 2))
    story.append(Paragraph("INSTITUTO DE IDIOMAS — INDI • UNSCH", indi_style))
    story.append(Spacer(1, 10))
    
    story.append(Paragraph("CERTIFICADO", cert_title_style))
    story.append(Paragraph(f"<font size=9 color='#718096'>N° {certificate.certificate_code}</font>", ParagraphStyle('SubNum', alignment=1)))
    story.append(Spacer(1, 15))
    
    # --- CUERPO DEL CERTIFICADO ---
    story.append(Paragraph("Otorgado a:", ParagraphStyle('Otorgado', parent=body_style, alignment=0, leftIndent=40)))
    story.append(Spacer(1, 4))
    
    nombre_estudiante = certificate.student.get_full_name() or certificate.student.username
    story.append(Paragraph(nombre_estudiante.upper(), bold_name_style))
    story.append(Spacer(1, 8))
    
    # Obtenemos datos dinámicos o valores estándar de respaldo
    anio_curso = certificate.issued_at.year
    idioma_desc = certificate.get_language_display().upper()
    nivel_desc = certificate.get_level_display().upper()
    
    texto_logro = (
        f"Por haber concluido satisfactoriamente sus estudios, en el idioma <b>{idioma_desc}</b> "
        f"correspondiente al <b>NIVEL {nivel_desc}</b>, cursado en el año <b>{anio_curso}</b>, "
        f"habiendo acumulado las horas académicas reglamentarias y aprobado satisfactoriamente."
    )
    story.append(Paragraph(texto_logro, body_style))
    story.append(Spacer(1, 10))
    
    texto_fines = "Se le confiere el presente certificado a solicitud del interesado y para sus fines que considere pertinentes."
    story.append(Paragraph(texto_fines, body_style))
    story.append(Spacer(1, 15))
    
    # Fecha de emisión
    fecha_emision_str = f"Ayacucho, {certificate.issued_at.strftime('%d de %B del %Y')}"
    story.append(Paragraph(fecha_emision_str, ParagraphStyle('Fecha', parent=body_style, alignment=2, rightIndent=40)))
    story.append(Spacer(1, 25))

    # --- BLOQUE INFERIOR: FIRMAS Y BLOCKCHAIN (Diseño en Dos Columnas con Tabla) ---
    verification_url = f"http://localhost:3000/verificar/{certificate.certificate_code}"
    qr_buffer = generar_qr_codigo(verification_url)
    qr_image = Image(qr_buffer, width=45, height=45)
    
    hash_sha256 = certificate.certificate_hash or "N/A"
    tx_hash = certificate.blockchain_tx_hash or "Pendiente de minado local"

    blockchain_info = Paragraph(
        f"<b>VERIFICACIÓN BLOCKCHAIN (INDI-UNSCH):</b><br/>"
        f"<b>TX HASH:</b> {tx_hash}<br/>"
        f"<b>HASH SHA-256:</b> {hash_sha256}<br/>"
        f"<i>Escanee el QR para validar autenticidad en línea.</i>",
        blockchain_style
    )

    # Tabla para organizar el QR y los datos criptográficos a la izquierda, y espacio de firmas a la derecha (simulado)
    footer_data = [
        [qr_image, blockchain_info]
    ]
    footer_table = Table(footer_data, colWidths=[55, 450])
    footer_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (1,0), (1,0), 10),
    ]))
    
    story.append(footer_table)

    doc.build(story)
    buffer.seek(0)
    return buffer