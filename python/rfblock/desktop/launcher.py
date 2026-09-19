"""
Desktop launcher: Binds local port, boots FastAPI Uvicorn server, and opens PyWebView window / browser.
"""

import sys
import socket
import threading
import webbrowser
import uvicorn
from ..api.app import create_app

def find_free_port() -> int:
    """Find a free TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]

def run_desktop_app():
    """Launch the application."""
    port = find_free_port()
    host = "127.0.0.1"
    url = f"http://{host}:{port}/"

    app = create_app()

    def start_server():
        uvicorn.run(app, host=host, port=port, log_level="warning")

    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()

    print(f"============================================================")
    print(f" 🚀 RFBlock Desktop & scikit-rf Engine")
    print(f" 🌐 Running at: {url}")
    print(f"============================================================")

    # Try launching PyWebView for native window UI
    try:
        import webview
        webview.create_window("RF Block Diagram Editor & S-Parameter Engine", url, width=1400, height=900)
        webview.start()
        return
    except Exception as e:
        print(f"PyWebView native window fallback: {e}")

    # Fallback to default browser launch
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    try:
        server_thread.join()
    except KeyboardInterrupt:
        print("\nShutting down RFBlock...")

