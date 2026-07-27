# CLAUDE.md — Plataforma de Acreditaciones

## Arquitectura general

```
C:\Acreditaciones\
├── app/                    # Backend FastAPI
│   ├── api/v1/endpoints/   # Un archivo por dominio
│   ├── models/             # SQLAlchemy 2.0 (mapped_column + Mapped[])
│   ├── schemas/            # Pydantic v2
│   ├── services/           # Lógica de negocio (async)
│   ├── core/config.py      # Settings via pydantic-settings (.env)
│   ├── scheduler.py        # APScheduler AsyncIOScheduler (cron diario 08:00 Santiago)
│   └── main.py             # FastAPI app + CORS + lifespan
├── frontend/               # Next.js 16 + React 19 + Tailwind 4
│   ├── app/                # App Router (páginas por ruta)
│   ├── components/         # Componentes reutilizables (.tsx)
│   └── lib/                # api.ts (fetch helpers) + types.ts
├── migrations/             # Alembic — NO editar versiones ya aplicadas
└── uploads/                # Archivos subidos (excluido del repo)
```

**Stack:** Python 3.12 · FastAPI 0.115 · SQLAlchemy 2.0 async (asyncpg) · PostgreSQL 16 · Alembic 1.13 · APScheduler 3.10 · OpenAI API (gpt-4o, extracción de fechas de documentos via PyMuPDF) · Next.js 16 · TypeScript · Tailwind CSS v4

## Convenciones de código

### Nomenclatura
- **Dominio de negocio:** español (`trabajadores`, `proyectos`, `tipo_documento`, rutas URL en español)
- **Código Python/TS:** inglés (`worker`, `project`, `document_type`, variables, funciones)
- Modelos SQLAlchemy: `PascalCase`. Tablas: `snake_case` plural (`worker_documents`)
- Schemas Pydantic: sufijo según uso — `WorkerCreate`, `WorkerRead`, `WorkerUpdate`

### Estructura de un endpoint nuevo
1. Crear/editar `app/api/v1/endpoints/<dominio>.py` con `router = APIRouter(prefix="/<ruta>", tags=[...])`
2. **Registrar en `app/api/v1/router.py`** — sin este paso el endpoint no existe
3. Dependencia de DB: `db: AsyncSession = Depends(get_db)` (siempre async)
4. Toda lógica de negocio va en `app/services/`, no en el endpoint

### Models SQLAlchemy
- Heredan de `Base, TimestampMixin` (agrega `created_at`, `updated_at` automáticamente)
- Usar `Mapped[tipo]` + `mapped_column()` (estilo 2.0, sin Column() clásico)
- Relaciones con `lazy="selectin"` cuando se necesitan en respuestas directas

### Schemas Pydantic
- `model_config = ConfigDict(from_attributes=True)` en schemas que leen desde ORM
- Agregar campos nuevos aquí **y** en `frontend/lib/types.ts` — siempre sincronizados
- `TrafficLight` es `str, Enum` con valores lowercase: `"green"`, `"yellow"`, `"red"`

## Comandos clave

```powershell
# Backend
cd C:\Acreditaciones
.venv\Scripts\uvicorn.exe app.main:app --reload --port 8000

# Frontend
cd C:\Acreditaciones\frontend
npm run dev          # http://localhost:3000
npm run lint         # ESLint — correr antes de terminar cualquier sesión frontend
npm run build        # Verificar que compila sin errores de TS

# Migraciones Alembic (siempre desde C:\Acreditaciones con .venv activo)
.venv\Scripts\alembic.exe revision --autogenerate -m "descripcion_breve"
.venv\Scripts\alembic.exe upgrade head
.venv\Scripts\alembic.exe history          # ver estado

# Tests (desde C:\Acreditaciones con .venv activo)
.venv\Scripts\pytest.exe                 # toda la suite (75 tests)
.venv\Scripts\pytest.exe tests/unit/     # solo unitarios (sin DB)
.venv\Scripts\pytest.exe tests/integration/  # solo integración (SQLite en memoria)
.venv\Scripts\pytest.exe -v              # verbose

# Git
git add <archivos>
git commit -m "mensaje"
git push
```

## Reglas de negocio — Semáforos de acreditación

### Tres semáforos independientes (WorkersDirectory)
| Semáforo | Campo | Evalúa |
|----------|-------|--------|
| Global | `global_status` | `is_global_base_requirement=True` AND `is_achs=False` |
| ACHS | `achs_status` | `is_achs=True` (siempre 365 días de validez) |
| Proyecto | `project_status` | Requisitos específicos del proyecto; `null` si sin proyectos |

