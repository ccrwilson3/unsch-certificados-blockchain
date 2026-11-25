# Sistema de Certificados con Blockchain – INDI UNSCH

Gestión de matrícula, clases, notas, asistencia y certificados del Instituto de Idiomas.
Solo el *hash* del certificado se guarda en blockchain; los datos personales quedan en la base de datos.

## Requisitos
Python 3.12+, Node 20+, Ganache (red local) y Git.

## Instalación (desarrollo)
```
python -m venv venv
source venv/Scripts/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver 0.0.0.0:8000
```
Frontend:
```
cd frontend
npm install
npm run dev
```
`frontend/.env.local` debe tener `NEXT_PUBLIC_API_URL=http://<IP-del-servidor>:8000/api`.

## Flujo general
Matrícula → pago (voucher Interbank) → clases, notas y asistencia → solicitud de certificado (S/ 20)
→ pago → emisión en blockchain → verificación pública (código o PDF) → revocación si corresponde.

## Roles
| Rol | Qué hace |
|---|---|
| Estudiante | Matricularse, subir voucher, ver notas/asistencia/materiales, solicitar certificado |
| Docente | Pasar asistencia, registrar notas, subir materiales |
| INDI | Cursos, cupos, matrículas, pagos, reportes Excel, ampliar reservas |
| Grados y Títulos | Validar requisitos, emitir y revocar certificados |
| Administrador | Usuarios y auditoría |

## Reglas del INDI configuradas
- Reserva de matrícula: 5 días desde la orden (INDI puede ampliar).
- Asistencia: 2 faltas toleradas; a la 3ª injustificada se avisa de posible desaprobación.
- Certificado: S/ 20; plazo de entrega en días hábiles (`PLAZO_ENTREGA_DIAS_HABILES`).

## Pruebas
Revisar `Auditoria_Seguridad_INDI.xlsx` (casos de prueba y matriz de accesos).

## Puesta en producción
Ver `docs/PRODUCCION.md`.
