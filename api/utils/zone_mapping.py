"""
utils/zone_mapping.py
──────────────────────
Single source of truth for weather zone → load zone mapping.
Loads from DB at startup. All scripts import from here.

Usage:
    from utils.zone_mapping import get_zone_mapping, weather_to_load

    # Get full mapping dict
    mapping = await get_zone_mapping(db)

    # Direct lookup
    load_zone = weather_to_load("NORTH_CENTRAL")  # → "NORTH"
    load_zone = weather_to_load("FAR_WEST")        # → "WEST"
    load_zone = weather_to_load("COAST")           # → "HOUSTON"
"""

from functools import lru_cache

# ── Static fallback (used when DB is not available e.g. in scripts) ───────────
_STATIC_MAPPING: dict[str, str] = {
    "COAST":         "HOUSTON",
    "EAST":          "NORTH",
    "FAR_WEST":      "WEST",
    "NORTH":         "NORTH",
    "NORTH_CENTRAL": "NORTH",
    "SOUTH_CENTRAL": "SOUTH",
    "SOUTHERN":      "SOUTH",
    "WEST":          "WEST",
}

# Also handle saverecorder-style names (e.g. from load_profile strings)
_ALIAS_MAPPING: dict[str, str] = {
    "HOUSTON": "HOUSTON",  # already a load zone name
    "NCENT":   "NORTH",    # short form used in load_profiles
    "SCENT":   "SOUTH",
    "FWEST":   "WEST",
    "SOUTH":   "SOUTH",
    "NORTH":   "NORTH",
    "WEST":    "WEST",
    "EAST":    "NORTH",
}


def weather_to_load(weather_zone: str) -> str | None:
    """
    Convert weather zone to load zone.
    Handles both full names (NORTH_CENTRAL) and short aliases (NCENT).
    Returns None if unknown.
    """
    if not weather_zone:
        return None
    z = weather_zone.strip().upper()
    return _STATIC_MAPPING.get(z) or _ALIAS_MAPPING.get(z)


def get_all_weather_zones() -> list[str]:
    """Return all 8 weather zones."""
    return list(_STATIC_MAPPING.keys())


def get_weather_zones_for_load(load_zone: str) -> list[str]:
    """
    Return all weather zones that map to a given load zone.
    e.g. get_weather_zones_for_load("NORTH") → ["EAST", "NORTH", "NORTH_CENTRAL"]
    """
    load_zone = load_zone.strip().upper()
    return [wz for wz, lz in _STATIC_MAPPING.items() if lz == load_zone]


def get_load_zones() -> list[str]:
    """Return the 4 settlement load zones."""
    return ["HOUSTON", "NORTH", "SOUTH", "WEST"]


async def get_zone_mapping_from_db(db) -> dict[str, str]:
    """
    Load mapping from DB (weather_to_load_zone table).
    Falls back to static mapping if table unavailable.
    """
    try:
        from sqlalchemy import text
        result = await db.execute(text(
            "SELECT weather_zone, load_zone FROM weather_to_load_zone"
        ))
        rows = result.fetchall()
        if rows:
            return {r[0]: r[1] for r in rows}
    except Exception:
        pass
    return _STATIC_MAPPING.copy()


# ── For use in aiomysql scripts (not SQLAlchemy) ──────────────────────────────

async def get_zone_mapping_aiomysql(conn) -> dict[str, str]:
    """Load mapping from DB using aiomysql connection."""
    try:
        async with conn.cursor() as cur:
            await cur.execute(
                "SELECT weather_zone, load_zone FROM weather_to_load_zone"
            )
            rows = await cur.fetchall()
            if rows:
                return {r[0]: r[1] for r in rows}
    except Exception:
        pass
    return _STATIC_MAPPING.copy()


# ── Column name helpers (for ercot_load_history queries) ──────────────────────

# Maps DB column name → weather zone label
DB_COL_TO_ZONE = {
    "coast":         "COAST",
    "east":          "EAST",
    "far_west":      "FAR_WEST",
    "north":         "NORTH",
    "north_central": "NORTH_CENTRAL",
    "south_central": "SOUTH_CENTRAL",
    "southern":      "SOUTHERN",
    "west":          "WEST",
}

ZONE_TO_DB_COL = {v: k for k, v in DB_COL_TO_ZONE.items()}
