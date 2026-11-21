"""
FastAPI application factory for RFBlock.
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from ..core.config import get_standalone_html_path
from .routes import health_router, sparams_router, touchstone_router, agent_router, ws_router

def create_app() -> FastAPI:
    app = FastAPI(
        title="RFBlock Engine API",
        version="2.2.0",
        description="RF Physics Solver, Cascade Engine & AI Agent Gateway"
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
    app.include_router(agent_router, prefix="/api/v1")

    # Mount WebSocket for live UI synchronization
    app.include_router(ws_router)

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

    # Serve M365 Copilot & ChatGPT Manifests
    project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
    copilot_dir = os.path.join(project_root, "copilot")

    @app.get("/copilot/openapi.yaml", tags=["Copilot"])
    async def get_copilot_openapi():
        spec_path = os.path.join(copilot_dir, "openapi.yaml")
        if not os.path.exists(spec_path):
            raise HTTPException(status_code=404, detail="openapi.yaml not found.")
        return FileResponse(spec_path, media_type="text/yaml")

    @app.get("/.well-known/ai-plugin.json", tags=["Copilot"])
    @app.get("/copilot/ai-plugin.json", tags=["Copilot"])
    async def get_ai_plugin_manifest():
        manifest_path = os.path.join(copilot_dir, "ai-plugin.json")
        if not os.path.exists(manifest_path):
            raise HTTPException(status_code=404, detail="ai-plugin.json not found.")
        return FileResponse(manifest_path, media_type="application/json")

    return app

