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

# Lint / Format Python (ruff — config en pyproject.toml, line-length 100)
.venv\Scripts\python.exe -m ruff check app/          # lint (debe salir limpio)
.venv\Scripts\python.exe -m ruff check app/ --fix    # arregla imports (I) y fixes seguros
.venv\Scripts\python.exe -m ruff format app/         # formatea (envuelve líneas largas)
.venv\Scripts\python.exe -m ruff format app/ --check # verifica formato sin escribir (CI)
# Instalar herramientas de dev (incluye ruff): pip install -r requirements-dev.txt

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

### Semáforo compartido y asimetría trabajadores/vehículos

- **`TrafficLight` unificado:** un único Enum `str` (`green`/`yellow`/`red`) definido
  en `app/schemas/accreditation.py`; `app/schemas/vehicle_profile.py` lo **importa**
  (antes redefinía un `Literal` con los mismos valores). La serialización JSON es
  byte-idéntica.
- **"Peor semáforo" unificado:** `app/services/traffic.py` es la **fuente única**
  del orden de severidad (`red > yellow > green`) y expone
  `worst_traffic_light(lights, *, default=...)`. Reemplaza a los antiguos `_worst`
  (trabajadores, `default=GREEN`: lista vacía == verde) y `_worst_traffic`
  (vehículos, `default=None`: sin datos == sin semáforo, hoy un adaptador delgado).
- **⚠️ Asimetría NO unificada (decisión de negocio pendiente):** la regla
  `EXPIRING_SOON` difiere entre módulos y se dejó **a propósito** sin unificar:
  - **Trabajadores:** por **PORCENTAJE** de la vida útil del documento
    (`is_expiring_soon` + cascada `effective_pct`, ver arriba).
  - **Vehículos:** por **DÍAS FIJOS** (`_effective_alert_days`: `custom_alert_days`
    > `alert_days_override` > `vehicle_global_alert_days`, default 30 días).

  Podría ser intencional (semántica de negocio distinta) o un candidato a unificar
  en una sesión aparte. Documentado también en comentarios en ambos servicios
  (`_doc_light` y `_evaluate_doc`).

## Autenticación — Local (email + contraseña, JWT propio)

> ✅ **Migración completa (backend + frontend):** ya no hay nada de Microsoft/Entra
> ni Auth.js/next-auth. Backend con JWT propio (HS256); frontend con login local
> contra `/auth/login` y sesión en cookie httpOnly (ver "Frontend — sesión local"
> abajo). El sistema de permisos por módulo (`app/core/permissions.py`,
> `ModulePermission`) se conserva **intacto**.

### Archivos clave
| Archivo | Función |
|---------|---------|
| `app/core/security.py` | `hash_password`/`verify_password` (bcrypt vía passlib) + `validate_password_strength` (422) |
| `app/core/auth.py` | `create_access_token(user)` + dependencia `get_current_user` (JWT HS256 propio) |
| `app/core/permissions.py` | Enums `Module`/`PermissionLevel`, deps `require_admin`/`require_module` (sin cambios) |
| `app/models/user.py` | `User` (con `hashed_password`, `must_change_password`) y `ModulePermission` |
| `app/schemas/auth.py` | Schemas: `LoginRequest`, `LoginResponse`, `ChangePasswordRequest`, `UserCreate`, `UserPatch`, `PasswordReset`, `UserRead` |
| `app/api/v1/endpoints/auth.py` | `/auth/login`, `/auth/change-password`, `/auth/me`, `/admin/users*` |

### Modelo `User`
- `email` (unique, index) — identificador de login. Se guarda/compara en minúsculas.
- `hashed_password` (bcrypt, NOT NULL).
- `must_change_password` (bool, default `True`) — obliga cambio en el primer ingreso.
- `full_name`, `is_admin`, `is_active`, `last_login_at` — se conservan.
- **Ya NO existe `entra_oid`** (eliminado en la migración `a3b4c5d6e7f8`).

### Módulos disponibles
`trabajadores` · `vehiculos` · `gastos` · `configuracion` · `reportes`

