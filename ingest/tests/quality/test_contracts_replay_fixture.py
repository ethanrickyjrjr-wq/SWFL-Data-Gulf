"""PHASE-1 ACCEPTANCE — the replay fixture (spec §9 a/b/c). Checked in and kept forever.

Rows are abridged from the LIVE 07/11/2026 lake (docs/audit/2026-07-11-pipeline-problems/
08b + 08h). Address keys, prices, beds and sqft are the real values; rows marked SYNTHETIC
are controls and make no claim about a real listing.

  (a) the contaminated batch is caught with the CORRECT counts
  (b) BOTH known false-positive traps pass clean
  (c) a synthetic over-threshold contamination share ABORTS loud
"""
import pytest

from ingest.quality.contracts import evaluate_batch

_CTX = {"source_name": "api_feed"}
_T = "data_lake.listing_state"


def _listing(address_key, property_type, list_price, beds, sqft, lot_acres, zip_code,
             state="active"):
    return {"address_key": address_key, "property_type": property_type,
            "list_price": list_price, "beds": beds, "sqft": sqft, "lot_acres": lot_acres,
            "zip_code": zip_code, "state": state, "sale_or_rent": "sale"}


# ── (a) THE CONTAMINATED BATCH — must FIRE ────────────────────────────────────
# The Marco Island 10 Tampa Pl cluster: 1bd, 728-855 sqft, $6,000-$9,000, one building.
# No Marco Island condo sells for $7,000. sqft is PRESENT -> in scope -> flagged.
MUST_FIRE = [
    _listing("10TAMPAPL303:34145", "condo", 9000, 1, 855, None, "34145"),
    _listing("10TAMPAPL1:34145",   "condo", 7000, 1, 855, None, "34145"),
    _listing("10TAMPAPL404:34145", "condo", 7000, 1, 728, None, "34145"),
    _listing("10TAMPAPL5:34145",   "condo", 7000, 1, 728, None, "34145"),
    _listing("10TAMPAPL203:34145", "condo", 6000, 1, 855, None, "34145"),
    # 526 Wabasso Ave S, Lehigh 33974: carried at $5,000; it is really a 1,563sf 2024-built
    # home asking $369,900 (johnrwood MLS 225053370). Its `sqft` field even holds the LOT area.
    _listing("526WABASSOAVES:33974", "single_family", 5000, 3, 10106, 0.23, "33974"),
]

# ── (b) TRAP 1 — real manufactured-home SALES. Must PASS. ─────────────────────
# Verified live 07/11/2026 as ACTIVE, FOR-SALE mobile homes. realtor.com types them
# "single family home", which is the exact mislabel our map inherits. All sqft-NULL.
MUST_PASS_MOBILE = [
    _listing("4438HITZINGAVE51:33903",  "single_family",  8900, 1, None, None, "33903"),
    _listing("4324MAILBOXAVE127:33903", "single_family",  9900, 2, None, None, "33903"),
    _listing("4281HITZINGAVE6:33903",   "single_family", 14900, 1, None, None, "33903"),
    _listing("567PEACECT2120:33917",    "single_family",  2000, 2, None, None, "33917"),
    _listing("648SUWANEEDR2190:33917",  "single_family",  3000, 3, None, None, "33917"),
]

# THE TWIN. Identical to 4324MAILBOXAVE127 on every attribute the contract can observe,
# $100 dearer, different token. The specced token-scope gave them OPPOSITE verdicts.
MUST_PASS_TWIN = _listing("19327CONGRESSIONALCT17G:33903", "other", 10000, 2, None, None, "33903")

# ── (b) TRAP 2 — the legit sub-$20k LAND lots. Must PASS (out of scope by type). ──
MUST_PASS_LAND = [
    _listing(f"LEHIGHLOT{i}:33972", "land", 700 + i * 40, None, None, 0.23, "33972")
    for i in range(20)
]

# ── (b) TRAP 3 — land-lease-park manufactured sales tagged `other`, WITH sqft. ────
# The type allowlist is what protects these — not the sqft clause. Both must hold.
MUST_PASS_OTHER = [
    _listing("9878TAMARRONCT50O:33903",   "other", 16500, 2, 1710, None, "33903"),
    _listing("19260INDIANWELLSCT31H:33903", "other", 15900, 2, 1250, None, "33903"),
    _listing("17881NTAMIAMITRLLOT7:33903",  "other", 14900, 2,  880, None, "33903"),
]

