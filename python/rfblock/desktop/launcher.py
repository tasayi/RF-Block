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

def run_pyside6_app(url: str) -> bool:
    """Launch native desktop window via PySide6 QWebEngineView with interactive download handling."""
    try:
        import os
        import sys
        from PySide6.QtWidgets import QApplication, QMainWindow, QFileDialog
        from PySide6.QtWebEngineWidgets import QWebEngineView
        from PySide6.QtWebEngineCore import QWebEngineDownloadRequest, QWebEngineSettings
        from PySide6.QtCore import QUrl, QStandardPaths

        app = QApplication.instance() or QApplication(sys.argv)
        app.setApplicationName("RFBlock")

        window = QMainWindow()
        window.setWindowTitle("RF Block Diagram Editor & scikit-rf Physics Engine")
        window.resize(1440, 920)

        view = QWebEngineView(window)
        window.setCentralWidget(view)

        # Enable necessary HTML5/JS features
        settings = view.settings()
        settings.setAttribute(QWebEngineSettings.WebAttribute.JavascriptEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalStorageEnabled, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessRemoteUrls, True)
        settings.setAttribute(QWebEngineSettings.WebAttribute.LocalContentCanAccessFileUrls, True)

        status_bar = window.statusBar()
        status_bar.showMessage("Ready. scikit-rf cascade physics engine online.", 5000)

        profile = view.page().profile()

        def on_download_requested(download: QWebEngineDownloadRequest):
            suggested = download.downloadFileName() or download.suggestedFileName() or "export_file"
            downloads_dir = QStandardPaths.writableLocation(QStandardPaths.StandardLocation.DownloadLocation)
            if not downloads_dir or not os.path.exists(downloads_dir):
                downloads_dir = os.path.expanduser("~/Downloads")
            default_path = os.path.join(downloads_dir, suggested)

            save_path, _ = QFileDialog.getSaveFileName(
                window,
                "Save Export File",
                default_path
            )
            if save_path:
                target_dir = os.path.dirname(save_path)
                target_name = os.path.basename(save_path)
                download.setDownloadDirectory(target_dir)
                download.setDownloadFileName(target_name)
                download.accept()
                print(f"📥 [Export] Saving to: {save_path}")
                status_bar.showMessage(f"Saving to: {save_path}...", 5000)

                def on_finished():
                    if download.isFinished():
                        print(f"✅ [Export] Saved successfully: {save_path}")
                        status_bar.showMessage(f"✅ Exported: {save_path}", 8000)

                download.isFinishedChanged.connect(on_finished)
            else:
                download.cancel()
                status_bar.showMessage("Export cancelled.", 3000)

        profile.downloadRequested.connect(on_download_requested)
        view.load(QUrl(url))
        window.show()
        app.exec()
        return True
    except Exception as e:
        print(f"PySide6 desktop launcher fallback: {e}")
        return False


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

    # 1. Try launching native PySide6 QWebEngineView window with full download handling
    if run_pyside6_app(url):
        return

    # 2. Try launching PyWebView for native window UI fallback
    try:
        import webview
        webview.create_window("RF Block Diagram Editor & S-Parameter Engine", url, width=1400, height=900)
        webview.start()
        return
    except Exception as e:
        print(f"PyWebView native window fallback: {e}")

    # 3. Fallback to default browser launch
    threading.Timer(1.0, lambda: webbrowser.open(url)).start()

    try:
        server_thread.join()
    except KeyboardInterrupt:
        print("\nShutting down RFBlock...")

