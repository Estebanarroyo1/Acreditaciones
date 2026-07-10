from pydantic_settings import BaseSettings, SettingsConfigDict


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


settings = Settings()