### Flujo de autenticación
1. `POST /auth/login` con `{email, password}` → verifica con `verify_password`.
   - Credenciales inválidas → **401** genérico `"Correo o contraseña incorrectos."`
     (no revela si falló el correo o la contraseña).
   - Usuario inactivo → **403**.
   - OK → actualiza `last_login_at`, firma un JWT y responde
     `{access_token, token_type, must_change_password, user}`.
2. Cliente envía `Authorization: Bearer <token>` en cada request.
3. `get_current_user` valida firma (HS256 con `JWT_SECRET_KEY`) y expiración, lee
   `sub`=id, carga el `User` por id y verifica `is_active`.
   - Token inválido/expirado/manipulado o usuario borrado → **401** `"Token inválido o expirado."`
   - Usuario inactivo → **403**.
4. `POST /auth/change-password` con `{current_password, new_password}`: verifica la
   actual, valida fuerza de la nueva, actualiza el hash y pone
   `must_change_password=False`. **Funciona incluso con `must_change_password=True`**
   (es la única acción permitida en ese estado).

### Política de contraseñas (`validate_password_strength`)
Largo entre **10 y 72** caracteres (72 = límite efectivo de bcrypt), al menos una
letra y al menos un número. Si no cumple → **422** con mensaje claro. Se aplica al
**crear** usuario, al **resetear** contraseña (admin) y al **cambiar** contraseña
(usuario).

### Administración de usuarios (admin) — todo bajo `require_admin`
El **admin crea las cuentas y define su contraseña inicial** (no hay auto-registro).
Endpoints en `app/api/v1/endpoints/auth.py`:

| Método | Ruta | Efecto |
|--------|------|--------|
| `POST` | `/admin/users` | Crea usuario `{email, full_name?, password, is_admin, permissions?}`. Email único (**409** si existe, case-insensitive), fuerza de contraseña (**422**), permisos validados contra los enums (**422**). Se crea con `must_change_password=True` y **201**. |
| `GET` | `/admin/users` | Lista usuarios con sus permisos (nunca expone `hashed_password`). |
| `PATCH` | `/admin/users/{id}` | Edita `full_name`, `is_admin`, `is_active` (`None` = no tocar). |
| `POST` | `/admin/users/{id}/reset-password` | El admin fija nueva contraseña `{new_password}`; valida fuerza y pone `must_change_password=True`. |
| `DELETE` | `/admin/users/{id}` | Elimina el usuario (**204**). Cascade borra sus `ModulePermission`. |
| `PUT` | `/admin/users/{id}/permissions` | Reemplaza el set de permisos (valida módulos/niveles). |

**Salvaguardas de administrador:**
- **Sí mismo:** un admin no puede quitarse `is_admin` ni desactivarse (**403** en PATCH),
  ni eliminarse a sí mismo (**403** en DELETE).
- **Último admin activo:** PATCH que dejaría sin ningún admin activo → **409**; DELETE del
  último admin activo → **409**. Helper `_count_active_admins(db, exclude_id=...)`. Esta
  red de seguridad cubre incluso el modo `AUTH_DISABLED` (el `current_user` es un stub
  id=-1 fuera de la BD, así que la protección de "sí mismo" no aplicaría).

**Sin exposición del hash:** `UserRead` lista campos explícitamente y **nunca** incluye
`hashed_password` (ni `entra_oid`). Es el único schema de salida de usuarios.

**FKs hacia `users`:** la única es `module_permissions.user_id` (`ondelete="CASCADE"`).
No existe `created_by`/`updated_by` en el esquema, por lo que borrar un usuario no deja
registros huérfanos ni requiere reasignación.

### Bootstrap del primer admin — `scripts/create_admin.py`
En una base vacía (o tras eliminar las cuentas heredadas de Entra, que quedaron con
`hashed_password='LOCKED_NO_PASSWORD'` y no pueden entrar) no habría forma de iniciar
sesión. El comando de bootstrap crea el primer administrador **sin depender de
`AUTH_DISABLED`**:

