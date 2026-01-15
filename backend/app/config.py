from pydantic_settings import BaseSettings
from pydantic import ConfigDict
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Hacker News API (no authentication required - uses public Algolia API)

    # Azure OpenAI Configuration
    AZURE_OPENAI_ENDPOINT: str
    AZURE_OPENAI_API_KEY: str
    AZURE_OPENAI_DEPLOYMENT_NAME: str = "gpt-4.1-mini"

    # Application Settings
    CACHE_SIZE: int = 1000
    MAX_TWEETS_PER_SEARCH: int = 1000
    EMBEDDING_BATCH_SIZE: int = 32

    # CORS Configuration
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
    ]

    model_config = ConfigDict(
        env_file=".env",
        case_sensitive=True,
        extra="ignore"  # Ignore extra fields in .env file (like old Twitter API keys)
    )


# Global settings instance
settings = Settings()
