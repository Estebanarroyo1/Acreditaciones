import logging

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


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

# Valor de ejemplo de JWT_SECRET_KEY: inseguro a propósito. El candado de
# producción rechaza arrancar si la clave sigue siendo este placeholder.
INSECURE_JWT_DEFAULT = "dev-insecure-secret-change-me-not-for-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # App
    PROJECT_NAME: str = "Plataforma de Acreditaciones"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = False
    # Entorno de ejecución. En "production" se activan los candados de seguridad:
    # se prohíbe AUTH_DISABLED, se desactivan /docs y /redoc, y se advierte si
    # CORS_ORIGINS contiene localhost.
    ENVIRONMENT: str = "development"

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
    SMTP_USER: str = ""  # empty → email sending disabled
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = ""  # defaults to SMTP_USER if blank

    # Scheduler
    SCHEDULER_TIMEZONE: str = "America/Santiago"
    NOTIFICATION_HOUR: int = 8
    NOTIFICATION_MINUTE: int = 0

    # CORS — comma-separated origins; override in production
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    # Autenticación local (email + contraseña, JWT firmado por nosotros con HS256)
    # Valor de ejemplo inseguro para que dev arranque sin configuración. En
    # producción la app se NIEGA a arrancar si sigue siendo este default o está vacío.
    JWT_SECRET_KEY: str = INSECURE_JWT_DEFAULT
    # Vida del access token; 480 min = 8 h (una jornada laboral).
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480
    # ⚠️ NEVER set AUTH_DISABLED=True in production — it bypasses all authentication
    AUTH_DISABLED: bool = False

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "production"

    @model_validator(mode="after")
    def _enforce_production_locks(self) -> "Settings":
        if self.is_production:
            # Candado duro: jamás arrancar en producción con la auth desactivada.
            if self.AUTH_DISABLED:
                raise ValueError(
                    "ENVIRONMENT=production con AUTH_DISABLED=true está prohibido: "
                    "esto desactivaría toda la autenticación. Configura "
                    "AUTH_DISABLED=false para arrancar en producción."
                )
            # Candado duro: en producción exigimos un JWT_SECRET_KEY real (no vacío
            # ni el placeholder de ejemplo); de lo contrario los tokens serían
            # falsificables por cualquiera que conozca el default.
            if not self.JWT_SECRET_KEY or self.JWT_SECRET_KEY == INSECURE_JWT_DEFAULT:
                raise ValueError(
                    "ENVIRONMENT=production requiere un JWT_SECRET_KEY propio y "
                    "secreto. Configura una clave aleatoria larga (p. ej. "
                    '`python -c "import secrets; print(secrets.token_urlsafe(48))"`).'
                )
            # Aviso (no bloqueo): CORS con localhost en producción suele ser un error.
            localhost_origins = [o for o in self.CORS_ORIGINS if "localhost" in o]
            if localhost_origins:
                logger.warning(
                    "ENVIRONMENT=production pero CORS_ORIGINS contiene orígenes "
                    "localhost (%s). Revisa la configuración de CORS para producción.",
                    ", ".join(localhost_origins),
                )
        return self


settings = Settings()
