# DEPLOYMENT — Primer arranque

Guía para poner en marcha la Plataforma de Acreditaciones en un entorno nuevo
(o tras migrar de la autenticación Microsoft Entra ID a la **autenticación local**
por email + contraseña).

## Requisitos previos

- Python 3.12 con el virtualenv del proyecto (`.venv`) y dependencias instaladas:
  ```powershell
  .venv\Scripts\python.exe -m pip install -r requirements.txt
  ```
- PostgreSQL 16 accesible y las variables de conexión configuradas en `.env`
  (ver `.env.example`).
- Variables de autenticación en `.env`:
  - `JWT_SECRET_KEY` — clave secreta para firmar los tokens. **En producción** la app
    se niega a arrancar si está vacía o si es el placeholder de ejemplo. Genera una:
    ```powershell
    .venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
    ```
  - `ACCESS_TOKEN_EXPIRE_MINUTES` — vida del token (default 480 = 8 h).
  - `ENVIRONMENT=production` en producción (activa los candados de seguridad).
  - `AUTH_DISABLED=false` en producción (la app no arranca con `true` si es prod).

## Procedimiento de primer arranque

```powershell
# 1) Aplicar las migraciones (crea/actualiza el esquema, incl. la tabla users)
.venv\Scripts\alembic.exe upgrade head

# 2) Crear el PRIMER administrador (bootstrap)
.venv\Scripts\python.exe -m scripts.create_admin
#    Pide email, nombre y contraseña por consola (la contraseña no se muestra).
#    No interactivo (CI/automatización):
#      set ADMIN_EMAIL=jefe@empresa.com
#      set ADMIN_FULL_NAME=Jefe
#      set ADMIN_PASSWORD=<contraseña-fuerte>
#      .venv\Scripts\python.exe -m scripts.create_admin --yes

# 3) Arrancar el backend
.venv\Scripts\uvicorn.exe app.main:app --host 0.0.0.0 --port 8000

# 4) Iniciar sesión en la app con el email + contraseña del paso 2
```

### Notas sobre el bootstrap (`scripts/create_admin.py`)

- Crea un usuario con `is_admin=True`, `is_active=True` y
  **`must_change_password=False`** (el operador definió la contraseña él mismo, no se
  le fuerza a cambiarla). Los usuarios que un admin crea después vía `POST /admin/users`
  sí llevan `must_change_password=True`.
- La contraseña se valida (largo 10–72, al menos una letra y un número), se pide con
  `getpass` (sin eco) y **nunca se imprime ni se registra**.
- Es **idempotente**: si el email ya existe, lo promueve a admin y le resetea la
  contraseña (en modo no interactivo requiere `--yes`).
- Códigos de salida: `0` ok · `1` cancelado por el operador · `2` entrada inválida
  (falta dato / contraseña débil / no coinciden) · `3` el usuario ya existe y falta `--yes`.

### Verificar si falta bootstrap

El endpoint público `GET /api/v1/auth/setup-status` responde `{"has_admin": bool}`
(sin exponer datos sensibles). Si es `false`, la base no tiene ningún administrador
activo y hay que ejecutar el paso 2. El frontend puede usarlo para mostrar una pantalla
de "no hay administradores, contacta al operador".

## Migración desde Microsoft Entra ID

Las cuentas creadas por el flujo anterior (Entra) quedaron con
`hashed_password='LOCKED_NO_PASSWORD'` (marcador no verificable) → **no pueden iniciar
sesión**. Deben recrearse:

- El primer admin, con `scripts.create_admin` (promueve/resetea si el email ya existe).
- El resto, por un admin desde la administración de usuarios (`POST /admin/users`).

## Salud del servicio

`GET /health` (root, sin auth, fuera de `/api/v1`) responde `200` si la BD está viva
o `503` si no. Útil para load balancers / monitoreo.
