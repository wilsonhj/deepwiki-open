import logging
import os

from dotenv import load_dotenv
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Load environment variables from .env file
# ruff: noqa: E402
load_dotenv()
# ruff: noqa: E402

from api.auth import require_auth
from api.logger import get_logger, setup_logging
from api.routers import auth, chat, codemap, repo, system, wiki

# Configure logging
setup_logging()
logger = get_logger(__name__)

# Configure watchfiles logger to show file paths
watchfiles_logger = logging.getLogger("watchfiles.main")
watchfiles_logger.setLevel(logging.DEBUG)  # Enable DEBUG to see file paths

# Apply watchfiles monkey patch BEFORE uvicorn import
is_development = os.environ.get("NODE_ENV") != "production"
if is_development:
    import watchfiles

    current_dir = os.path.dirname(os.path.abspath(__file__))
    logs_dir = os.path.join(current_dir, "logs")

    original_watch = watchfiles.watch

    def patched_watch(*args, **kwargs):
        # Only watch the api directory but exclude logs subdirectory
        # Instead of watching the entire api directory, watch specific subdirectories
        api_subdirs = []
        for item in os.listdir(current_dir):
            item_path = os.path.join(current_dir, item)
            if os.path.isdir(item_path) and item != "logs":
                api_subdirs.append(item_path)
            elif os.path.isfile(item_path) and item.endswith(".py"):
                api_subdirs.append(item_path)

        return original_watch(*api_subdirs, **kwargs)

    watchfiles.watch = patched_watch

app = FastAPI(
    title="Streaming API",
    description="API for streaming chat completions and wiki generation",
    version="0.1.0",
)

# DEEPWIKI_ALLOWED_ORIGINS is a comma-separated origin list. The previous
# ["*"] + allow_credentials=True pairing is not inert: Starlette echoes the
# caller's Origin back with Access-Control-Allow-Credentials: true, so any page
# the victim visits could read responses from this API.
_raw_origins = os.environ.get("DEEPWIKI_ALLOWED_ORIGINS", "").strip()
allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()] or [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
allow_all_origins = allowed_origins == ["*"]
if allow_all_origins:
    logger.warning(
        "DEEPWIKI_ALLOWED_ORIGINS='*' — credentials are disabled for CORS. "
        "Set an explicit origin list to allow credentialed cross-origin requests."
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    # Never pair credentials with a wildcard.
    allow_credentials=not allow_all_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# `system` and `auth` stay public: the frontend must be able to discover whether
# a code is required before it can supply one. Everything else is gated by
# require_auth, which is a no-op unless WIKI_AUTH_MODE is enabled.
for module in (system, auth):
    app.include_router(module.router)

for module in (repo, wiki, chat, codemap):
    app.include_router(module.router, dependencies=[Depends(require_auth)])


@app.get("/")
async def root():
    """Root endpoint to check if the API is running and list available endpoints dynamically."""
    # Collect routes dynamically from the FastAPI app
    endpoints = {}
    for route in app.routes:
        if hasattr(route, "methods") and hasattr(route, "path"):
            # Skip docs and static routes
            if route.path in ["/openapi.json", "/docs", "/redoc", "/favicon.ico"]:
                continue
            # Group endpoints by first path segment
            path_parts = route.path.strip("/").split("/")
            group = path_parts[0].capitalize() if path_parts[0] else "Root"
            method_list = list(route.methods - {"HEAD", "OPTIONS"})
            for method in method_list:
                endpoints.setdefault(group, []).append(f"{method} {route.path}")

    # Optionally, sort endpoints for readability
    for group in endpoints:
        endpoints[group].sort()

    return {
        "message": "Welcome to Streaming API",
        "version": "1.0.0",
        "endpoints": endpoints,
    }


if __name__ == "__main__":
    # Get port from environment variable or use default
    port = int(os.environ.get("PORT", 8001))

    logger.info(f"Starting Streaming API on port {port}")

    # Run the FastAPI app with uvicorn
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=port,
        reload=is_development,
        reload_excludes=["**/logs/*", "**/__pycache__/*", "**/*.pyc"]
        if is_development
        else None,
    )
