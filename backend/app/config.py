from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")

    keitaro_api_url: str
    keitaro_api_key: str
    campaign_prefix: str = "test_verkhoturov_"
    default_domain_id: int | None = None
    default_group_id: int | None = None
    default_source_id: int | None = None
    database_url: str = "sqlite:///./app.db"

    @field_validator("default_domain_id", "default_group_id", "default_source_id", mode="before")
    @classmethod
    def _empty_to_none(cls, v):
        return None if v == "" else v


settings = Settings()