```powershell
.venv\Scripts\python.exe -m scripts.create_admin
# o no interactivo (automatización/CI):
#   set ADMIN_EMAIL=... / ADMIN_FULL_NAME=... / ADMIN_PASSWORD=...
.venv\Scripts\python.exe -m scripts.create_admin --yes
```

- Datos por **arg CLI > env (`ADMIN_EMAIL`/`ADMIN_FULL_NAME`/`ADMIN_PASSWORD`) > prompt**.
- La contraseña se pide con `getpass` (sin eco) y **nunca se imprime**; valida fuerza.
- Crea `is_admin=True`, `is_active=True`. **`must_change_password=False`** a propósito:
  el operador definió la contraseña él mismo en consola (a diferencia de los usuarios
  creados vía `/admin/users`, que llevan `True`).
- **Idempotente:** si el email ya existe, lo promueve a admin y le resetea la
  contraseña (en no interactivo requiere `--yes`; núcleo `upsert_admin`).
- **`GET /auth/setup-status`** (público, sin auth): responde `{"has_admin": bool}` —
  `true` sólo si existe al menos un admin **activo**. Sirve para que el frontend muestre
  "no hay administradores, contacta al operador" en una base vacía. No expone datos
  sensibles (helper `app/services/users.py::active_admin_exists`).

Ver el procedimiento completo de primer arranque en **`DEPLOYMENT.md`**.

### Variables de entorno requeridas
```
JWT_SECRET_KEY=            # clave secreta para firmar el JWT (HS256)
ACCESS_TOKEN_EXPIRE_MINUTES=480  # vida del token (default 480 = 8 h)
AUTH_DISABLED=false        # ⚠️ NUNCA true en producción (candado ENVIRONMENT); en dev
                           #    entrega un admin ficticio (id=-1)
ENVIRONMENT=development     # development | production
```

Con `ENVIRONMENT=production` la app **se niega a arrancar** si (a) `AUTH_DISABLED=true`
o (b) `JWT_SECRET_KEY` está vacío o sigue siendo el placeholder de ejemplo
(`INSECURE_JWT_DEFAULT`). Candado en `app/core/config.py`, validado al construir
`Settings`. Ver "Tolerancia a fallas e higiene de errores".

### Uso en endpoints futuros
```python
# Solo autenticado:
current_user: User = Depends(get_current_user)

# Solo admins:
_: User = Depends(require_admin)

# Módulo específico (write implica read):
_: User = Depends(require_module(Module.trabajadores, PermissionLevel.write))
```

### Frontend — sesión local (sin Auth.js/Microsoft)
El frontend ya **no** usa next-auth ni Microsoft Entra. Flujo:

- **Login (`app/login/page.tsx`):** formulario email+contraseña → `POST /auth/login`.
  Si `must_change_password=true` redirige a `/cambiar-contrasena`; si no, al dashboard.
- **Sesión — cookie httpOnly:** el JWT se guarda en una cookie **httpOnly** `acr_session`
  (no `localStorage`) vía el route handler **`app/api/session/route.ts`** (`POST` setea,
  `GET` lee, `DELETE` limpia). Es la única copia persistente; el cliente rehidrata una
  copia **en memoria** (`lib/token-store.ts`) en cada carga (`lib/session.ts::loadSessionToken`)
  para adjuntarla como `Authorization: Bearer` a las llamadas directas al backend
  (`lib/api.ts`). *Tradeoff:* un BFF que nunca exponga el token al navegador sería más
  seguro pero exigiría proxyear toda la API por Next; se optó por httpOnly + memoria.
- **Gate de rutas (`proxy.ts`, ex-middleware Next 16):** si falta la cookie `acr_session`
  → redirige a `/login`. El matcher excluye `/login`, `/api/*` y assets.
- **Guard de primer ingreso:** `PermissionsProvider` (`lib/permissions.tsx`) fuerza a
  `/cambiar-contrasena` mientras `must_change_password=true`.
- **Permisos:** `PermissionsProvider` alimenta `canRead`/`canWrite` desde `GET /auth/me`
  con el token local (antes venía de la sesión next-auth); el filtrado del menú en
  `AppShell` no cambió de comportamiento.
