"""address_key — the property identity.

A relisting gets a NEW listing id; keying on the id reads a relist as two unrelated events. We key on
the normalized street address + ZIP so a relist reads as two events on ONE property (spec finding #3).
The unit is part of the key (a condo's #301 and #414 are different properties). `sale_or_rent` is NOT
here — it's a separate column in the table key, because one address can be live for sale AND rent.

Open risk (measure on the first real scan): if the string-normalized collision/miss rate is high,
add a geocode-backed fallback. Start simple; the first pull tells us if it's enough."""
from __future__ import annotations

import re

# Street-suffix canonicalization so "Ave" / "Avenue" / "Ave." collapse to one key.
_SUFFIX = {
    "AVENUE": "AVE", "STREET": "ST", "BOULEVARD": "BLVD", "DRIVE": "DR", "ROAD": "RD",
    "LANE": "LN", "COURT": "CT", "PLACE": "PL", "TERRACE": "TER", "CIRCLE": "CIR",
    "PARKWAY": "PKWY", "HIGHWAY": "HWY", "TRAIL": "TRL",
}
_UNIT = re.compile(r"\b(?:UNIT|APT|APARTMENT|STE|SUITE|#)\s*([A-Z0-9-]+)", re.I)


def address_key(street: str, zip_code: str) -> str:
    """Deterministic, collision-resistant-within-a-ZIP, stable-across-relists property key."""
    s = (street or "").upper()
    unit = ""
    m = _UNIT.search(s)
    if m:
        unit = "UNIT" + re.sub(r"[^A-Z0-9]", "", m.group(1))
        s = _UNIT.sub("", s)
    s = re.sub(r"[^A-Z0-9 ]", " ", s)               # drop punctuation
    toks = [_SUFFIX.get(t, t) for t in s.split()]   # canonicalize street suffixes
    core = "".join(toks)
    z = re.sub(r"[^0-9]", "", zip_code or "")[:5]    # 5-digit ZIP only (ZIP gate G1)
    return f"{core}{unit}:{z}"
