#!/usr/bin/env python3
"""Serve the assetless Blood browser bundle for local Chromium testing."""

from __future__ import annotations

import argparse
import http.server
import json
import os
from pathlib import Path
from urllib.parse import urlsplit


DATA_PATHS = frozenset({
    "BLOOD.INI", "BLOOD.RFF", "GUI.RFF", "SOUNDS.RFF", "SURFACE.DAT", "VOXEL.DAT",
    *(f"TILES{index:03d}.ART" for index in range(18)),
})


class BloodHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def send_health(self) -> None:
        body = json.dumps({
            "ok": True,
            "game": "blood-wasm",
            "retailData": "browser-local",
        }).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def dev_data_path(self) -> Path | None:
        path = urlsplit(self.path).path
        if not path.startswith("/dev-data/") or self.server.data_root is None:
            return None
        relative = path.removeprefix("/dev-data/")
        if relative not in DATA_PATHS:
            return None
        return self.server.data_root / relative

    def send_dev_data(self, path: Path) -> None:
        if not path.is_file():
            self.send_error(404, "local test data not found")
            return
        size = path.stat().st_size
        self.send_response(200)
        self.send_header("Content-Type", "application/octet-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(size))
        self.end_headers()
        if self.command != "HEAD":
            with path.open("rb") as source:
                self.copyfile(source, self.wfile)

    def do_GET(self) -> None:
        path = urlsplit(self.path).path
        if path == "/health":
            self.send_health()
            return
        dev_data = self.dev_data_path()
        if dev_data is not None:
            self.send_dev_data(dev_data)
            return
        if path.startswith("/dev-data/"):
            self.send_error(404, "local test data is disabled")
            return
        if path.startswith("/data/"):
            self.send_error(404, "retail data is browser-local")
            return
        super().do_GET()

    def do_HEAD(self) -> None:
        path = urlsplit(self.path).path
        if path == "/health":
            self.send_health()
            return
        dev_data = self.dev_data_path()
        if dev_data is not None:
            self.send_dev_data(dev_data)
            return
        if path.startswith("/dev-data/"):
            self.send_error(404, "local test data is disabled")
            return
        if path.startswith("/data/"):
            self.send_error(404, "retail data is browser-local")
            return
        super().do_HEAD()

    def do_PUT(self) -> None:
        self.send_response(405)
        self.send_header("Allow", "GET, HEAD")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.send_header("Content-Length", "0")
        self.end_headers()
        self.close_connection = True


class BloodServer(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--directory", required=True)
    parser.add_argument("--data-root")
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, required=True)
    args = parser.parse_args()
    directory = os.path.abspath(args.directory)
    handler = lambda *handler_args, **handler_kwargs: BloodHandler(
        *handler_args, directory=directory, **handler_kwargs
    )
    with BloodServer((args.bind, args.port), handler) as server:
        server.data_root = Path(args.data_root).resolve() if args.data_root else None
        print(f"Serving {directory} on http://{args.bind}:{args.port}/", flush=True)
        print("Retail data remains in each browser's private cache", flush=True)
        if server.data_root:
            print(f"Local-only test import enabled from {server.data_root}", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