- **Logout:** `logout()` del contexto → `DELETE /api/session` + limpia memoria → `/login`.
  En `lib/api.ts`, un **401** del backend limpia la sesión y redirige a `/login`.
- **Env:** `frontend/.env.example` solo requiere `NEXT_PUBLIC_API_URL` (se eliminaron
  `AUTH_SECRET` y `AUTH_MICROSOFT_ENTRA_ID_*`).

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

### Validación de IA activable/desactivable POR TIPO de documento

Cada tipo de documento (trabajadores **y** vehículos) tiene el flag
`ai_validation_enabled: bool` (default `True`, NOT NULL) en su modelo
(`DocumentType`, `VehicleDocumentType`), expuesto en los schemas de lectura y
crear/editar, y en `frontend/lib/types.ts`. Permite que el encargado opte por
**revisión manual** en los tipos que quiera.

- **`False` ⇒ la subida NO llama a OpenAI** (ni escudo de tipo, ni de identidad,
  ni extracción de fechas por IA): el usuario ingresa las fechas manualmente y el
  documento se guarda con el flujo clásico. Esto también **ahorra el costo** de la
  llamada a OpenAI para esos tipos.
- **Dónde se aplica el corte** (siempre ANTES de contactar OpenAI):
  - Trabajadores: `resolve_document_dates(..., ai_enabled=doc_type.ai_validation_enabled)`
    en `app/services/worker_documents.py` (subida y edición).
  - Vehículos: la condición inline `if settings.OPENAI_API_KEY and vdt.ai_validation_enabled:`
    en `upload_vehicle_document` / edición.
  - `/ai-scan` (ambos dominios): reciben `document_type_id` / `vehicle_document_type_id`
    opcional; si el tipo tiene la validación apagada, responden `ai_validation_enabled=False`
    con fechas `null` **sin** llamar a OpenAI.
- **UI (toggle por tipo):** toggle "Validación con IA" en crear/editar tipo de
  trabajador (`GlobalReqsSection.tsx` + `EditDocTypeModal.tsx`) y de vehículo
  (`app/vehiculos/documentacion/page.tsx`), con indicador **IA/Manual** en cada
  listado (`DocTypeRow.tsx` / acción "IA: on/off" por fila).
- **UI (flujo combinado):** los formularios de subida (`UploadForm.tsx`,
  `vehicle-profile/DocForm.tsx`) llaman `/ai-scan` con el `document_type_id`
  (+ `worker_id`) vía el hook `useDocumentAIScan`, y muestran el veredicto con el
  componente compartido `components/validation/ValidationNotice.tsx`: aviso ámbar
  en `warn`, advertencia roja específica en `conflict`. Ante `conflict` (preview o
  409) el botón pasa a "Revisar archivo" y aparece "Subir de todas formas" con
  checkbox de confirmación que envía `force_validation_override=true`. Todo `match`
  → sin fricción.
- **Migración:** `e1f2a3b4c5d6` (agrega la columna con `server_default=true` para
  respaldar filas existentes y luego lo retira; downgrade la elimina).

### Verificación de titular por IA (SOLO trabajadores, solo por nombre)

Cuando `ai_validation_enabled=True`, además de verificar el TIPO, la IA verifica
que el documento pertenece a la **persona correcta** comparando **solo el nombre**
(NUNCA RUT/DNI — decisión de diseño). Aplica **solo a documentos de trabajadores**
(los vehículos no tienen persona dueña).

- **Contrato de `extract_dates()`** (`app/services/worker_ai_extractor.py`) — el
  dict de retorno agrega dos campos:
  - `person_name_detected: str | None` — nombre del titular tal como aparece en el
    documento (o `None`).
  - `person_match: str` — **siempre** uno de `"match" | "likely_match" | "mismatch"
    | "not_found"`. Si la IA no lo devuelve o devuelve un valor inválido, degrada a
    `"not_found"` (seguro: no alarma).
    - `match`: corresponde claramente al esperado (tolera orden invertido, segundo
      nombre/apellido ausente, tildes, mayúsculas, abreviaturas).
    - `likely_match`: coincidencia parcial o ambigua.
    - `mismatch`: es claramente de OTRA persona.
    - `not_found`: el documento no muestra titular (genérico) → **no alarma**.
