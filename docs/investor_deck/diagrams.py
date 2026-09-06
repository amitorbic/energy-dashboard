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
    """status: 'built' | 'partial' | 'roadmap'"""
    color = {"built": GREEN, "partial": AMBER, "roadmap": MUTED2}[status]
    text = {"built": "BUILT", "partial": "PARTIAL", "roadmap": "ROADMAP"}[status]
    w = f.getlength(text) + 22
    box = (center[0] - w / 2, center[1] - 14, center[0] + w / 2, center[1] + 14)
    rrect(draw, box, 14, outline=color, fill=(color[0] // 6, color[1] // 6, color[2] // 6), width=2)
    text_centered(draw, center, text, f, color)


def new_canvas(w, h, bg=None):
    mode = "RGBA" if bg is None else "RGB"
    fill = (0, 0, 0, 0) if bg is None else bg
    img = Image.new(mode, (w, h), fill)
    return img, ImageDraw.Draw(img)


# ── 1. Hero graphic (cover background) ───────────────────────────────────────
def hero_graphic():
    W, H = 2400, 1350
    img, d = new_canvas(W, H, BG)

    # radial-ish gradient wash from bottom-right
    grad = Image.new("L", (W, H), 0)
    gd = ImageDraw.Draw(grad)
    cx, cy, maxr = W * 0.82, H * 0.55, int(W * 0.75)
    for r in range(maxr, 0, -4):
        v = int(60 * (1 - r / maxr))
        gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=v)
    tint = Image.new("RGB", (W, H), (10, 40, 55))
    img = Image.composite(tint, img, grad)
    d = ImageDraw.Draw(img)

    # faint HUD grid, right two-thirds only
    for gx in range(int(W * 0.30), W, 60):
        d.line([(gx, 0), (gx, H)], fill=(20, 30, 46), width=1)
    for gy in range(0, H, 60):
        d.line([(int(W * 0.30), gy), (W, gy)], fill=(20, 30, 46), width=1)

    # network of glowing nodes converging center-right
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

    # central hub glow
    for r in range(140, 0, -2):
        a = int(90 * (1 - r / 140))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(34, 211 - r // 6, 238 - r // 6))
    d.ellipse([cx - 10, cy - 10, cx + 10, cy + 10], fill=CYAN)

    # left vignette so title text is legible
    fade = Image.new("L", (W, H), 0)
    fd = ImageDraw.Draw(fade)
    for x in range(0, int(W * 0.62)):
        v = int(255 * (1 - x / (W * 0.62)) ** 1.4)
        fd.line([(x, 0), (x, H)], fill=v)
    dark = Image.new("RGB", (W, H), BG)
    img = Image.composite(dark, img, fade)

    img.save(os.path.join(ASSETS, "hero_graphic.png"))


# ── 2. Lifecycle ring (slide 3) ──────────────────────────────────────────────
def lifecycle_ring():
    W, H = 2000, 1500
    img, d = new_canvas(W, H, None)

    stages = [
        "Contract\nConfirmation", "Enrollment &\nMasterRoll", "Activation",
        "Billing", "Collections", "Portfolio\nForecasting", "Hedging",
        "Settlement", "Risk\nMonitoring", "AI-Assisted\nOperations",
    ]
    cx, cy, R = W / 2, H / 2 + 20, 560
    n = len(stages)
    f_lbl = FB(26)
    f_hub = FB(46)
    f_hub2 = F(22)

    pts = []
    for i in range(n):
        ang = -math.pi / 2 + i * 2 * math.pi / n
        x = cx + R * math.cos(ang)
        y = cy + R * math.sin(ang) * 0.82
        pts.append((x, y, ang))

    # connecting ring arcs with arrowheads (clockwise)
    for i in range(n):
        x1, y1, _ = pts[i]
        x2, y2, _ = pts[(i + 1) % n]
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        d.line([(x1, y1), (mx, my)], fill=BLUE_DIM, width=4)
        arrow(d, (mx, my), (x2, y2), BLUE, width=4, head=14)

    # spokes to hub
    for x, y, _ in pts:
        d.line([(cx, cy), (x, y)], fill=(*BORDER, 140), width=2)

    # hub
    for r in range(170, 0, -2):
        a = int(110 * (1 - r / 170))
        d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(*CYAN, a))
    rrect(d, [cx - 150, cy - 90, cx + 150, cy + 90], 26, fill=(*PANEL, 255), outline=(*CYAN, 255), width=4)
    text_centered(d, (cx, cy - 18), "ORBIC", f_hub, WHITE)
    text_centered(d, (cx, cy + 28), "Connected Lifecycle Engine", f_hub2, CYAN)

    # stage nodes
    box_w, box_h = 300, 130
    for (x, y, ang), label in zip(pts, stages):
        box = (x - box_w / 2, y - box_h / 2, x + box_w / 2, y + box_h / 2)
        rrect(d, box, 20, fill=(*PANEL_LIGHT, 255), outline=(*CYAN, 255), width=3)
        lines = label.split("\n")
        ly = y - (len(lines) - 1) * 16
        for ln in lines:
            text_centered(d, (x, ly), ln, f_lbl, WHITE)
            ly += 34

    img.save(os.path.join(ASSETS, "lifecycle_ring.png"))


# ── 3. Architecture diagram (slide 5) ────────────────────────────────────────
def architecture_diagram():
    W, H = 2400, 1500
    img, d = new_canvas(W, H, None)
    f_h = FB(34)
    f_b = F(22)
    f_small = F(19)
    f_tag = FB(20)

    def box(x, y, w, h, title, lines, accent=CYAN, tag=None):
        rrect(d, [x, y, x + w, y + h], 18, fill=(*PANEL, 255), outline=(*accent, 255), width=3)
        d.rectangle([x, y, x + w, y + 8], fill=accent)
        text_centered(d, (x + w / 2, y + 42), title, f_h, WHITE)
        if tag:
            tw = f_tag.getlength(tag) + 24
            rrect(d, [x + w - tw - 16, y + 16, x + w - 16, y + 44], 12, outline=accent, width=2)
            text_centered(d, (x + w - tw / 2 - 16, y + 30), tag, f_tag, accent)
        ly = y + 82
        for ln in lines:
            text_centered(d, (x + w / 2, ly), ln, f_b, MUTED)
            ly += 32
        return (x, y, w, h)

    # Frontend
    fb = box(140, 60, 2120, 220, "Frontend — Next.js + TypeScript + Tailwind",
              ["109 pages across Sales, Operations, Portfolio, Reports, Audit, Customers, Broker, Admin, System",
               "Sidebar-driven SPA · role-gated Admin section · localStorage JWT session"],
              accent=CYAN, tag="app/pages")

    arrow(d, (1200, 280), (1200, 350), BLUE, width=5, head=16)
    text_centered(d, (1350, 315), "REST / JSON", f_small, MUTED2)

    # Backend
    bb = box(140, 350, 2120, 260, "Backend API — FastAPI (async, SQLAlchemy + aiomysql)",
              ["45 routers · 39 controllers · registered under /api in main.py",
               "JWT auth middleware (require_auth) · tenant-aware via TenantMiddleware",
               "Enrollment · Billing · Portfolio · Hedging · DAM · MTM · Risk · Monitoring · Voice"],
              accent=BLUE, tag="api/routers")

    arrow(d, (1200, 610), (1200, 690), AMBER, width=5, head=16)
    text_centered(d, (1420, 650), "SQLAlchemy / aiomysql", f_small, MUTED2)

    # Data layer
    db = box(140, 690, 1480, 260, "Data Layer — MySQL / MariaDB (DB-per-tenant)",
              ["38 migrations · one database + one app instance per REP tenant",
               "contract_renewal · billing_periods · hedge_book · mtm_results ·",
               "risk_scores · forecast_checkpoints · ercot_load_history"],
              accent=AMBER, tag="api/migrations")

    # ERCOT ingestion pipeline (side column feeding DB)
    ib = box(1700, 690, 560, 260, "ERCOT Data Ingestion",
              ["LFC (hourly) · DAM · RTM", "Market Prices · Weather",
               "Playwright scrapers, PM2-scheduled"],
              accent=GREEN, tag="scrapers")
    arrow(d, (1700, 820), (1620, 820), GREEN, width=5, head=16)

    # AI layer connecting to backend
    ai = box(140, 1010, 1080, 220, "AI Operating Layer — \u201cOrbi\u201d",
             ["Tool-calling agent (GPT-4o-mini) · 12 live tools",
              "Calls the same FastAPI endpoints as the UI \u2014 grounded, not standalone"],
             accent=CYAN, tag="app/pages/agent.tsx")
    arrow(d, (680, 1010), (680, 950), CYAN, width=5, head=16)

    # Monitoring layer
    mon = box(1280, 1010, 980, 220, "Monitoring & Self-Healing",
              ["4 nightly checkpoints \u2192 forecast_checkpoints",
               "GREEN / YELLOW / RED grading, PM2-scheduled, dashboarded"],
              accent=AMBER, tag="api/monitoring")
    arrow(d, (1770, 1010), (1770, 950), AMBER, width=5, head=16)

    img.save(os.path.join(ASSETS, "architecture_diagram.png"))


# ── 4. Contract & customer lifecycle pipeline (slide 6) ─────────────────────
def contract_lifecycle():
    W, H = 2400, 1250
    img, d = new_canvas(W, H, None)
    f_h = FB(30)
    f_b = F(20)
    f_sub = FB(18)

    stages = [
        ("Contract\nConfirmation", ["confirmation_log", "rate, term, broker\ncommission captured"], CYAN),
        ("Enrollment Engine\n& MasterRoll", ["Plan codes \u2192 XLSX", "New / Renewal / Assignment\nB&E / Addition / Multi-Start"], BLUE),
        ("Activation", ["contract_renewal", "Active-contract guard\nblocks duplicate ERCOT switch"], AMBER),
        ("Billing", ["EDI 867 / 810 \u2192", "charges \u2192 tax \u2192 invoice"], GREEN),
        ("Collections", ["Past-due tracking", "delinquency tiers"], (200, 120, 220)),
    ]
    n = len(stages)
    margin = 90
    gap = 40
    box_w = (W - 2 * margin - gap * (n - 1)) / n
    box_h = 420
    y = 130

    for i, (title, lines, accent) in enumerate(stages):
        x = margin + i * (box_w + gap)
        rrect(d, [x, y, x + box_w, y + box_h], 20, fill=(*PANEL, 255), outline=(*accent, 255), width=3)
        d.rectangle([x, y, x + box_w, y + 8], fill=accent)
        ty = y + 50
        for ln in title.split("\n"):
            text_centered(d, (x + box_w / 2, ty), ln, f_h, WHITE)
            ty += 36
        ty += 14
        for block in lines:
            for ln in block.split("\n"):
                text_centered(d, (x + box_w / 2, ty), ln, f_b, MUTED)
                ty += 28
            ty += 10
        if i < n - 1:
            arrow(d, (x + box_w + 4, y + box_h / 2), (x + box_w + gap - 4, y + box_h / 2), CYAN, width=5, head=16)

    # ERCOT 814 branch under Enrollment
    ex, ey = margin + 1 * (box_w + gap), y + box_h + 40
    rrect(d, [ex, ey, ex + box_w, ey + 90], 16, outline=AMBER, width=2)
    text_centered(d, (ex + box_w / 2, ey + 45), "ERCOT 814 switch\n(New / Addition / MVI)", f_sub, AMBER)
    arrow(d, (ex + box_w / 2, y + box_h), (ex + box_w / 2, ey), AMBER, width=3, head=12)

    text_centered(d, (W / 2, 60), "Every step writes to contract_renewal \u2014 a new row every time, never an update", FB(24), MUTED2)

    img.save(os.path.join(ASSETS, "contract_lifecycle.png"))


# ── 5. Forecast layer cake + monitoring (slide 9) ───────────────────────────
def forecast_layers():
    W, H = 2300, 1500
    img, d = new_canvas(W, H, None)
    f_h = FB(28)
    f_b = F(20)
    f_tag = FB(18)

    layers = [
        ("Layer 4 \u2014 7-Day ERCOT LFC Override", "ercot_lfc_history, refreshed hourly \u00b7 wired live into get_forecast_data()", "built"),
        ("Layer 3 \u2014 Seasonal Adjustment", "El Ni\u00f1o / La Ni\u00f1a via NOAA seasonal outlook", "roadmap"),
        ("Layer 2 \u2014 Growth Factors", "ERCOT-projected growth, 2025 base year \u2192 20-year horizon", "built"),
        ("Layer 1 \u2014 DNA Baseline", "12-yr typical-year shape from ercot_load_history (2015\u20132026)", "built"),
    ]
    x0, x1 = 140, W - 140
    y = 120
    lh = 190
    gap = 22

    for title, sub, status in layers:
        color = GREEN if status == "built" else MUTED2
        rrect(d, [x0, y, x1, y + lh], 18, fill=(*PANEL, 255), outline=(*color, 255), width=3)
        d.rectangle([x0, y, x0 + 10, y + lh], fill=color)
        text_centered(d, (x0 + 40 + f_h.getlength(title) / 2, y + 55), title, f_h, WHITE, anchor="mm")
        text_centered(d, (x0 + 40 + f_b.getlength(sub) / 2, y + 100), sub, f_b, MUTED, anchor="mm")
        status_chip(d, (x1 - 150, y + lh / 2), "", status, f_tag)
        y += lh + gap

    y += 20
    d.line([(x0, y), (x1, y)], fill=BORDER, width=2)
    y += 50
    text_centered(d, (W / 2, y), "Nightly Self-Healing Monitoring \u2014 forecast_checkpoints", FB(26), CYAN)
    y += 60

    checks = [
        "7-Day Mirror Test\n(\u2264 5% GREEN)",
        "Historical Backtest\n(blind 7-day test)",
        "Energy Balance Sanity\n(growth-rate bounds)",
        "Portfolio Ratio Check\n(vs. baseline share)",
    ]
    cw = (x1 - x0 - 3 * 30) / 4
    for i, c in enumerate(checks):
        cx = x0 + i * (cw + 30)
        rrect(d, [cx, y, cx + cw, y + 150], 16, fill=(*PANEL_LIGHT, 255), outline=(*GREEN, 255), width=2)
        ty = y + 55
        for ln in c.split("\n"):
            text_centered(d, (cx + cw / 2, ty), ln, F(19), WHITE)
            ty += 28
        d.ellipse([cx + cw / 2 - 8, y + 118, cx + cw / 2 + 8, y + 134], fill=GREEN)

    img.save(os.path.join(ASSETS, "forecast_layers.png"))


# ── 6. Risk composite diagram (slide 7) ─────────────────────────────────────
def risk_composite():
    W, H = 1500, 1500
    img, d = new_canvas(W, H, None)
    cx, cy, R, r_in = W / 2, H / 2 - 40, 470, 300

    comps = [
        ("Position", 40, CYAN),
        ("Price (MTM)", 25, BLUE),
        ("Customer", 20, AMBER),
        ("Weather", 15, (200, 120, 220)),
    ]
    start = -90
    for label, pct, color in comps:
        extent = 360 * pct / 100
        d.pieslice([cx - R, cy - R, cx + R, cy + R], start, start + extent, fill=color)
        mid = math.radians(start + extent / 2)
        lx = cx + (R + 70) * math.cos(mid)
        ly = cy + (R + 70) * math.sin(mid)
        text_centered(d, (lx, ly - 14), label, FB(26), WHITE)
        text_centered(d, (lx, ly + 20), f"{pct}%", F(22), MUTED)
        start += extent

    d.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], fill=BG)
    d.ellipse([cx - r_in, cy - r_in, cx + r_in, cy + r_in], outline=CYAN, width=3)
    text_centered(d, (cx, cy - 26), "Daily Composite", FB(30), WHITE)
    text_centered(d, (cx, cy + 16), "Risk Score", FB(30), WHITE)
    text_centered(d, (cx, cy + 58), "risk_scores table", F(20), MUTED2)

    text_centered(d, (W / 2, H - 60), "Weighted GREEN / YELLOW / RED grade, recalculated and persisted daily", F(22), MUTED)

    img.save(os.path.join(ASSETS, "risk_composite.png"))


# ── 7. AI agent diagram (slide 8) ───────────────────────────────────────────
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
    lifecycle_ring()
    architecture_diagram()
    contract_lifecycle()
    forecast_layers()
    risk_composite()
    ai_agent_diagram()
    print("Diagrams written to", ASSETS)


if __name__ == "__main__":
    main()
