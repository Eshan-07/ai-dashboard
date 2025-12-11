# backend/main.py
import os
import logging
import time
import threading
from typing import List

# Configure logging immediately so any import-time errors can be logged
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger("ai-dashboard-backend")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ---------------- Routers ----------------
# We'll attempt imports and log full exception info if they fail.
# If a router is missing we'll set the variable to None so the app can still run.

upload_router = None
auth_router = None
admin_router = None
chart_render_router = None
chatbot_router = None
transformer_router = None

try:
    from routes.upload import router as upload_router
    logger.info("✅ routes.upload imported.")
except Exception as e:
    logger.warning("routes.upload not available: %s", e, exc_info=True)

try:
    from routes.auth import router as auth_router
    logger.info("✅ routes.auth imported.")
except Exception as e:
    logger.warning("routes.auth not available: %s", e, exc_info=True)

try:
    from routes.admin import router as admin_router
    logger.info("✅ routes.admin imported.")
except Exception as e:
    logger.info("routes.admin not available: %s", e, exc_info=True)

try:
    from routes.chart_render import router as chart_render_router
    logger.info("✅ routes.chart_render imported.")
except Exception as e:
    logger.info("routes.chart_render not available: %s", e, exc_info=True)

try:
    from routes.chatbot import router as chatbot_router
    logger.info("✅ routes.chatbot imported.")
except Exception as e:
    logger.info("routes.chatbot not available: %s", e, exc_info=True)

try:
    from routes.transformer import router as transformer_router
    logger.info("✅ routes.transformer imported.")
except Exception as e:
    logger.info("routes.transformer not available: %s", e, exc_info=True)

# ---------------- Mongo Connection ----------------
mongo_client = None
mongo_db = None
try:
    from utils.mongo import client as mongo_client, db as mongo_db
    logger.info("✅ utils.mongo imported.")
except Exception as e:
    logger.warning("utils.mongo not available or failed to import: %s", e, exc_info=True)
    mongo_client = None
    mongo_db = None

# ---------------- FastAPI App ----------------
app = FastAPI(
    title="AI Dashboard Backend",
    description="FastAPI backend for AI-powered Data Dashboard Generator",
    version="1.0.0",
)

# ---------------- Global JSON exception handler ----------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Ensure all unhandled exceptions return JSON (no HTML debug pages)."""
    logger.exception(
        "Unhandled exception processing request %s %s: %s",
        request.method,
        request.url.path,
        exc,
    )
    details = str(exc)
    is_dev = os.getenv("ENV", "").lower() in ("dev", "development", "local", "debug")
    content = {"error": "Internal server error"}
    if is_dev:
        content["details"] = details
    return JSONResponse(status_code=500, content=content)

# ---------------- Rate limiter (simple token bucket) ----------------
RATE_LIMIT_CAPACITY = int(os.getenv("RATE_LIMIT_CAPACITY", "10"))
RATE_LIMIT_WINDOW = int(os.getenv("RATE_LIMIT_WINDOW", "60"))

RATE_LIMIT_WHITELIST = set(
    ip.strip()
    for ip in (os.getenv("RATE_LIMIT_WHITELIST", "127.0.0.1,::1").split(","))
    if ip.strip()
)

RATE_LIMIT_PATH_EXEMPT = (
    "/openapi.json",
    "/docs",
    "/redoc",
    "/favicon.ico",
    "/static",
    "/health",
    "/",
)

_rate_lock = threading.Lock()
_rate_state = {}  # key -> (tokens: float, last_refill_ts: float)


def _get_client_key(request: Request) -> str:
    xff = request.headers.get("x-forwarded-for")
    if xff:
        return xff.split(",")[0].strip()
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


@app.middleware("http")
async def simple_token_bucket_rate_limiter(request: Request, call_next):
    """Token-bucket limiter per client IP; consumes 1 token per request."""
    try:
        path = request.url.path or ""
        for pfx in RATE_LIMIT_PATH_EXEMPT:
            if path == pfx or path.startswith(pfx + "/"):
                return await call_next(request)

        client_key = _get_client_key(request)
        if client_key in RATE_LIMIT_WHITELIST:
            return await call_next(request)

        rate_per_sec = float(RATE_LIMIT_CAPACITY) / max(1.0, float(RATE_LIMIT_WINDOW))
        now = time.time()

        with _rate_lock:
            state = _rate_state.get(client_key)
            if state is None:
                tokens = float(RATE_LIMIT_CAPACITY)
                last = now
            else:
                tokens, last = state

            delta = max(0.0, now - last)
            refill = delta * rate_per_sec
            tokens = min(float(RATE_LIMIT_CAPACITY), tokens + refill)
            last = now

            if tokens >= 1.0:
                tokens -= 1.0
                _rate_state[client_key] = (tokens, last)
                remaining = int(max(0, tokens))

                response = await call_next(request)
                try:
                    response.headers["X-RateLimit-Limit"] = str(RATE_LIMIT_CAPACITY)
                    response.headers["X-RateLimit-Remaining"] = str(remaining)
                except Exception:
                    pass
                return response
            else:
                needed = 1.0 - tokens
                retry_after = int(max(1, (needed / rate_per_sec))) if rate_per_sec > 0 else RATE_LIMIT_WINDOW
                _rate_state[client_key] = (tokens, last)
                body = {"detail": "Too Many Requests", "retry_after_seconds": retry_after}
                headers = {
                    "Retry-After": str(retry_after),
                    "X-RateLimit-Limit": str(RATE_LIMIT_CAPACITY),
                    "X-RateLimit-Remaining": "0",
                }
                return JSONResponse(status_code=429, content=body, headers=headers)
    except Exception as middleware_exc:
        logger.exception("Rate limiter middleware error, allowing request: %s", middleware_exc)
        return await call_next(request)