- **Nombre esperado:** el endpoint de subida/edición lo obtiene **de la BD** a
  partir del `worker_id` (`first_name + last_name`), **nunca** de un valor enviado
  por el cliente. Se pasa vía `resolve_document_dates(..., expected_person_name=...)`.
- El extractor también agrega `identity_reasoning` (frase breve de la IA). El TIPO se
  verifica análogamente con `match_confidence` + `type_reasoning` (misma escala de 4
  valores). La **acción** ante los veredictos la decide el veredicto combinado (abajo).

### Veredicto combinado y política silencio / aviso / confirmación

`app/services/ai_validation.py` combina los veredictos de **tipo** (`match_confidence`)
e **identidad** (`person_match`) tomando el **PEOR** (`mismatch` > `likely_match` >
`match`/`not_found`; `not_found` es neutro). Trabajadores combinan {tipo, identidad};
**vehículos solo {tipo}** (no hay identidad). NO hay bloqueo duro:

| Peor veredicto | Acción | HTTP | Efecto |
|----------------|--------|------|--------|
| `match` / `not_found` | `silent` | 201 | guarda sin ruido |
| `likely_match` | `warn` | 201 | guarda + `warnings[]` (nivel `info`, uno por dimensión dudosa con su `reasoning`) |
| `mismatch` | `conflict` | **409** | NO guarda; cuerpo estructurado con cada problema |

- **Cuerpo del 409** (`detail`): `{"message", "retryable": true, "override_field":
  "force_validation_override", "type": {expected, detected, reasoning}?, "identity":
  {expected_name, detected_name, reasoning}?}` — solo aparecen las dimensiones en
  `mismatch`.
- **Override único:** un solo flag de formulario **`force_validation_override`**
  (bool) cubre tipo **e** identidad, en subida y edición de ambos módulos. Reenviar
  con `true` guarda igual. Protegido por `require_module(..., WRITE)` — **cualquier
  usuario con escritura** puede usarlo (NO se exige admin).
- **Auditoría (migración `f2a3b4c5d6e7`):**
  - `WorkerDocument.validation_override_used: bool` + `validation_notes: str|null`.
  - `VehicleDocument.type_override_used: bool` + `validation_notes: str|null` (solo tipo).
  - `validation_notes` guarda el/los `reasoning` de la IA al momento de subir (para
    medir después si la IA acierta).
- **`/ai-scan` (preview):** devuelven ambos veredictos (`match_confidence`,
  `person_match`), sus `reasoning`, `validation_action` y `warnings[]`/`conflict`
  para que el frontend muestre todo ANTES de subir. Reciben `document_type_id`
  (+ `worker_id` en trabajadores) para calcular los veredictos.
- **Escudo de Vigencia (vehículos):** el bloqueo por documento vencido (**400**) es
  independiente y NO lo cubre `force_validation_override`.

## Tolerancia a fallas e higiene de errores

### Manejador global de excepciones (`app/main.py`)
- `@app.exception_handler(Exception)` captura cualquier excepción **no controlada**,
  la loggea completa con `logger.exception` (incluye `method` y `path`) y responde un
  **500 genérico** `{"detail": "Error interno del servidor."}` — nunca stacktrace ni
  detalles internos.
- Las `HTTPException` **no** pasan por este handler (Starlette las maneja con su handler
  dedicado): conservan su `status_code` y `detail` intactos.

### Mensajes sanitizados (no filtrar internals)
- Nunca poner el objeto de excepción en `detail=` (`f"...: {exc}"`). Patrón: **loggear**
  el detalle (`logger.warning`/`logger.exception`) y **responder** un mensaje genérico.
