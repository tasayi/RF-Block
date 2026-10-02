"""
FastAPI application factory for RFBlock.
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from ..core.config import get_standalone_html_path
from .routes import health_router, sparams_router, touchstone_router

def create_app() -> FastAPI:
    app = FastAPI(
        title="RFBlock Engine API",
        version="2.0.0",
        description="RF Physics Solver & S-Parameter Cascade Service"
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Mount API routers under /api/v1
    app.include_router(health_router, prefix="/api/v1")
    app.include_router(sparams_router, prefix="/api/v1")
    app.include_router(touchstone_router, prefix="/api/v1")

    # Serve Standalone Web UI at root '/'
    @app.get("/", tags=["UI"])
    async def get_index():
        html_path = get_standalone_html_path()
        if not os.path.exists(html_path):
            raise HTTPException(
                status_code=404,
                detail="Standalone HTML bundle not found. Run node build.js first."
            )
        return FileResponse(html_path, media_type="text/html")

    return app

