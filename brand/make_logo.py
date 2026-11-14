"""Draws the Cotsi logo (the "Rising C") as SVG files.

The C is made of five segments, one per learning method in Cotsi's teaching
(the vital 20% first, a question after every idea, explain it back, scenes that
fix misconceptions, spaced reviews). They brighten as they rise, and the opening
ends in the Thapa diamond: the job you are aiming for.

Run: python3 brand/make_logo.py   (writes brand/cotsi-logo/*.svg)
"""
import math
from pathlib import Path

OUT = Path(__file__).parent / "cotsi-logo"
CX, CY, R, STROKE = 250, 262, 138, 60
START, SWEEP, GAP = 40, 280, 8          # degrees, clockwise from 3 o'clock (screen coordinates)
OPACITY = [0.34, 0.5, 0.66, 0.83, 1.0]
PURPLE, PINK, DEEP = "#7c6af7", "#d08cff", "#4b3bd1"


def point(r, deg):
    a = math.radians(deg)
    return CX + r * math.cos(a), CY + r * math.sin(a)


def arc(a0, a1):
    (x0, y0), (x1, y1) = point(R, a0), point(R, a1)
    return f"M{x0:.1f} {y0:.1f} A{R} {R} 0 0 1 {x1:.1f} {y1:.1f}"


def mark(diamond_fill):
    seg = (SWEEP - GAP * 4) / 5
    parts = []
    for i in range(5):
        a0 = START + i * (seg + GAP)
        parts.append(f'<path d="{arc(a0, a0 + seg)}" stroke="url(#c)" stroke-opacity="{OPACITY[i]}" '
                     f'stroke-width="{STROKE}" fill="none"/>')
    x, y = point(R, 336)
    x, y, s = x + 10, y - 16, 36
    parts.append(f'<path d="M{x:.1f} {y - s:.1f} L{x + s:.1f} {y:.1f} L{x:.1f} {y + s:.1f} L{x - s:.1f} {y:.1f}Z" fill="{diamond_fill}"/>')
    return "".join(parts)


DEFS = f'''<linearGradient id="c" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="{PURPLE}"/><stop offset="1" stop-color="{PINK}"/></linearGradient>'''
BG = '''<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b1730"/><stop offset="1" stop-color="#0a0910"/></linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.35" r="0.6"><stop offset="0" stop-color="#7c6af7" stop-opacity="0.35"/><stop offset="1" stop-color="#7c6af7" stop-opacity="0"/></radialGradient>'''


def svg(body, defs, rx=None):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">'
            f'<title>Cotsi</title><defs>{defs}</defs>{body}</svg>\n')


def main():
    OUT.mkdir(exist_ok=True)
    tile = '<rect width="500" height="500" rx="112" fill="url(#bg)"/><rect width="500" height="500" rx="112" fill="url(#glow)"/>'
    square = '<rect width="500" height="500" fill="url(#bg)"/><rect width="500" height="500" fill="url(#glow)"/>'
    files = {
        "cotsi-logo.svg": svg(tile + mark("#ffffff"), DEFS + BG),            # rounded app-icon tile
        "cotsi-logo-square.svg": svg(square + mark("#ffffff"), DEFS + BG),   # full square, for sites that crop to a circle
        "cotsi-mark.svg": svg(mark("#ffffff"), DEFS),                        # transparent, for dark backgrounds
        "cotsi-mark-light.svg": svg(mark(DEEP), DEFS),                       # transparent, for light backgrounds
    }
    for name, text in files.items():
        (OUT / name).write_text(text, encoding="utf-8")
    print("wrote", ", ".join(files))


if __name__ == "__main__":
    main()
