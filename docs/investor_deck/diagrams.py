"""
diagrams.py
────────────
Generates every diagram PNG used in the ORBIC investor deck.
Pure PIL (Pillow) — no network, no external services. Run standalone:

    python diagrams.py

Outputs land in ./assets/. All diagrams are built from verified facts only
(see ../README.md "Verified claims" table) — no invented numbers appear here.
"""

import math
import os

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "assets")
os.makedirs(ASSETS, exist_ok=True)

FONT_DIR = r"C:\Windows\Fonts"


def font(name, size):
    return ImageFont.truetype(os.path.join(FONT_DIR, name), size)


def F(size):
    return font("segoeui.ttf", size)


def FB(size):
    return font("segoeuib.ttf", size)


# ── Palette (matches deck.py) ────────────────────────────────────────────────
BG = (8, 12, 22)
BG2 = (11, 17, 30)
PANEL = (15, 24, 40)
PANEL_LIGHT = (21, 33, 54)
BORDER = (36, 52, 78)
CYAN = (34, 211, 238)
CYAN_DIM = (18, 90, 102)
BLUE = (66, 133, 244)
BLUE_DIM = (30, 55, 95)
AMBER = (245, 166, 35)
AMBER_DIM = (110, 78, 24)
WHITE = (232, 238, 247)
MUTED = (140, 160, 188)
MUTED2 = (95, 112, 138)
GREEN = (52, 211, 153)
YELLOW = (251, 191, 36)
RED = (248, 113, 113)
PURPLE = (196, 132, 224)

STATUS_COLOR = {
    "built": GREEN,
    "operational": GREEN,
    "partial": AMBER,
    "progress": AMBER,
    "roadmap": MUTED2,
}
STATUS_TEXT = {
    "built": "BUILT",
    "operational": "OPERATIONAL",
    "partial": "PARTIALLY BUILT",
    "progress": "IN PROGRESS",
    "roadmap": "ROADMAP",
}


def text_centered(draw, xy, text, f, fill, anchor="mm"):
    draw.text(xy, text, font=f, fill=fill, anchor=anchor)


def rrect(draw, box, radius, outline=None, fill=None, width=2):
    draw.rounded_rectangle(box, radius=radius, outline=outline, fill=fill, width=width)


def arrow(draw, p1, p2, color, width=3, head=10):
    draw.line([p1, p2], fill=color, width=width)
    ang = math.atan2(p2[1] - p1[1], p2[0] - p1[0])
    for da in (0.5, -0.5):
        a = ang + math.pi - da
        x = p2[0] + head * math.cos(a)
        y = p2[1] + head * math.sin(a)
        draw.line([p2, (x, y)], fill=color, width=width)


