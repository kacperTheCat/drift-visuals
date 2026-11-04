#!/usr/bin/env python3
"""Local DRIFT server without caching — after any file change, just reload the page."""
import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


print(f"DRIFT: http://localhost:{PORT}")
http.server.ThreadingHTTPServer(("", PORT), NoCache).serve_forever()
