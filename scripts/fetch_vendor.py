#!/usr/bin/env python3
"""Fetch PeerJS and Stockfish.js vendor assets for offline & file:// execution."""

import json
import os
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VENDOR_DIR = os.path.join(ROOT, "vendor")
os.makedirs(VENDOR_DIR, exist_ok=True)
for sub in ("styles", "src", "dist"):
    os.makedirs(os.path.join(ROOT, sub), exist_ok=True)

PEERJS_URL = "https://cdn.jsdelivr.net/npm/peerjs@1.5.5/dist/peerjs.min.js"
STOCKFISH_URL = "https://cdn.jsdelivr.net/npm/stockfish.js@10.0.2/stockfish.js"


def download_text(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "ChessP2P-Fetcher/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8")


def main() -> None:
    print(f"Downloading {PEERJS_URL} ...")
    peerjs_src = download_text(PEERJS_URL)
    peerjs_path = os.path.join(VENDOR_DIR, "peerjs.min.js")
    with open(peerjs_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(peerjs_src)
    print(f"Saved {peerjs_path} ({len(peerjs_src):,} bytes)")

    print(f"Downloading {STOCKFISH_URL} ...")
    sf_src = download_text(STOCKFISH_URL)
    # Escape closing script tags safely for both direct <script src> and inline HTML bundling
    encoded = json.dumps(sf_src).replace("</", "<\\/")
    sf_bundle_path = os.path.join(VENDOR_DIR, "stockfish-bundle.js")
    with open(sf_bundle_path, "w", encoding="utf-8", newline="\n") as f:
        f.write("/* Stockfish 10.0.2 Pure-JS Worker Bundle (GPL-3.0) */\n")
        f.write(f"window.__STOCKFISH_SRC__ = {encoded};\n")
    print(f"Saved {sf_bundle_path} ({os.path.getsize(sf_bundle_path):,} bytes)")


if __name__ == "__main__":
    main()
