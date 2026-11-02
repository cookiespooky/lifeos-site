#!/usr/bin/env python3
"""Карта сайта для языковых моделей — dist/llms.txt (формат llmstxt.org).

Читает уже собранный dist/: адреса — из карты сайта, название и описание — из самих страниц. Поэтому не расходится
с сайтом и не повторяет правила адресов из rules.yaml. Запускается в конце scripts/build.sh.
"""
import html
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

DIST = Path(sys.argv[1] if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent / "dist")
SECTIONS = [("/dlya/", "Для кого"), ("/chto-vnutri/", "Что внутри — части системы"), ("/kak/", "Инструкции"), ("/blog/", "Блог")]
# Английская версия (её <html lang="en">) — свои адреса разделов и названия.
SECTIONS_EN = [("/for/", "Who it is for"), ("/inside/", "What is inside — the parts of the system"), ("/how/", "Guides")]


def page(url, base="/"):
    """Путь страницы от корня этой сборки: у английской версии, собранной под /en/, base — «/en/»."""
    path = "/" + urlparse(url).path[len(base):]
    f = DIST / path.strip("/") / "index.html" if path.strip("/") else DIST / "index.html"
    text = f.read_text(encoding="utf-8")
    title = re.search(r"<title>(.*?)</title>", text, re.S)
    desc = re.search(r'<meta name="description" content="(.*?)"', text, re.S)
    return path, html.unescape(title.group(1).strip()) if title else path, html.unescape(desc.group(1).strip()) if desc else ""


def main():
    urls = []
    for sm in sorted(DIST.glob("sitemap-0*.xml")):
        urls += re.findall(r"<loc>(.*?)</loc>", sm.read_text(encoding="utf-8"))
    base = min((urlparse(u).path for u in urls), key=len, default="/")   # адрес главной: «/» или «/en/»
    pages = [page(u, base) + (u,) for u in urls]
    home = next((p for p in pages if p[0] == "/"), None)
    out = ["# Life OS", ""]
    if home:
        out += [f"> {home[2]}", ""]
    rest = [p for p in pages if p[0] != "/"]
    en = '<html lang="en"' in (DIST / "index.html").read_text(encoding="utf-8")
    for prefix, name in SECTIONS_EN if en else SECTIONS:
        group = [p for p in rest if p[0].startswith(prefix)]
        if not group:
            continue
        out += [f"## {name}", ""]
        out += [f"- [{t}]({u}){': ' + d if d else ''}" for _, t, d, u in sorted(group, key=lambda p: p[0] != prefix)]
        out.append("")
        rest = [p for p in rest if p not in group]
    if rest:
        out += ["## More" if en else "## Ещё", ""] + [f"- [{t}]({u}){': ' + d if d else ''}" for _, t, d, u in rest] + [""]
    (DIST / "llms.txt").write_text("\n".join(out), encoding="utf-8")
    print(f"llms.txt: страниц {len(pages)}")


if __name__ == "__main__":
    main()
