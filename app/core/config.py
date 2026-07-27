from pydantic_settings import BaseSettings, SettingsConfigDict


# ── Política de archivos permitidos (defensa contra XSS almacenado vía upload) ──
# Lista blanca de extensiones aceptadas en cualquier subida de documento
# (trabajadores y vehículos). Cualquier extensión fuera de este conjunto se
# rechaza con 422 antes de tocar el disco.
ALLOWED_UPLOAD_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}

# MIME canónico derivado de la extensión ya validada. NUNCA se confía en el
# Content-Type enviado por el cliente: este es el valor que se guarda en BD y
# el único que se usa al servir el archivo.
EXTENSION_TO_MIME = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

# Conjunto de MIME que consideramos seguros para servir inline.
ALLOWED_MIME_TYPES = set(EXTENSION_TO_MIME.values())


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # App
    PROJECT_NAME: str = "Plataforma de Acreditaciones"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False

    # Database
    POSTGRES_SERVER: str = "localhost"
    POSTGRES_PORT: int = 5432
    POSTGRES_USER: str = "postgres"
    POSTGRES_PASSWORD: str = "postgres"
    POSTGRES_DB: str = "acreditaciones"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.POSTGRES_USER}:{self.POSTGRES_PASSWORD}"
            f"@{self.POSTGRES_SERVER}:{self.POSTGRES_PORT}/{self.POSTGRES_DB}"
        )

    # Storage
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 10

    # Email / SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_TLS: bool = True
    SMTP_USER: str = ""          # empty → email sending disabled
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""          # defaults to SMTP_USER if blank

    # Scheduler
    SCHEDULER_TIMEZONE: str = "America/Santiago"
    NOTIFICATION_HOUR: int = 8
    NOTIFICATION_MINUTE: int = 0

    # CORS — comma-separated origins; override in production
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    # OpenAI — leave empty to disable AI extraction
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"
    # Rate limit para los endpoints /ai-scan: máximo de llamadas por usuario/minuto.
    AI_SCAN_MAX_PER_MINUTE: int = 10

    # Microsoft Entra ID (M365) authentication
    ENTRA_TENANT_ID: str = ""
    ENTRA_CLIENT_ID: str = ""
    ADMIN_EMAILS: str = ""  # comma-separated list of emails that get is_admin=True on first login
    # ⚠️ NEVER set AUTH_DISABLED=True in production — it bypasses all authentication
    AUTH_DISABLED: bool = False


settings = Settings()