# ---------------- CORS Config ----------------
_frontend_env = os.getenv("FRONTEND_URLS") or os.getenv("FRONTEND_URL") or "http://localhost:3000"

if isinstance(_frontend_env, str) and "," in _frontend_env:
    FRONTEND_ORIGINS: List[str] = [u.strip() for u in _frontend_env.split(",") if u.strip()]
else:
    FRONTEND_ORIGINS = [
        u.strip()
        for u in (_frontend_env.split(",") if isinstance(_frontend_env, str) else [_frontend_env])
    ]

allow_origins = ["*"] if (len(FRONTEND_ORIGINS) == 1 and FRONTEND_ORIGINS[0] == "*") else FRONTEND_ORIGINS
logger.info(f"✅ Allowing CORS from: {allow_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- Include Routers ----------------
if upload_router is not None:
    app.include_router(upload_router, prefix="/upload", tags=["upload"])
else:
    logger.warning("⚠️ routes.upload not found — upload endpoints unavailable.")

if auth_router is not None:
    app.include_router(auth_router, prefix="/auth", tags=["auth"])
else:
    logger.warning("⚠️ routes.auth not found — auth endpoints unavailable.")

if admin_router is not None:
    app.include_router(admin_router, prefix="/admin", tags=["admin"])
else:
    logger.warning("⚠️ routes.admin not found — admin endpoints unavailable.")

# Chart endpoints (only chart_render, no legacy routes.charts)
if chart_render_router is not None:
    app.include_router(chart_render_router, prefix="/charts", tags=["charts"])
    logger.info("✅ Included router: routes.chart_render (prefix=/charts)")
else:
    logger.warning("⚠️ routes.chart_render not found — /charts endpoints unavailable.")

# Chatbot
if chatbot_router is not None:
    app.include_router(chatbot_router, prefix="/chat", tags=["chat"])
    logger.info("✅ Included router: routes.chatbot (prefix=/chat)")
else:
    logger.info("routes.chatbot not found — chatbot endpoints unavailable.")

# Transformer
if transformer_router is not None:
    app.include_router(transformer_router, prefix="/models/transformer", tags=["transformer"])
    logger.info("✅ Included router: routes.transformer (prefix=/models/transformer)")
else:
    logger.info("routes.transformer not found — transformer endpoints unavailable.")

# ---------------- Root & Health Routes ----------------
@app.get("/", tags=["root"])
def read_root():
    return {"message": "AI Dashboard Backend is running 🚀"}


@app.get("/health", tags=["health"])
def health_check():
    mongo_ok = False
    try:
        if mongo_db is not None:
            try:
                # many mongo drivers expose sync or async command; try both
                try:
                    mongo_db.command("ping")
                except TypeError:
                    # some async clients need await — but in sync context call the sync version
                    mongo_db.command("ping")
                mongo_ok = True
            except Exception as e:
                logger.debug("Mongo ping inside health failed: %s", e, exc_info=True)
                mongo_ok = False
    except Exception as e:
        logger.debug("Health check mongo check failed: %s", e, exc_info=True)
        mongo_ok = False
    return {"status": "ok", "mongo": mongo_ok}

# ---------------- Startup / Shutdown ----------------
@app.on_event("startup")
async def startup_event():
    logger.info("🚀 Starting up...")

    if mongo_db is not None:
        try:
            # Try async ping first; if TypeError (sync client) fall back to sync.
            try:
                await mongo_db.command("ping")
                logger.info("✅ Successfully connected to MongoDB (async ping OK).")
            except TypeError:
                mongo_db.command("ping")
                logger.info("✅ Successfully connected to MongoDB (sync ping OK).")
            except Exception:
                # If driver raises other exceptions, log and continue
                mongo_db.command("ping")
                logger.info("✅ MongoDB ping executed.")
        except Exception as e:
            logger.error(f"❌ MongoDB ping failed: {e}", exc_info=True)
    else:
        logger.warning("⚠️ MongoDB client not available (utils.mongo not configured).")


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("🛑 Shutting down...")
    if mongo_client is not None:
        try:
            mongo_client.close()
            logger.info("✅ MongoDB connection closed.")
        except Exception as e:
            logger.warning(f"⚠️ Error while closing MongoDB: {e}", exc_info=True)