# SYNTHETIC control — an ordinary home sale. Makes no claim about a real listing.
MUST_PASS_LEGIT = [
    _listing(f"SYNTHETICHOME{i}:33901", "single_family", 354999, 3, 1800, 0.20, "33901")
    for i in range(60)
]


def _floor(stats):
    return next(c for c in stats["contracts"] if c["name"] == "listing_state_home_price_floor")


def test_the_contaminated_batch_is_flagged_with_the_right_count():
    rows = MUST_FIRE + MUST_PASS_MOBILE + [MUST_PASS_TWIN] + MUST_PASS_LAND \
        + MUST_PASS_OTHER + MUST_PASS_LEGIT
    clean, quarantined, stats = evaluate_batch(rows, _T, ctx=_CTX)
    c = _floor(stats)
    assert c["violations"] == len(MUST_FIRE) == 6
    assert c["in_scope"] == len(MUST_FIRE) + len(MUST_PASS_LEGIT) == 66
    assert c["status"] == "VIOLATIONS"
    # policy: report -> the floor drops NOTHING. This is correction #2, enforced.
    assert clean == rows and quarantined == []
    assert stats["abort"] is False   # 6 violations < violations_gte 25


def test_trap_1_the_verified_real_mobile_home_sales_pass_clean():
    """4438HITZINGAVE51 ($8,900) MUST PASS. A floor that drops it deletes the only
    manufactured-home rows we hold, in a region where land_manufactured_swfl is a knowingly
    PARKED pipeline."""
    _, _, stats = evaluate_batch(MUST_PASS_MOBILE, _T, ctx=_CTX)
    c = _floor(stats)
    assert (c["violations"], c["in_scope"], c["status"]) == (0, 0, "PASS")


def test_the_two_33903_TWINS_get_the_SAME_verdict():
    """THE REGRESSION TEST FOR THE WHOLE CLASS. Two rows, one ZIP, $100 apart, identical on
    every attribute the contract can observe; the only difference is a token that
    extract_api.py:117-122 proves is a request-side SWEEP ARTIFACT, not a vendor field. The
    specced scope quarantined one and protected the other. They must now agree."""
    twin_a = MUST_PASS_TWIN                                       # 'other',        $10,000
    twin_b = _listing("4324MAILBOXAVE127:33903", "single_family", 9900, 2, None, None, "33903")
    _, _, stats = evaluate_batch([twin_a, twin_b], _T, ctx=_CTX)
    assert _floor(stats)["violations"] == 0


def test_trap_2_the_legit_sub_20k_land_lots_pass_clean():
    _, quarantined, stats = evaluate_batch(MUST_PASS_LAND, _T, ctx=_CTX)
    assert _floor(stats)["violations"] == 0
    assert quarantined == []   # and the enum allowlist did not touch them either


def test_trap_3_the_other_bucket_manufactured_sales_pass_clean():
    _, _, stats = evaluate_batch(MUST_PASS_OTHER, _T, ctx=_CTX)
    assert _floor(stats)["violations"] == 0


def test_leepa_nominal_consideration_transfers_are_untouchable():
    """41,510 of 528,130 non-null last_sale_amount values are $1-9,999 quitclaim / family
    transfers. Protection is TABLE-SCOPING: no contract is authored on leepa_parcels."""
    rows = [{"folioid": f"F{i}", "last_sale_amount": 100} for i in range(50)]
    clean, quarantined, stats = evaluate_batch(rows, "data_lake.leepa_parcels")
    assert clean == rows and quarantined == [] and stats["contracts"] == []


def test_the_2996_residential_rows_land_in_clean_not_quarantined():
    rows = [_listing(f"RESID{i}:33901", "residential", 359900, None, None, None, "33901",
                     state="holding") for i in range(100)]
    clean, quarantined, _ = evaluate_batch(rows, _T, ctx=_CTX)
    assert len(clean) == 100 and quarantined == []


# ── (c) A SYNTHETIC OVER-THRESHOLD SHARE ABORTS LOUD ─────────────────────────