def status_chip(draw, center, label, status, f):
    """status: 'built' | 'operational' | 'partial' | 'progress' | 'roadmap'"""
    color = STATUS_COLOR[status]
    text = STATUS_TEXT[status]
    w = f.getlength(text) + 22
    box = (center[0] - w / 2, center[1] - 14, center[0] + w / 2, center[1] + 14)
    rrect(draw, box, 14, outline=color, fill=(color[0] // 6, color[1] // 6, color[2] // 6), width=2)
    text_centered(draw, center, text, f, color)


def new_canvas(w, h, bg=None):
    mode = "RGBA" if bg is None else "RGB"
    fill = (0, 0, 0, 0) if bg is None else bg
    img = Image.new(mode, (w, h), fill)
    return img, ImageDraw.Draw(img)


def wrapped(draw, xy, text, f, fill, max_w, anchor_h="m", line_gap=8):
    """Center-wrap text within max_w, drawing lines centered on xy, returns bottom y."""
    words = text.split(" ")
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if f.getlength(trial) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    lh = f.size + line_gap
    y = xy[1] - (len(lines) - 1) * lh / 2
    for ln in lines:
        text_centered(draw, (xy[0], y), ln, f, fill)
        y += lh
    return y


# ── 1. Hero graphic (cover + closing background) ────────────────────────────
def hero_graphic():
    W, H = 2400, 1350
    img, d = new_canvas(W, H, BG)

    grad = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(grad)
    cx, cy, maxr = W * 0.82, H * 0.55, int(W * 0.75)
    for r in range(maxr, 0, -4):
        v = int(60 * (1 - r / maxr))
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=v)
    tint = Image.new("RGB", (W, H), (10, 40, 55))
    img = Image.composite(tint, img, grad)
    d = ImageDraw.Draw(img)

    for gx in range(int(W * 0.30), W, 60):
        d.line([(gx, 0), (gx, H)], fill=(20, 30, 46), width=1)
    for gy in range(0, H, 60):
        d.line([(int(W * 0.30), gy), (W, gy)], fill=(20, 30, 46), width=1)

    import random
    random.seed(7)
    nodes = []
    for i in range(46):
        ang = random.uniform(0, 2 * math.pi)
        rad = random.uniform(60, 560) * (1 + random.random())
        x = cx + rad * math.cos(ang)
        y = cy + rad * math.sin(ang) * 0.6
        if x < W * 0.28:
            continue
        nodes.append((x, y))

    for i, (x, y) in enumerate(nodes):
        for x2, y2 in nodes[i + 1:]:
            dist = math.hypot(x - x2, y - y2)
            if dist < 190:
                alpha = max(0, 1 - dist / 190)
                col = tuple(int(c1 + (c2 - c1) * alpha) for c1, c2 in zip(BG, (20, 60, 80)))
                d.line([(x, y), (x2, y2)], fill=col, width=1)

    for x, y in nodes:
        r = random.uniform(2, 5)
        glow = random.choice([CYAN, BLUE, AMBER]) if random.random() < 0.18 else (60, 110, 130)
        d.ellipse([x - r - 3, y - r - 3, x + r + 3, y + r + 3], fill=tuple(c // 4 for c in glow))
        d.ellipse([x - r, y - r, x + r, y + r], fill=glow)

    for r in range(140, 0, -2):
        a = int(90 * (1 - r / 140))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(34, 211 - r // 6, 238 - r // 6))
    d.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], fill=CYAN)

    fade = Image.new("L", (W, H), 0)
    fd = ImageDraw.Draw(fade)
    for x in range(0, int(W * 0.62)):
        v = int(255 * (1 - x / (W * 0.62)) ** 1.4)
        fd.line([(x, 0), (x, H)], fill=v)
    dark = Image.new("RGB", (W, H), BG)
    img = Image.composite(dark, img, fade)

    img.save(os.path.join(ASSETS, "hero_graphic.png"))


# ── 2. Four-engine architecture (slide 3) ────────────────────────────────────
def four_engine_architecture():
    W, H = 2400, 1500
    img, d = new_canvas(W, H, None)
    f_hub = FB(46)
    f_hub2 = F(24)
    f_eng = FB(32)
    f_sub = F(20)
    f_layer = FB(24)

    engines = [
        ("Sales\nEngine", CYAN),
        ("Operations\nEngine", BLUE),
        ("Portfolio\nEngine", AMBER),
        ("Collections\nEngine", PURPLE),
    ]
    n = len(engines)
    margin = 130
    gap = 50
    box_w = (W - 2 * margin - gap * (n - 1)) / n
    box_h = 260
    box_y = 470

    # Hub
    cx, cy = W / 2, 190
    rrect(d, [cx - 220, cy - 100, cx + 220, cy + 100], 26, fill=(*PANEL, 255), outline=(*CYAN, 255), width=4)
    text_centered(d, (cx, cy - 26), "ORBIC", f_hub, WHITE)
    text_centered(d, (cx, cy + 28), "Intelligence Layer", f_hub2, CYAN)

    # Spokes hub -> engines
    for i in range(n):
        x = margin + i * (box_w + gap) + box_w / 2
        arrow(d, (cx, cy + 100), (x, box_y - 8), BLUE_DIM, width=4, head=14)

    # Engine boxes
    engine_centers = []
    for i, (label, accent) in enumerate(engines):
        x = margin + i * (box_w + gap)
        rrect(d, [x, box_y, x + box_w, box_y + box_h], 22, fill=(*PANEL, 255), outline=(*accent, 255), width=3)
        d.rectangle([x, box_y, x + box_w, box_y + 8], fill=accent)
        ty = box_y + 60
        for ln in label.split("\n"):
            text_centered(d, (x + box_w / 2, ty), ln, f_eng, WHITE)
            ty += 40
        engine_centers.append((x + box_w / 2, box_y + box_h))

    # Cross-cutting horizontal layers beneath
    layers = [
        ("AI OPERATING LAYER", CYAN, "Orbi agent — 12 live tools grounded in production data"),
        ("AUDIT & CONTROL LAYER", AMBER, "Enrollment / billing / payment audits + nightly monitoring checkpoints"),
        ("REPORTING & INTELLIGENCE LAYER", MUTED, "PUC/ERCOT/EIA, settlements, cash, accounting, tax, ad-hoc reports"),
    ]
    ly = box_y + box_h + 70
    lh = 150
    lgap = 30
    for title, color, sub in layers:
        rrect(d, [margin, ly, W - margin, ly + lh], 18, outline=(*color, 255), width=3,
              fill=(color[0] // 10, color[1] // 10, color[2] // 10))
        text_centered(d, (W / 2, ly + 48), title, f_layer, color)
        text_centered(d, (W / 2, ly + 92), sub, f_sub, MUTED)
        for cx2, cy2 in engine_centers:
            d.line([(cx2, ly - lgap + 4 if ly == box_y + box_h + 70 else ly - 8), (cx2, ly)],
                   fill=(*BORDER, 160), width=2)
        ly += lh + lgap

    img.save(os.path.join(ASSETS, "four_engine_architecture.png"))


# ── 3. Complete REP lifecycle (slide 4) ─────────────────────────────────────
def lifecycle_pipeline():
    W, H = 2500, 1150
    img, d = new_canvas(W, H, None)
    f_h = FB(28)
    f_b = F(18)
    f_band = FB(22)

    stages = [
        ("Sales\nEngine", CYAN),
        ("Contract\nConfirmation", BLUE),
        ("Enrollment\nEngine", AMBER),
        ("Billing\nEngine", GREEN),
        ("Portfolio\nEngine", PURPLE),
        ("Collections", (230, 140, 140)),
    ]
    n = len(stages)
    margin = 80
    gap = 34
    box_w = (W - 2 * margin - gap * (n - 1)) / n
    box_h = 260
    y = 260

    for i, (title, accent) in enumerate(stages):
        x = margin + i * (box_w + gap)
        rrect(d, [x, y, x + box_w, y + box_h], 20, fill=(*PANEL, 255), outline=(*accent, 255), width=3)
        d.rectangle([x, y, x + box_w, y + 8], fill=accent)
        ty = y + box_h / 2 - 20
        for ln in title.split("\n"):
            text_centered(d, (x + box_w / 2, ty), ln, f_h, WHITE)
            ty += 34
        if i < n - 1:
            arrow(d, (x + box_w + 4, y + box_h / 2), (x + box_w + gap - 4, y + box_h / 2), CYAN, width=5, head=16)

    # Cross-cutting band above
    band_y = 90
    rrect(d, [margin, band_y, W - margin, band_y + 120], 18, outline=(*MUTED, 255), width=2,
          fill=(MUTED[0] // 12, MUTED[1] // 12, MUTED[2] // 12))
    text_centered(d, (W / 2, band_y + 40), "AI  ·  AUDIT  ·  REPORTING  ·  AUTOMATION", f_band, WHITE)
    text_centered(d, (W / 2, band_y + 78), "operating continuously across every stage of the lifecycle", f_b, MUTED)
    for i in range(n):
        x = margin + i * (box_w + gap) + box_w / 2
        d.line([(x, band_y + 120), (x, y - 6)], fill=(*BORDER, 180), width=2)

    text_centered(d, (W / 2, H - 40), "Every stage writes to the same underlying data model — a single source of truth end to end", F(20), MUTED2)

    img.save(os.path.join(ASSETS, "lifecycle_pipeline.png"))


# ── 4. Portfolio & risk engine (slide 7) ────────────────────────────────────
def portfolio_risk_diagram():
    W, H = 2500, 1500
    img, d = new_canvas(W, H, None)
    f_h = FB(27)
    f_b = F(18)
    f_col = FB(30)
    f_tag = FB(17)

    col_w = (W - 4 * 70) / 3
    col_gap = 70
    col_y = 130
    col_h = 1180

    def col_header(x, title, accent):
        rrect(d, [x, col_y, x + col_w, col_y + col_h], 22, outline=(*accent, 255), width=3,
              fill=(*PANEL, 255))
        d.rectangle([x, col_y, x + col_w, col_y + 8], fill=accent)
        text_centered(d, (x + col_w / 2, col_y + 46), title, f_col, accent)

    def item(x, y, w, label, status):
        h = 118
        color = STATUS_COLOR[status]
        rrect(d, [x, y, x + w, y + h], 14, fill=(*PANEL_LIGHT, 255), outline=(*color, 200), width=2)
        wrapped(d, (x + w / 2, y + 38), label, f_h, WHITE, w - 40, line_gap=6)
        status_chip(d, (x + w / 2, y + h - 22), "", status, f_tag)
        return y + h + 20

    x1 = 40
    col_header(x1, "FORECAST STACK", CYAN)
    y = col_y + 90
    pad = 24
    y = item(x1 + pad, y, col_w - 2 * pad, "Layer 1 — DNA Baseline (12-yr ERCOT history)", "built")
    y = item(x1 + pad, y, col_w - 2 * pad, "Layer 2 — ERCOT Growth Factors", "built")
    y = item(x1 + pad, y, col_w - 2 * pad, "Layer 3 — Seasonal NOAA Adjustment", "roadmap")
    y = item(x1 + pad, y, col_w - 2 * pad, "Layer 4 — 7-Day LFC Override (live in Position Screen)", "built")
    y = item(x1 + pad, y, col_w - 2 * pad, "ERCOT Shape Forecast / DNA Forecast toggle", "built")

    x2 = x1 + col_w + col_gap
    col_header(x2, "TRADING & EXPOSURE", AMBER)
    y = col_y + 90
    y = item(x2 + pad, y, col_w - 2 * pad, "Position Screen — load vs. hedged supply", "built")
    y = item(x2 + pad, y, col_w - 2 * pad, "Hedge Book — CRUD, zone / instrument filtering", "built")
    y = item(x2 + pad, y, col_w - 2 * pad, "DAM Purchases — manual entry + XLSX upload", "built")
    y = item(x2 + pad, y, col_w - 2 * pad, "Manual Mark-to-Market (MTM) by zone / deal", "built")
    y = item(x2 + pad, y, col_w - 2 * pad, "Live MTM market-price feeds (CME / ICE / Bloomberg)", "roadmap")

    x3 = x2 + col_w + col_gap
    col_header(x3, "RISK & MONITORING", PURPLE)
    y = col_y + 90
    y = item(x3 + pad, y, col_w - 2 * pad, "Risk Dashboard — Position 40% / Price 25% / Customer 20% / Weather 15%", "built")
    y = item(x3 + pad, y, col_w - 2 * pad, "4 Nightly Checkpoints — Mirror Test, Backtest, Energy Balance, Portfolio Ratio", "built")
    y = item(x3 + pad, y, col_w - 2 * pad, "Black-swan / anomaly detection", "roadmap")

    img.save(os.path.join(ASSETS, "portfolio_risk_diagram.png"))


# ── 4b. ERCOT price forecasting pipeline (slide 8) ──────────────────────────
def price_forecasting_diagram():
    W, H = 2500, 1350
    img, d = new_canvas(W, H, None)
    f_h = FB(23)
    f_b = F(17)
    f_tag = FB(16)
    f_model = FB(29)

    inputs = [
        ("Net Load Forecast", "Load minus wind/solar — existing 4-layer forecast stack", "built"),
        ("Historical DAM / RTM Prices", "ERCOT settlement price history, scraped directly", "built"),
        ("8-Zone Weather Forecast", "ERCOT + Open-Meteo, scraped weekly", "built"),
        ("ERCOT Bid/Offer Stack", "Public offer-curve data — planned input", "roadmap"),
    ]
    ix, iw = 90, 620
    ih, igap = 250, 40
    iy0 = 130

    mx, mw = ix + iw + 160, 620
    mh = 1090
    my = (H - mh) // 2

    ox, ow = mx + mw + 160, 480
    oh = 420
    oy = (H - oh) // 2

    for i, (t, sub, status) in enumerate(inputs):
        y = iy0 + i * (ih + igap)
        color = STATUS_COLOR[status]
        rrect(d, [ix, y, ix + iw, y + ih], 18, fill=(*PANEL, 255), outline=(*color, 220), width=2)
        wrapped(d, (ix + iw / 2, y + 68), t, f_h, WHITE, iw - 60, line_gap=6)
        wrapped(d, (ix + iw / 2, y + 138), sub, f_b, MUTED, iw - 70, line_gap=6)
        status_chip(d, (ix + iw / 2, y + ih - 32), "", status, f_tag)
        arrow(d, (ix + iw + 6, y + ih / 2), (mx - 6, my + mh / 2), BLUE, width=2, head=10)

    rrect(d, [mx, my, mx + mw, my + mh], 22, fill=(*PANEL, 255), outline=(*AMBER, 255), width=3)
    text_centered(d, (mx + mw / 2, my + mh / 2 - 70), "Gradient-Boosted", f_model, WHITE)
    text_centered(d, (mx + mw / 2, my + mh / 2 - 32), "Quantile Regression", f_model, WHITE)
    wrapped(d, (mx + mw / 2, my + mh / 2 + 34),
            "Predicts a full price distribution, not a single point estimate — ERCOT prices are "
            "heavy-tailed and spike risk matters more than the average", f_b, MUTED, mw - 90, line_gap=8)
    status_chip(d, (mx + mw / 2, my + mh - 40), "", "roadmap", f_tag)

    arrow(d, (mx + mw + 6, my + mh / 2), (ox - 6, oy + oh / 2), AMBER, width=3, head=13)

    rrect(d, [ox, oy, ox + ow, oy + oh], 20, fill=(*PANEL, 255), outline=(*CYAN, 255), width=3)
    wrapped(d, (ox + ow / 2, oy + oh / 2 - 40), "DAM Price Distribution Forecast", f_h, WHITE, ow - 60, line_gap=6)
    wrapped(d, (ox + ow / 2, oy + oh / 2 + 24),
            "P10 / P50 / P90 + spike probability, feeding the hedge ratio engine", f_b, MUTED, ow - 70, line_gap=6)
    status_chip(d, (ox + ow / 2, oy + oh - 34), "", "roadmap", f_tag)

    text_centered(d, (W / 2, 55),
                  "Existing load and weather forecasting infrastructure feeds a new DAM price-distribution model",
                  F(20), MUTED2)

    img.save(os.path.join(ASSETS, "price_forecasting_diagram.png"))


# ── 4c. DAM/RTM hedging framework (slide 9) ─────────────────────────────────
def hedging_framework_diagram():
    W, H = 2500, 1150
    img, d = new_canvas(W, H, None)
    f_h = FB(23)
    f_b = F(17)
    f_tag = FB(16)
    f_out = FB(22)

    steps = [
        ("Forecast Inputs", "Net load, price distribution,\nand weather (existing engines)", "built"),
        ("Spread Forecast +\nRTM Spike-Risk Score", "New analytics layered on the\nDAM price forecast", "roadmap"),
        ("Hedge Ratio Engine", "Risk gate overrides any\nspread signal in high-risk hours", "roadmap"),
    ]
    n = len(steps)
    margin = 140
    gap = 70
    box_w = (W - 2 * margin - gap * (n - 1)) / n
    box_h = 310
    y0 = 130

    for i, (t, sub, status) in enumerate(steps):
        x = margin + i * (box_w + gap)
        color = STATUS_COLOR[status]
        rrect(d, [x, y0, x + box_w, y0 + box_h], 20, fill=(*PANEL, 255), outline=(*color, 255), width=3)
        ty = y0 + 58
        for ln in t.split("\n"):
            text_centered(d, (x + box_w / 2, ty), ln, f_h, WHITE)
            ty += 32
        ty += 12
        for ln in sub.split("\n"):
            text_centered(d, (x + box_w / 2, ty), ln, f_b, MUTED)
            ty += 24
        status_chip(d, (x + box_w / 2, y0 + box_h - 34), "", status, f_tag)
        if i < n - 1:
            arrow(d, (x + box_w + 6, y0 + box_h / 2), (x + box_w + gap - 6, y0 + box_h / 2), CYAN, width=4, head=14)

    last_cx = margin + (n - 1) * (box_w + gap) + box_w / 2
    branch_y = y0 + box_h
    branch_mid = branch_y + 80

    out_w, out_h = 750, 380
    out_y = branch_mid + 40
    left_cx = W / 2 - 40 - out_w / 2
    right_cx = W / 2 + 40 + out_w / 2
    left_x, right_x = left_cx - out_w / 2, right_cx - out_w / 2

    d.line([(last_cx, branch_y + 6), (last_cx, branch_mid)], fill=AMBER, width=4)
    d.line([(left_cx, branch_mid), (right_cx, branch_mid)], fill=AMBER, width=4)
    arrow(d, (left_cx, branch_mid), (left_cx, out_y - 6), AMBER, width=4, head=14)
    arrow(d, (right_cx, branch_mid), (right_cx, out_y - 6), AMBER, width=4, head=14)

    # High-risk hours -> absolute rule, RTM is never left short
    rrect(d, [left_x, out_y, left_x + out_w, out_y + out_h], 20,
          fill=(RED[0] // 8, RED[1] // 8, RED[2] // 8), outline=(*RED, 255), width=3)
    text_centered(d, (left_cx, out_y + 50), "High-Risk Hours", f_out, RED)
    wrapped(d, (left_cx, out_y + 108), "Hedge at or above 100% of forecasted load", f_h, WHITE, out_w - 80, line_gap=8)
    wrapped(d, (left_cx, out_y + 190),
            "Absolute rule: RTM is never left short, regardless of any spread signal — RTM risk is "
            "asymmetric and uncapped", f_b, MUTED, out_w - 90, line_gap=8)
    wrapped(d, (left_cx, out_y + out_h - 40),
            "Reference: Winter Storm Uri, February 2021", f_b, RED, out_w - 90, line_gap=8)

    # Low-risk hours -> reduced hedge, capture spread
    rrect(d, [right_x, out_y, right_x + out_w, out_y + out_h], 20,
          fill=(*PANEL, 255), outline=(*GREEN, 255), width=3)
    text_centered(d, (right_cx, out_y + 50), "Low-Risk Hours Only", f_out, GREEN)
    wrapped(d, (right_cx, out_y + 108), "Reduced hedge ratio, captures the historical DAM-RTM spread", f_h, WHITE, out_w - 80, line_gap=8)
    wrapped(d, (right_cx, out_y + 190),
            "Gated by low net-load volatility and low spike probability — a risk-managed exception, "
            "not a standalone strategy", f_b, MUTED, out_w - 90, line_gap=8)
    status_chip(d, (right_cx, out_y + out_h - 34), "", "roadmap", f_tag)

    text_centered(d, (W / 2, 55),
                  "REPs procure ~100% of forecasted load in DAM — this framework governs only the residual RTM exposure",
                  F(20), MUTED2)

    img.save(os.path.join(ASSETS, "hedging_framework_diagram.png"))


# ── 5. Shadow settlements workflow (slide 11) ───────────────────────────────
def shadow_settlements_diagram():
    W, H = 2400, 900
    img, d = new_canvas(W, H, None)
    f_h = FB(25)
    f_b = F(18)
    f_tag = FB(17)

    steps = [
        ("1", "Estimate REP\nSettlement Bill", "From monthly usage, pricing,\nand billing data", "progress"),
        ("2", "Compare to Actual\nERCOT Settlement", "Against ERCOT DAM / RTM / AS\nsettlement data feeds", "roadmap"),
        ("3", "Reconcile\nDifferences", "Identify and explain\nvariances line by line", "roadmap"),
        ("4", "Two-Way\nAudit", "Cross-check REP records\nagainst ERCOT records", "roadmap"),
    ]
    n = len(steps)
    margin = 100
    gap = 60
    box_w = (W - 2 * margin - gap * (n - 1)) / n
    box_h = 420
    y = 220

    for i, (num, title, sub, status) in enumerate(steps):
        x = margin + i * (box_w + gap)
        color = STATUS_COLOR[status]
        rrect(d, [x, y, x + box_w, y + box_h], 20, fill=(*PANEL, 255), outline=(*color, 255), width=3)
        text_centered(d, (x + box_w / 2, y + 55), num, FB(50), color)
        ty = y + 130
        for ln in title.split("\n"):
            text_centered(d, (x + box_w / 2, ty), ln, f_h, WHITE)
            ty += 34
        ty += 16
        for ln in sub.split("\n"):
            text_centered(d, (x + box_w / 2, ty), ln, f_b, MUTED)
            ty += 26
        status_chip(d, (x + box_w / 2, y + box_h - 40), "", status, f_tag)
        if i < n - 1:
            arrow(d, (x + box_w + 6, y + box_h / 2), (x + box_w + gap - 6, y + box_h / 2), CYAN, width=5, head=16)

    text_centered(d, (W / 2, 90),
                  "Foundation already in place: ERCOT settlement data ingestion (RTM Initial / Final / True-Up) feeds the Position Screen today",
                  F(20), MUTED2)

    img.save(os.path.join(ASSETS, "shadow_settlements_diagram.png"))


# ── 6. Collections engine lifecycle (slide 9) ───────────────────────────────
def collections_lifecycle_diagram():
    W, H = 2500, 1000
    img, d = new_canvas(W, H, None)
    f_h = FB(22)
    f_b = F(16)
    f_tag = FB(16)

    stages = [
        ("Initial\nDelinquency", "Auto-scored, 4-tier\n(collections_accounts)", "built"),
        ("Payment\nFollow-Up", "Reminder / email\noutreach stages", "partial"),
        ("DNP", "PUC 10-day notice +\nhuman-gated execution", "built"),
        ("MVO", "Move-out stage\ntracked on account", "partial"),
        ("Legal\nEscalation", "Demand letter + legal\nstage tracking", "partial"),
        ("Collections\nAgent", "Autonomous LLM\naction proposals", "roadmap"),
    ]
    n = len(stages)
    margin = 70
    gap = 34
    box_w = (W - 2 * margin - gap * (n - 1)) / n
    box_h = 330
    y = 260

    for i, (title, sub, status) in enumerate(stages):
        x = margin + i * (box_w + gap)
        color = STATUS_COLOR[status]
        rrect(d, [x, y, x + box_w, y + box_h], 18, fill=(*PANEL, 255), outline=(*color, 255), width=3)
        ty = y + 46
        for ln in title.split("\n"):
            text_centered(d, (x + box_w / 2, ty), ln, f_h, WHITE)
            ty += 30
        ty += 14
        for ln in sub.split("\n"):
            text_centered(d, (x + box_w / 2, ty), ln, f_b, MUTED)
            ty += 24
        status_chip(d, (x + box_w / 2, y + box_h - 34), "", status, f_tag)
        if i < n - 1:
            arrow(d, (x + box_w + 4, y + box_h / 2), (x + box_w + gap - 4, y + box_h / 2), CYAN, width=4, head=13)

    rrect(d, [margin, 90, W - margin, 190], 16, outline=(*AMBER, 255), width=2,
          fill=(AMBER[0] // 10, AMBER[1] // 10, AMBER[2] // 10))
    text_centered(d, (W / 2, 140), "Every irreversible action (DNP execution, legal filing) routes through a human approval queue — PUC-rule compliant by design", F(19), AMBER)

    img.save(os.path.join(ASSETS, "collections_lifecycle_diagram.png"))


# ── 7. Operational email assistant pipeline (slide 11) ──────────────────────
def email_pipeline_diagram():
    W, H = 2400, 1250
    img, d = new_canvas(W, H, None)
    f_h = FB(26)
    f_b = F(18)
    f_tag = FB(17)

    # Incoming emails box
    ix, iy, iw, ih = 90, 470, 340, 220
    rrect(d, [ix, iy, ix + iw, iy + ih], 20, fill=(*PANEL, 255), outline=(*CYAN, 255), width=3)
    text_centered(d, (ix + iw / 2, iy + ih / 2 - 18), "Emails\nIncoming", f_h, WHITE)
    status_chip(d, (ix + iw / 2, iy + ih - 30), "", "roadmap", f_tag)

    # Classification / routing
    cx1, cy1, cw1, ch1 = ix + iw + 100, 470, 380, 220
    rrect(d, [cx1, cy1, cx1 + cw1, cy1 + ch1], 20, fill=(*PANEL, 255), outline=(*BLUE, 255), width=3)
    wrapped(d, (cx1 + cw1 / 2, cy1 + ch1 / 2 - 30), "Classification & Routing", f_h, WHITE, cw1 - 40)
    text_centered(d, (cx1 + cw1 / 2, cy1 + ch1 / 2 + 22), "Operations triages by category", f_b, MUTED)
    arrow(d, (ix + iw + 6, iy + ih / 2), (cx1 - 6, cy1 + ch1 / 2), CYAN, width=4, head=14)

    # Agent boxes
    agents = ["Billing\nAgent", "Payments\nAgent", "Enrollment\nAgent", "Collections\nAgent", "Other\nOps"]
    ax0 = cx1 + cw1 + 110
    aw, ah = 300, 130
    agap = 26
    ay0 = 240
    for i, a in enumerate(agents):
        ay = ay0 + i * (ah + agap)
        rrect(d, [ax0, ay, ax0 + aw, ay + ah], 16, fill=(*PANEL_LIGHT, 255), outline=(*AMBER, 255), width=2)
        ty = ay + ah / 2 - 14
        for ln in a.split("\n"):
            text_centered(d, (ax0 + aw / 2, ty), ln, F(20), WHITE)
            ty += 26
        arrow(d, (cx1 + cw1 + 6, cy1 + ch1 / 2), (ax0 - 6, ay + ah / 2), BLUE, width=2, head=10)

    # Research / draft box
    rx, ry, rw, rh = ax0 + aw + 110, 470, 380, 220
    rrect(d, [rx, ry, rx + rw, ry + rh], 20, fill=(*PANEL, 255), outline=(*GREEN, 255), width=3)
    wrapped(d, (rx + rw / 2, ry + rh / 2 - 30), "Agent researches & drafts a reply", f_h, WHITE, rw - 40)
    text_centered(d, (rx + rw / 2, ry + rh / 2 + 22), "sends reply if answer is confident", f_b, MUTED)
    for i in range(len(agents)):
        ay = ay0 + i * (ah + agap) + ah / 2
        arrow(d, (ax0 + aw + 6, ay), (rx - 6, ry + rh / 2), AMBER, width=2, head=10)

    # Human intervention branch
    hx, hy, hw, hh = rx, ry + rh + 90, rw, 150
    rrect(d, [hx, hy, hx + hw, hy + hh], 18, outline=(*RED, 255), width=2,
          fill=(RED[0] // 10, RED[1] // 10, RED[2] // 10))
    wrapped(d, (hx + hw / 2, hy + hh / 2), "Human intervention when the agent's answer isn't reliable", f_b, RED, hw - 50)
    arrow(d, (rx + rw / 2, ry + rh + 6), (hx + hw / 2, hy - 6), RED, width=3, head=12)

    # Reply to customer
    ox, oy, ow, oh = rx + rw + 100, 470, 340, 220
    rrect(d, [ox, oy, ox + ow, oy + oh], 20, fill=(*PANEL, 255), outline=(*CYAN, 255), width=3)
    wrapped(d, (ox + ow / 2, oy + oh / 2 - 10), "Operations sends reply to customer", f_h, WHITE, ow - 40)
    arrow(d, (rx + rw + 6, ry + rh / 2), (ox - 6, oy + oh / 2), GREEN, width=4, head=14)

    text_centered(d, (W / 2, 100),
                  "Customer service email pipeline — retrieval + drafting core built as a standalone tool; not yet integrated into ORBIC", FB(24), MUTED2)
    text_centered(d, (W / 2, H - 60),
                  "Box shapes are a structural reference — the real pipeline drafts replies via local retrieval over historical email, gated by a confidence check", F(19), MUTED2)

    img.save(os.path.join(ASSETS, "email_pipeline_diagram.png"))


# ── 8. AI agent diagram (slide 10) ──────────────────────────────────────────
def ai_agent_diagram():
    W, H = 2300, 1300
    img, d = new_canvas(W, H, None)
    f_h = FB(34)
    f_b = F(20)
    f_tool = F(19)

    cx, cy = 560, H / 2
    rrect(d, [cx - 260, cy - 130, cx + 260, cy + 130], 24, fill=(*PANEL, 255), outline=(*CYAN, 255), width=4)
    text_centered(d, (cx, cy - 60), "Orbi", FB(46), CYAN)
    text_centered(d, (cx, cy - 8), "Tool-calling agent", f_h, WHITE)
    text_centered(d, (cx, cy + 30), "GPT-4o-mini \u00b7 max 5-step loop", f_b, MUTED)
    text_centered(d, (cx, cy + 66), '"Never invent data \u2014', f_b, MUTED2)
    text_centered(d, (cx, cy + 92), 'always call a tool"', f_b, MUTED2)

    tools = [
        "search_customers", "get_customer_details", "check_esid",
        "get_payment_balance", "search_brokers", "get_daily_pricing",
        "get_commission_summary", "get_ercot_forecast", "get_expiring_contracts",
        "get_open_position", "get_past_due_accounts", "get_renewal_pipeline",
    ]
    tx = 1000
    cols = 2
    rows = 6
    tw, th = 560, 82
    gap_x, gap_y = 40, 22
    grid_h = rows * th + (rows - 1) * gap_y
    ty0 = cy - grid_h / 2

    for i, t in enumerate(tools):
        col = i // rows
        row = i % rows
        x = tx + col * (tw + gap_x)
        y = ty0 + row * (th + gap_y)
        rrect(d, [x, y, x + tw, y + th], 14, fill=(*PANEL_LIGHT, 255), outline=(*BLUE, 255), width=2)
        text_centered(d, (x + tw / 2, y + th / 2), t + "()", f_tool, WHITE)
        if col == 0:
            arrow(d, (cx + 260, cy), (x - 12, y + th / 2), BLUE, width=2, head=10)

    rx = tx + 2 * tw + gap_x + 60
    rrect(d, [rx, cy - 170, rx + 320, cy + 170], 22, fill=(*PANEL, 255), outline=(*AMBER, 255), width=4)
    text_centered(d, (rx + 160, cy - 90), "Live ORBIC", FB(28), WHITE)
    text_centered(d, (rx + 160, cy - 52), "FastAPI + DB", FB(28), WHITE)
    text_centered(d, (rx + 160, cy - 4), "Same data staff", f_b, MUTED)
    text_centered(d, (rx + 160, cy + 24), "see in the app \u2014", f_b, MUTED)
    text_centered(d, (rx + 160, cy + 52), "no separate model", f_b, MUTED)
    text_centered(d, (rx + 160, cy + 80), "of the business", f_b, MUTED)
    for i in range(rows):
        y = ty0 + i * (th + gap_y) + th / 2
        arrow(d, (tx + tw + gap_x + tw + 6, y), (rx - 10, cy), (*AMBER, 90), width=1, head=0)

    img.save(os.path.join(ASSETS, "ai_agent_diagram.png"))


def main():
    hero_graphic()
    four_engine_architecture()
    lifecycle_pipeline()
    portfolio_risk_diagram()
    price_forecasting_diagram()
    hedging_framework_diagram()
    shadow_settlements_diagram()
    collections_lifecycle_diagram()
    email_pipeline_diagram()
    ai_agent_diagram()
    print("Diagrams written to", ASSETS)


if __name__ == "__main__":
    main()
