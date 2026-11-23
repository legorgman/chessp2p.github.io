#!/usr/bin/env python3
"""Bundle index.html and admin.html into zero-dependency single-file HTML builds."""

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST_DIR = os.path.join(ROOT, "dist")
os.makedirs(DIST_DIR, exist_ok=True)


def read_utf8(rel_path: str) -> str:
    full = os.path.join(ROOT, rel_path)
    with open(full, "r", encoding="utf-8") as f:
        return f.read()


def bundle_html(src_html_name: str, out_html_name: str) -> None:
    html = read_utf8(src_html_name)

    def inline_css(match: re.Match) -> str:
        href = match.group(1)
        css = read_utf8(href).replace("</style", "<\\/style")
        return f"<style>\n{css}\n  </style>"

    def inline_js(match: re.Match) -> str:
        src = match.group(1)
        js = read_utf8(src)
        # Escape any literal </script occurrences safely
        js = re.sub(r"</script", "<\\/script", js, flags=re.IGNORECASE)
        return f"<script>\n{js}\n  </script>"

    html = re.sub(r'<link\s+rel="stylesheet"\s+href="([^"]+)">', inline_css, html)
    html = re.sub(r'<script\s+src="([^"]+)"></script>', inline_js, html)

    out_path = os.path.join(DIST_DIR, out_html_name)
    with open(out_path, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)

    # Verify zero external local script/stylesheet links remain
    leftover = re.findall(r'<script\s+src=|<link\s+rel="stylesheet"', html)
    if leftover:
        raise RuntimeError(f"Unbundled tags left in {out_html_name}: {leftover}")

    print(f"Built {out_path} ({os.path.getsize(out_path):,} bytes)")


def main() -> None:
    bundle_html("index.html", "ChessP2P.html")
    bundle_html("admin.html", "ChessP2P-Admin.html")


if __name__ == "__main__":
    main()