**Regla crítica:** Los tipos con `is_global_base_requirement=True AND is_achs=True` se evalúan **solo** en el semáforo ACHS, nunca en Global. Los conjuntos son disjuntos: `global_non_achs = global_dt_ids - achs_dt_ids`.

### Lookup de documentos cross-project
Para Global y ACHS, el mejor documento se busca en **todos** los `WorkerDocument` del trabajador (incluyendo contextos de proyectos archivados), tomando el de `upload_date` más reciente por `(worker_id, document_type_id)`.

### Estados de documento (DocumentStatus)
`PENDING` / `UPLOADED` → cuenta como pendiente (semáforo YELLOW/RED según obligatoriedad)
`APPROVED` → válido si no venció
`REJECTED` → ignorado (equivale a sin documento)

### Validez efectiva
- **Documentos ACHS:** siempre 365 días desde `issue_date`, definido en `DocumentType.effective_validity_days` como `ACHS_VALIDITY_DAYS = 365`
- **Otros:** `issue_date + validity_days` o `expiry_date` explícita

### Lógica de alerta (EXPIRING_SOON)
Cascada de porcentaje en tres niveles:
1. `WorkerDocument.custom_alert_percentage` (mayor prioridad)
2. `DocumentType.alert_percentage_override`
3. `SystemSettings.global_alert_percentage` (default: 20%)

`alert_days = total_life_days * pct / 100`. Documento entra en YELLOW cuando `days_remaining <= alert_days`.

## Autenticación — Microsoft Entra ID

### Archivos clave
| Archivo | Función |
|---------|---------|
| `app/core/auth.py` | Dependencia `get_current_user` — valida JWT, auto-provisiona usuario |
| `app/core/permissions.py` | Enums `Module`/`PermissionLevel`, deps `require_admin`/`require_module` |
| `app/models/user.py` | Modelos `User` y `ModulePermission` (SQLAlchemy 2.0) |
| `app/schemas/auth.py` | Schemas Pydantic para respuestas de auth |
| `app/api/v1/endpoints/auth.py` | Endpoints `/auth/me`, `/admin/users`, `/admin/users/{id}`, `/admin/users/{id}/permissions` |

### Módulos disponibles
`trabajadores` · `vehiculos` · `gastos` · `configuracion` · `reportes`

### Flujo de autenticación
1. Cliente envía `Authorization: Bearer <token>` (JWT de Entra ID)
2. `get_current_user` valida firma contra JWKS de Microsoft y verifica `aud`/`iss`/`exp`
3. Si el OID no existe en DB → auto-provisiona usuario; si el email está en `ADMIN_EMAILS` → `is_admin=True`
4. Actualiza `last_login_at` en cada request válido
5. Si `is_active=False` → 403

### Variables de entorno requeridas
```
ENTRA_TENANT_ID=    # GUID del tenant de Azure
ENTRA_CLIENT_ID=    # GUID del app registration
ADMIN_EMAILS=       # comma-separated; reciben is_admin=True al primer login
AUTH_DISABLED=false # ⚠️ NUNCA true en producción
```

### Configuración del App Registration en Azure
La App Registration debe tener el scope `access_as_user` expuesto para que el frontend pueda solicitar tokens con audiencia `api://<CLIENT_ID>`:
1. **Azure Portal → App Registrations → tu app → Expose an API**
2. Establece el Application ID URI como `api://<CLIENT_ID>`
3. Agrega un scope llamado `access_as_user` (quién puede consentir: Admins and users)
4. **API permissions → Add permission → My APIs → selecciona tu app → `access_as_user`** y concede Admin consent

**¿Por qué?** El frontend solicita el scope `api://<CLIENT_ID>/access_as_user` para que el `access_token` tenga `aud=api://<CLIENT_ID>`. El backend acepta como audiencia válida tanto `<CLIENT_ID>` como `api://<CLIENT_ID>` (ambos formatos que puede emitir Entra ID).

### Uso en endpoints futuros
```python
# Solo autenticado:
current_user: User = Depends(get_current_user)

# Solo admins:
_: User = Depends(require_admin)

# Módulo específico (write implica read):
_: User = Depends(require_module(Module.trabajadores, PermissionLevel.write))
```

## Política de archivos permitidos (defensa XSS almacenado)

Toda subida de documento (trabajadores **y** vehículos) pasa por una validación
estricta antes de tocar el disco. Objetivo: impedir XSS almacenado vía archivos
(p. ej. un `.html` con `<script>` renombrado a `.pdf`).

### Lista blanca
Definida en `app/core/config.py`:
- `ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}`
- `EXTENSION_TO_MIME` — MIME canónico por extensión (única fuente de verdad)
- `ALLOWED_MIME_TYPES` — MIME seguros para servir inline

