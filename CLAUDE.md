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

## Reglas para futuras sesiones

1. **Migraciones:** Nunca editar archivos en `migrations/versions/` ya existentes. Siempre crear una nueva con `alembic revision --autogenerate`.
2. **Sincronía schema/model:** Todo campo nuevo en un modelo SQLAlchemy requiere: migration + schema Pydantic backend + interfaz TypeScript en `frontend/lib/types.ts`.
3. **Router:** Todo endpoint nuevo debe registrarse en `app/api/v1/router.py` o no será accesible.
4. **Lint frontend:** Correr `npm run lint` en `frontend/` antes de terminar cualquier sesión que toque `.tsx`/`.ts`.
5. **Variables de entorno:** `.env` nunca va al repo (está en `.gitignore`). Usar `.env.example` como plantilla. La clave `OPENAI_API_KEY` debe rotarse si quedó expuesta.
6. **Diseño visual:** El sistema usa estilo SAP Fiori ERP — fondos blancos, tabs con `border-b-2 border-[#003f7a]`, tipografía densa (`text-[11px]`), sin dark mode.
7. **Async everywhere:** Todos los servicios y endpoints son `async def`. No usar `.execute()` síncrono de SQLAlchemy.