- `auth.py`: token inválido/expirado → log + respuesta `"Token inválido o expirado."`
- Endpoints IA (`/ai-scan`, upload/edit): fallo al contactar OpenAI → log + **502**
  `"El servicio de análisis no está disponible, intenta más tarde."`

### Health check (`GET /health`)
- **Root-level, sin autenticación y fuera del prefijo `/api/v1`** (para load balancers /
  UptimeRobot). Ejecuta `ping_database()` (`SELECT 1` con timeout corto vía
  `asyncio.wait_for`, en `app/db/session.py`).
- BD responde → **200** `{"status": "ok", "database": true}`.
- BD caída/timeout → **503** `{"status": "error", "database": false}`.

### Candado de producción (`app/core/config.py`)
- `ENVIRONMENT` (`development` | `production`, default `development`), con
  `settings.is_production`.
- Un `@model_validator(mode="after")` impone en `production`:
  1. `AUTH_DISABLED=true` → **la app se niega a arrancar** (`ValidationError` al
     construir `Settings`).
  2. `main.py` desactiva `/docs` y `/redoc` (`docs_url=None`, `redoc_url=None`).
  3. Si `CORS_ORIGINS` contiene `localhost` → solo **warning** en logs (no bloquea).

### Consistencia archivo↔BD en subidas y borrados
- Helper `delete_file(path)` en `storage.py`: unlink **best effort** (nunca lanza; loggea
  warning si falla).
- **Upload / edit:** el archivo se escribe a disco *antes* del commit. Si el commit falla
  → `rollback` + `delete_file()` del archivo recién escrito (evita huérfanos). En un
  **reemplazo** exitoso (edit con archivo nuevo) se borra además el archivo anterior.
- **DELETE de worker / vehicle:** antes del `db.delete` se recolectan los `file_path` de
  los documentos (la cascada de BD los borra pero deja los archivos); tras el commit se
  hace `delete_file()` de cada uno (best effort; el borrado de BD siempre se completa).

## Reglas para futuras sesiones

1. **Migraciones:** Nunca editar archivos en `migrations/versions/` ya existentes. Siempre crear una nueva con `alembic revision --autogenerate`.
2. **Sincronía schema/model:** Todo campo nuevo en un modelo SQLAlchemy requiere: migration + schema Pydantic backend + interfaz TypeScript en `frontend/lib/types.ts`.
3. **Router:** Todo endpoint nuevo debe registrarse en `app/api/v1/router.py` o no será accesible.
4. **Lint frontend:** Correr `npm run lint` en `frontend/` antes de terminar cualquier sesión que toque `.tsx`/`.ts`.
   **Lint backend:** Correr `ruff check app/` (y `ruff format app/`) antes de terminar cualquier sesión que toque `.py`. Config en `pyproject.toml` (line-length 100; ignores documentados: `B904`, `E501`, `E712` en queries, `F821` en modelos). No agregar `# noqa` sin justificarlo.
5. **Variables de entorno:** `.env` nunca va al repo (está en `.gitignore`). Usar `.env.example` como plantilla. La clave `OPENAI_API_KEY` debe rotarse si quedó expuesta.
6. **Diseño visual:** El sistema usa estilo SAP Fiori ERP — fondos blancos, tabs con `border-b-2 border-[#003f7a]`, tipografía densa (`text-[11px]`), sin dark mode.
7. **Async everywhere:** Todos los servicios y endpoints son `async def`. No usar `.execute()` síncrono de SQLAlchemy.
8. **Subida de archivos:** Toda subida nueva debe pasar por `validate_upload()` (lista blanca + magic bytes) y guardar el MIME derivado de la firma, nunca `file.content_type`. Al servir, usar `resolve_media_type()` + header `nosniff`. Ver "Política de archivos permitidos".
9. **Higiene de errores:** Nunca devolver `{exc}` ni stacktraces en `detail=`; loggear el detalle y responder un mensaje genérico. Toda subida que escriba a disco debe limpiar el archivo si el commit falla, y todo borrado/reemplazo de documento debe borrar el archivo físico (best effort). Ver "Tolerancia a fallas e higiene de errores".