def test_a_bypassed_normalizer_batch_aborts_loud():
    """The ONE realistic way the enum fires: a writer skips PROPERTY_TYPE_MAP and lands the
    RAW SteadyAPI vocabulary. Those tokens are not invented — they are the live mix of the
    sibling table data_lake.rental_listings_swfl (condos 5,592 / townhomes 582 /
    duplex_triplex 193 / mobile 190 / apartment 885). 100% violating share -> abort."""
    raw = ["condos", "townhomes", "duplex_triplex", "mobile", "apartment"]
    rows = [_listing(f"BYPASS{i}:33901", raw[i % 5], 350000, 3, 1800, 0.2, "33901")
            for i in range(600)]
    clean, quarantined, stats = evaluate_batch(rows, _T, ctx=_CTX)
    assert stats["abort"] is True
    assert "listing_state_property_type_allowlist" in stats["abort_reason"]
    assert clean == [] and len(quarantined) == 600


def test_a_7_row_100pct_contaminated_batch_STILL_aborts():
    """The silent-total-loss hole: 7 rows is under violations_gte 500, so the SHARE branch
    cannot fire — every row would quarantine, zero would merge, and the run would exit GREEN.
    A 7-row batch really happened (07/07/2026). if_no_clean_rows closes it."""
    rows = [_listing(f"BYPASS{i}:33901", "condos", 350000, 3, 1800, 0.2, "33901")
            for i in range(7)]
    _, _, stats = evaluate_batch(rows, _T, ctx=_CTX)
    assert stats["abort"] is True
    assert "no clean rows" in stats["abort_reason"]


# ── THE ORACLE PROOF: naive reports GREEN where corrected FIRES ───────────────
# This does NOT test the SQL string (test_contract_registry.py does that). It tests the
# CHOICE OF ORACLE: given the same relabelled rows, the naive `property_type <> 'land'` oracle
# and the corrected `beds IS NOT NULL OR sqft IS NOT NULL` oracle disagree — and the naive one
# is the one that goes green while the $35k median ships.


def _median(xs):
    s = sorted(xs)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2


def _naive_oracle(rows):     # the SPECCED oracle: reads the DERIVED label
    return [r["list_price"] for r in rows
            if r["property_type"] != "land" and r["list_price"] >= 20000]


def _corrected_oracle(rows):  # keys on RAW VENDOR FIELDS only
    return [r["list_price"] for r in rows
            if (r["beds"] is not None or r["sqft"] is not None) and r["list_price"] >= 20000]


def _fires(shipped_median, oracle_prices):
    """The tripwire's own predicate: shipped < 0.5 * homes_only_median, min 25 homes."""
    if len(oracle_prices) < 25:
        return False
    return shipped_median < 0.5 * _median(oracle_prices)


@pytest.fixture
def relabelled_33972():
    """ZIP 33972 AFTER a PROPERTY_TYPE_MAP drift: 913 land parcels no longer carry the 'land'
    token (PROPERTY_TYPE_MAP.get(raw, "other") silently defaults them), so the view's
    `property_type <> 'land'` filter stops excluding them and the shipped median collapses to
    ~$36,700 against a true homes-only median of $359,000 — ratio 0.102.
    Land rows have NO beds and NO sqft; homes have both. Counts abridged 10:1."""
    land = [{"property_type": "single_family", "list_price": 29500, "beds": None, "sqft": None}
            for _ in range(91)]
    homes = [{"property_type": "single_family", "list_price": 359000, "beds": 3, "sqft": 1800}
             for _ in range(40)]
    return land + homes, 36700   # (rows, shipped_median_after_relabel)


def test_the_NAIVE_oracle_reports_GREEN_on_the_relabel(relabelled_33972):
    """This is the bug. The oracle inherits the SAME corrupted label the view used, so its
    'correct' median IS the contaminated one — ratio ~1.0 — and the ~10x $35k defect returns
    in full behind a green tripwire."""
    rows, shipped = relabelled_33972
    assert _fires(shipped, _naive_oracle(rows)) is False


def test_the_CORRECTED_oracle_FIRES_on_the_same_relabel(relabelled_33972):
    rows, shipped = relabelled_33972
    prices = _corrected_oracle(rows)
    assert len(prices) == 40                       # the label-less land rows are excluded
    assert _median(prices) == 359000
    assert shipped / _median(prices) == pytest.approx(0.102, abs=0.002)
    assert _fires(shipped, prices) is True


def test_the_corrected_oracle_is_quiet_on_a_healthy_zip(relabelled_33972):
    """It must not fire merely because the oracle changed. Post-hotfix, the view already
    excludes land, so shipped == homes-only == $359,000 -> ratio 1.0 -> silent."""
    rows, _ = relabelled_33972
    assert _fires(359000, _corrected_oracle(rows)) is False
