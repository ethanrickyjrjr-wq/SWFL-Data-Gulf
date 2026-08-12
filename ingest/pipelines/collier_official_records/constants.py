"""Constants for the collier_official_records pipeline.

Unlike lee_deed_official_records (FETCH manual, Akamai-blocked), Collier's
`cor.collierclerk.com` is a Blazor app with NO Akamai/Cloudflare/CAPTCHA wall on
any tested step (verified live 08/12/2026 — homepage, Document Search form, and a
real submitted search all rendered clean; 7 back-to-back automated searches drew
zero block/rate-limit signal). FETCH is therefore fully automatable here, unlike
Lee, and this pipeline pulls ALL 37 document types from day one — not a DEED-only
slice like Lee's initial build was (see
_RESEARCH/data-and-ingest/2026-08-12-collier-clerk-liveness-probe.md for the full
probe writeup this is built from).
"""
from __future__ import annotations

TABLE_NAME = "collier_official_records"

# Collier's own Instrument number is a stable, unique-per-document sequential id
# (confirmed distinct across every sampled row) — the merge/dedup key. No
# cross-year rollover behavior observed/assumed; if one is later found, this is
# the single place to add a composite key.
PRIMARY_KEY = "instrument_number"

SOURCE_TAG = "collier_clerk_cor_access_automated"

SEARCH_HOME_URL = "https://cor.collierclerk.com/"
# Human-facing citation homepage — there is no public vendor API doc.
SOURCE_URL = "https://cor.collierclerk.com/search/document"

# Full 37-code doc-type list, read directly off the live Document Search
# multiselect popup 08/12/2026 (Collier's own UI spells these out — no external
# decoding needed, unlike Lee where doc types are undecoded short codes). Keys are
# exactly the codes that appear in the "Doc Type" result column.
DOC_TYPE_LABELS: dict[str, str] = {
    "AD": "Agreement for Deed",
    "AFFID": "Affidavit",
    "AGRM": "Agreement",
    "ASSIGN": "Assignment",
    "BOND": "Bonds (Various Types)",
    "CCJUDG": "Certified Copy of Previously Recorded Judgment",
    "CERT": "Certificate",
    "CONTEST": "Contest of Lien",
    "CP": "Court Paper",
    "DC": "Death Certificate",
    "DECL": "Declaration of Condominium",
    "DEED": "Deed",
    "DISCH": "Military Discharge",
    "ERRCOR": "Error Correction",
    "ESMT": "Easement",
    "FIN/UCC": "Financing Statement/UCC",
    "GOVREL": "Government Related",
    "INJMN": "Injunction for Minor",
    "JUDG": "Judgment",
    "LIEN": "Lien (Various)",
    "LP": "Lis Pendens",
    "MARLIC": "Marriage License",
    "MODIFY": "Modification",
    "MTGE": "Mortgage",
    "NC": "Notice of Commencement",
    "NOTICE": "Notice",
    "ORDER": "Order",
    "PA": "Power of Attorney",
    "PLAT/EXH": "Plat/Exhibit",
    "PLTREL": "Plat Related",
    "PR": "Partial Release",
    "PROBATE": "Probate",
    "RELEASE": "Release",
    "RESTR": "Restrictions",
    "SATIS": "Satisfaction",
    "TERM": "Termination of Anything",
    "TRANSFR": "Transfer of Anything",
}

# A doc is "arm's-length" (a real sale, not family/quitclaim/trust) above this
# consideration floor — mirrors Lee's NOMINAL_CONSIDERATION_CEIL convention, but
# Collier's result grid does not expose a consideration column at all (unlike
# Lee's Consideration export column) — so this constant is a placeholder for a
# future consideration-bearing extension, NOT used by normalize.py today. Do not
# wire this until a consideration source is actually confirmed on Collier's side.
NOMINAL_CONSIDERATION_CEIL = 100
