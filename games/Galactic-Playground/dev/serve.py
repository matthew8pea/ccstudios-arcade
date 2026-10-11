"""Tiny no-cache static server for developing Galactic Playground.
Usage: python dev/serve.py [port]   (serves the project root; also honours $PORT)
"""
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(os.environ.get("PORT", 8765))
    os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
    http.server.ThreadingHTTPServer(("127.0.0.1", port), NoCacheHandler).serve_forever()
