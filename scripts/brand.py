#!/usr/bin/env python3
"""Значок и картинка для соцсетей — в static/: favicon.svg, favicon.ico, og.png.

Запускается руками, когда меняется знак или первый экран; результат коммитится, сборка его только копирует.
Нужен Pillow (сборке он не нужен). Знак — тот же, что в `partials/header.html`: линия, полный и пустой круг.
Цвета — `--ink` и `--bg` из `theme/assets/tokens.css`. Шрифт картинки — системный Arial: Pillow не читает woff2.
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static"
INK, BG, ACCENT = "#1B2128", "#F5F6F7", "#3E5368"
FONTS = Path("/System/Library/Fonts/Supplemental")

SVG = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<rect width="32" height="32" rx="7" fill="{INK}"/>
<line x1="10" y1="22" x2="22" y2="10" stroke="{BG}" stroke-width="2"/>
<circle cx="10" cy="22" r="5" fill="{BG}"/>
<circle cx="22" cy="10" r="4.2" fill="{INK}" stroke="{BG}" stroke-width="2"/>
</svg>
"""


def mark(d, x, y, s, fg, bg):
    """Знак в квадрате со стороной s, левый верхний угол (x, y); координаты — как у viewBox 22 в шапке."""
    k = s / 22
    d.line([(x + 6 * k, y + 16 * k), (x + 16 * k, y + 6 * k)], fill=fg, width=max(1, round(1.5 * k)))
    d.ellipse([x + 2 * k, y + 12 * k, x + 10 * k, y + 20 * k], fill=fg)
    d.ellipse([x + 12.5 * k, y + 2.5 * k, x + 19.5 * k, y + 9.5 * k], fill=bg, outline=fg, width=max(1, round(1.5 * k)))


def icon(size):
    im = Image.new("RGBA", (size * 4, size * 4), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=size * 4 * 7 // 32, fill=INK)
    mark(d, size * 4 * 0.12, size * 4 * 0.12, size * 4 * 0.76, BG, INK)
    return im.resize((size, size), Image.LANCZOS)


def og():
    w, h = 1200, 630
    im = Image.new("RGB", (w, h), BG)
    d = ImageDraw.Draw(im)
    size = 92                                            # самый крупный, при котором обе строки влезают в поля
    while max(d.textlength(t, font=ImageFont.truetype(str(FONTS / "Arial Bold.ttf"), size))
              for t in ("Все дела в одном месте", "Достаточно только спросить")) > w - 2 * 96:
        size -= 2
    bold = ImageFont.truetype(str(FONTS / "Arial Bold.ttf"), size)
    name = ImageFont.truetype(str(FONTS / "Arial Bold.ttf"), 40)
    body = ImageFont.truetype(str(FONTS / "Arial.ttf"), 34)
    mark(d, 96, 92, 64, INK, BG)
    d.text((180, 100), "Life OS", font=name, fill=INK)
    d.text((96, 230), "Все дела в одном месте", font=bold, fill=INK)
    d.text((96, 230 + int(size * 1.2)), "Достаточно только спросить", font=bold, fill=ACCENT)
    d.text((96, 470), "Сообщения, письма, документы, задачи, мысли и финансы —", font=body, fill=INK)
    d.text((96, 516), "одна система на вашем компьютере.", font=body, fill=INK)
    d.text((96, 580), "lifeos.antonlozhkin.ru", font=ImageFont.truetype(str(FONTS / "Arial.ttf"), 24), fill=ACCENT)
    return im


def main():
    OUT.mkdir(exist_ok=True)
    (OUT / "favicon.svg").write_text(SVG, encoding="utf-8")
    icon(48).save(OUT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    icon(180).convert("RGB").save(OUT / "apple-touch-icon.png")
    og().save(OUT / "og.png", optimize=True)
    for f in sorted(OUT.iterdir()):
        print(f"{f.relative_to(ROOT)} · {f.stat().st_size // 1024 or 1} KB")


if __name__ == "__main__":
    main()
