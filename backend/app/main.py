from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.models import HealthResponse
from app.routers import twitter, analysis


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup and shutdown events."""
    # Startup
    print("=" * 50)
    print("Hacker News Topic Analysis API Starting...")
    print("=" * 50)
    print("Loading sentence-transformers model...")
    # Models are loaded lazily when first used
    print("API is ready!")
    print("=" * 50)
    yield
    # Shutdown
    print("Shutting down Hacker News Topic Analysis API...")


# Create FastAPI application
app = FastAPI(
    title="Hacker News Topic Analysis API",
    description="API for analyzing Hacker News topics using ML clustering and LLM summaries",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(twitter.router, prefix="/api/v1")
app.include_router(analysis.router, prefix="/api/v1")


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="ok",
        message="Hacker News Analysis API is running"
    )


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "Hacker News Topic Analysis API",
        "version": "1.0.0",
        "docs": "/docs"
    }


