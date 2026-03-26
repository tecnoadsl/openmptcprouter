from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://omr:omr_dev_password@db:5432/omr_platform"
    MQTT_BROKER: str = "mqtt"
    MQTT_PORT: int = 1883
    MQTT_USER: str = ""
    MQTT_PASS: str = ""
    REDIS_URL: str = "redis://redis:6379"
    SECRET_KEY: str = "dev-secret-change-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    class Config:
        env_file = ".env"


settings = Settings()