### Reglas de validación (`app/services/storage.py`)
1. **Extensión:** si no está en `ALLOWED_UPLOAD_EXTENSIONS` → **422**.
2. **Magic bytes:** `validate_upload(content, filename)` verifica la firma binaria
   real contra la extensión declarada (sin dependencias externas):
   `%PDF` · JPEG `FF D8 FF` · PNG `89 50 4E 47 0D 0A 1A 0A` · WebP `RIFF….WEBP`.
   Si la firma no coincide → **422**.
3. **MIME de confianza:** NUNCA se usa `file.content_type` del cliente. El MIME se
   deriva de la firma validada y ese valor es el que se guarda en BD.
4. La validación se ejecuta **temprano en el endpoint** (`validate_upload_head`,
   lee solo el primer chunk) y de nuevo dentro de `save_upload`/`save_vehicle_upload`
   (defensa en profundidad).

### Tamaño y memoria (streaming)
- `save_upload`/`save_vehicle_upload` persisten en **streaming** (chunks de 1 MB a
  un archivo temporal), abortando con **413** apenas el acumulado supere
  `MAX_UPLOAD_SIZE_MB`. Nunca se carga el archivo completo en RAM.
- Los flujos que necesitan los bytes en memoria (IA) usan `read_upload_capped()`,
  que acota la lectura al mismo límite antes de enviar nada a OpenAI.

### Al servir archivos (view/download, ambos dominios)
- `media_type` **siempre** desde `resolve_media_type()` (mapa validado), jamás el
  MIME crudo del cliente.
- Header `X-Content-Type-Options: nosniff` en toda respuesta de archivo.
- Modo **inline** solo si el tipo está en la lista blanca; ante cualquier duda
  (MIME no confiable, extensión desconocida) → `attachment` + `octet-stream`.

### Auditoría de archivos existentes
`scripts/audit_uploads.py` recorre `UPLOAD_DIR`, valida firmas y reporta
sospechosos **sin borrar nada** (los archivos ya subidos son de confianza; no se
requiere migración). Uso: `.venv\Scripts\python.exe -m scripts.audit_uploads`.

## Endpoints de IA (/ai-scan) — endurecimiento

Los endpoints que llaman a OpenAI (`/ai-scan` de worker y vehicle, y la validación
IA en upload/edit) están protegidos:
- **Límite de tamaño antes de OpenAI:** `read_upload_capped()` corta con 413 sin
  cargar más que `MAX_UPLOAD_SIZE_MB` en RAM.
- **Cliente único:** cada extractor (`worker_ai_extractor`, `vehicle_ai_extractor`)
  crea un `AsyncOpenAI` una sola vez (lazy) con `timeout=30.0, max_retries=1`. Un
  timeout se traduce a **504** ("El análisis del documento tardó demasiado"), no 500.
- **Rate limiting:** `app/core/ratelimit.py` expone la dependencia
  `rate_limit_ai_scan` — máx. `AI_SCAN_MAX_PER_MINUTE` (default 10) llamadas por
  usuario/minuto; al exceder → **429**. Es un contador **en memoria por proceso**:
  si se corre uvicorn con múltiples workers, migrar a Redis (contador compartido).

## Reglas para futuras sesiones

1. **Migraciones:** Nunca editar archivos en `migrations/versions/` ya existentes. Siempre crear una nueva con `alembic revision --autogenerate`.
2. **Sincronía schema/model:** Todo campo nuevo en un modelo SQLAlchemy requiere: migration + schema Pydantic backend + interfaz TypeScript en `frontend/lib/types.ts`.
3. **Router:** Todo endpoint nuevo debe registrarse en `app/api/v1/router.py` o no será accesible.
4. **Lint frontend:** Correr `npm run lint` en `frontend/` antes de terminar cualquier sesión que toque `.tsx`/`.ts`.
5. **Variables de entorno:** `.env` nunca va al repo (está en `.gitignore`). Usar `.env.example` como plantilla. La clave `OPENAI_API_KEY` debe rotarse si quedó expuesta.
6. **Diseño visual:** El sistema usa estilo SAP Fiori ERP — fondos blancos, tabs con `border-b-2 border-[#003f7a]`, tipografía densa (`text-[11px]`), sin dark mode.
7. **Async everywhere:** Todos los servicios y endpoints son `async def`. No usar `.execute()` síncrono de SQLAlchemy.
8. **Subida de archivos:** Toda subida nueva debe pasar por `validate_upload()` (lista blanca + magic bytes) y guardar el MIME derivado de la firma, nunca `file.content_type`. Al servir, usar `resolve_media_type()` + header `nosniff`. Ver "Política de archivos permitidos".
