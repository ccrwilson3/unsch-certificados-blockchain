# Manual breve por rol

## Estudiante
1. **Registrarse / ingresar** con su usuario y contraseña (puede cambiarla en su cuenta).
2. **Matrícula**: elegir idioma y curso (se muestran los cupos). Se genera una orden de pago con **5 días** de reserva.
3. Pagar en Interbank y **subir la foto del voucher**. INDI lo revisa y le llega un correo.
4. **Mis cursos / Notas / Mi asistencia / Materiales**: consultar su avance.
5. **Certificado**: al aprobar, solicitar y seguir estos pasos en *Mis Solicitudes*:
   - Descargar la **orden de pago** y pagar S/ 20 en Interbank.
   - Descargar el **modelo de solicitud** (viene con tus datos), completar los recuadros (celular, correo, domicilio, motivo) y firmarlo.
   - Subir la **solicitud completada** junto con la foto o PDF del **voucher** y su número de operación.
   - Recibirá aviso por correo al estar listo el certificado.

## Docente
1. **Asistencia**: elegir idioma → curso → fecha; marcar Presente/Falta/Justificada (motivo obligatorio en justificada). "Exportar Excel" descarga el registro.
2. **Notas** y **Materiales** de sus cursos.
3. **Acta de notas**: al terminar de registrar las notas (todas las evaluaciones y todos los estudiantes), en *Registro de Notas* aparece el panel del acta. Pulsa **Firmar y enviar acta al INDI** y confirma con tu contraseña: esa es tu firma. Desde ese momento las notas quedan bloqueadas.
   - Si el INDI la **observa**, te llega un correo con lo que debes corregir; corriges y firmas de nuevo.
   - Tienes **7 días** desde la fecha de culminación del curso. Si vence, pide al INDI que amplíe el plazo.

## INDI
1. **Cursos**: crear/editar, fijar cupos y faltas permitidas.
2. **Matrículas**: revisar vouchers, aprobar/rechazar; "Ampliar plazo" si una reserva venció.
3. **Actas de Notas**: revisa las actas que firmó el docente. Puedes **devolverlas con una observación**, o **firmarlas como Dirección del INDI** con tu contraseña; con eso el acta queda cerrada y las notas bloqueadas. Si luego hay un error, usa **Reabrir para corrección** (queda registrado el motivo). También puedes **ampliar el plazo** de un docente y descargar el **PDF** del acta.
   - Fija la **fecha de culminación** de cada curso en *Gestión de Cursos*: desde ahí corre el plazo del docente.
   - En la *Bandeja de Solicitudes* también ves la **solicitud completada** del estudiante (con la marca *verificada* si el sistema comprobó que es la de ese trámite) y si el acta del curso está firmada y la nota que figura en ella. Si las notas fueron alteradas, el sistema no deja emitir el certificado.
4. **Reportes**: ingresos y matriculados por rango de fechas, con descarga en Excel.

## Grados y Títulos
1. **Validar requisitos**: ver el veredicto y las comprobaciones de cada solicitud.
2. Emitir el certificado (registra el hash en blockchain) o revocar con motivo.

## Verificación pública
Cualquier persona puede verificar un certificado por **código** o **subiendo el PDF** en la página de verificación.

## Verificación en dos pasos (2FA)
Cualquier usuario puede activarla en **Mi cuenta → Seguridad**:
1. Instala una app autenticadora en el celular (Google Authenticator, Microsoft Authenticator o Authy).
2. Escanea el código QR y escribe el código de 6 dígitos que muestra la app.
3. Guarda los **códigos de respaldo** (se muestran una sola vez; cada uno sirve una vez si pierdes el celular).

Desde entonces, al ingresar se pide la contraseña y luego el código de la app. En producción es **obligatoria** para Administrador, INDI y Grados y Títulos.
Si un usuario pierde su celular y sus códigos de respaldo, el Administrador usa **Quitar 2FA** en *Usuarios*; el usuario lo configura de nuevo al ingresar.

## Permisos por módulo (Administrador)

Cada rol ya trae sus módulos. Para que una persona vea **menos** que el resto de su rol (por ejemplo, un trabajador del INDI que solo atiende matrículas):

1. En **Usuarios**, pulsa **Permisos** junto a la persona (disponible para Personal INDI, Docente y Grados y Títulos).
2. Para cada módulo elige: **Rol** (lo que ya da su rol), **Sin acceso**, **Solo ver** o **Ver y editar**. Debajo se muestra el *Resultado*.
3. Guarda. Se aplica **de inmediato**, sin que la persona tenga que volver a ingresar.

Para varias personas a la vez, usa **Permisos** en el menú lateral: crea una *plantilla* (por ejemplo «INDI solo matrículas») y pulsa **Asignar** para elegir a quiénes se aplica. Si editas la plantilla, el cambio llega a todos los que la tienen. Un ajuste propio de una persona siempre prevalece sobre su plantilla.

Notas:
- Con **Solo ver** la persona consulta, pero el sistema rechaza cualquier cambio y le avisa que su acceso es de lectura.
- **Revocar certificados** es un módulo aparte, para poder dar la bandeja de solicitudes sin permitir revocar.
- El Administrador nunca se restringe, y los estudiantes no usan módulos.
- Cada cambio queda en la **Auditoría** (quién, a quién y qué accesos cambiaron).

## Seguridad
- Tras 5 intentos fallidos de ingreso, la cuenta se bloquea 15 minutos.
- Al cambiar la contraseña se cierran las demás sesiones.
