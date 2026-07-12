"""Structural locks on ingest/quality/quality_registry.yaml's content_contracts.

These are ANTI-REGRESSION tests, not style checks. Each one pins a finding that a live
adversarial verification produced, and each one fails if someone "simplifies" the registry
back to the version that shipped a bug."""
import pytest

from ingest.quality.contracts import load_contracts, load_registry


def _by_name(table, name):
    for c in load_contracts(table):
        if c["name"] == name:
            return c
    raise AssertionError(f"contract {name!r} not found on {table}")


# ── THE TAUTOLOGY LOCK ─────────────────────────────────────────────────────────


def test_land_blend_tripwire_oracle_is_label_INDEPENDENT():
    """THE KILL SHOT this whole contract exists to survive.

    The specced oracle recomputed a 'correct' homes-only median with a WHERE clause that was a
    BYTE-FOR-BYTE COPY of the view's own (`property_type <> 'land'`). Live: 49 of 52 rows had
    ratio exactly 1.0000 — `median < 0.5 * median` is ARITHMETICALLY UNSATISFIABLE. It had zero
    power against data drift.

    And property_type is DERIVED, not vendor-supplied: extract_api.py:69-70 is
    `PROPERTY_TYPE_MAP.get(raw, "other")`, which silently defaults any unmapped value (a bug
    that ALREADY HAPPENED once — test_extract_api.py:64-65). Under that relabel the original
    ~10x $35k bug returns IN FULL while the tripwire reports GREEN.

    The oracle must key on beds/sqft — RAW VENDOR FIELDS — never on the derived label."""
    sql = _by_name("data_lake.listing_active_stats",
                   "listing_active_stats_land_blend_tripwire")["failing_rows_sql"]
    assert "beds IS NOT NULL OR sqft IS NOT NULL" in sql
    assert "property_type" not in sql, (
        "the oracle re-read property_type — it is now a differential test against a copy of "
        "its own implementation, and it CANNOT FIRE"
    )


def test_land_blend_tripwire_joins_on_county_AND_zip_not_using_zip():
    """`USING (zip_code)` fans out: 34110 / 34119 / 33971 exist under BOTH counties, so a
    6-listing Lee slice gets compared against a 473-row pool pooled across both counties — and
    the `homes_cnt >= 25` small-N guard is bypassed by the POOLED count. Live and firing-ready:
    flip the mix and it quarantines a legitimate ZIP."""
    sql = _by_name("data_lake.listing_active_stats",
                   "listing_active_stats_land_blend_tripwire")["failing_rows_sql"]
    assert "USING (zip_code)" not in sql
    assert "v.county = c.county" in sql and "v.zip_code = c.zip_code" in sql
    assert "homes_cnt >= 25" in sql


# ── PRICE-FLOOR SCOPE: the twin rows that decide it ────────────────────────────


def test_price_floor_scope_is_sqft_present_and_never_excludes_by_type_denylist():
    """`property_type NOT IN ('land','other')` assigns OPPOSITE verdicts to indistinguishable
    listings — `19327CONGRESSIONALCT17G:33903` ($10,000, 2bd, sqft NULL, `other`) is PROTECTED
    while its twin `4324MAILBOXAVE127:33903` ($9,900, 2bd, sqft NULL, `single_family`, $100
    cheaper) is DROPPED. That row is a VERIFIED real for-sale mobile home (MHVillage, Trulia).
    The scope must be an sqft-present + 4-type ALLOWLIST, which puts both twins on the same
    (passing) side and still catches the Marco Island cluster."""
    spec = _by_name("data_lake.listing_state", "listing_state_home_price_floor")
    conds = {(c["col"], c["op"]): c.get("value") for c in spec["where"]}
    assert ("sqft", "not_null") in conds
    assert conds[("property_type", "in")] == [
        "single_family", "condo", "townhouse", "multi_family"
    ]
    assert ("property_type", "not_in") not in conds
    assert spec["min"] == 20000


def test_price_floor_policy_is_report_never_quarantine():
    """A price floor is a SIGNAL, not a licence to drop rows. Real manufactured-home SALES run
    continuously $2,000 -> $59,900+ (verified externally at $2,000 / $3,000 / $9,900), and real
    Arbor Trace annual-rate RENTALS reach $49,000 while a real sale in the SAME building starts
    at $54,900. No scalar floor separates the population at any threshold."""
    assert _by_name("data_lake.listing_state",
                    "listing_state_home_price_floor")["policy"] == "report"


# ── ENUM: the allowlist is a UNION OF CODOMAINS, not a live table mix ──────────


def test_property_type_allowlist_keeps_residential_and_manufactured():
    """2,996 live rows carry `residential` (extract.py:140's Source-B vocabulary, flipped into
    source_name='api_feed' by catchup.py:92). They are LEGITIMATE HOMES — median $359,900 Lee /
    $770,000 Collier. Authoring the allowlist from the 6-value ACTIVE mix (or from the
    homes-only migration's comment) quarantines all 2,996, and at the batch locus that is
    10.18% of Collier's 07/01 cutover batch — a HARD ABORT of an 8,833-row load.

    `manufactured` is in PROPERTY_TYPE_MAP (constants_api.py:60) with 0 live rows. Allowed so
    that widening STEADYAPI_TYPE_FILTERS cannot red the nightly chain before the registry
    catches up."""
    allowed = _by_name("data_lake.listing_state",
                       "listing_state_property_type_allowlist")["allowed"]
    assert set(allowed) == {"single_family", "condo", "townhouse", "multi_family",
                            "land", "other", "manufactured", "residential"}


def test_no_enum_contract_is_authored_on_sale_or_rent():
    """VACUOUSLY GREEN. Both writers HARDCODE it: extract_api.py:139 `"sale_or_rent": "sale"`
    and extract.py:144. 34,935 of 34,935 rows. It is structurally blind to the contamination —
    those rows are LABELLED 'sale' and PRICED as rent. Authoring it credits the enum family
    with coverage it does not have, and the range contract gets dropped in its favor."""
    cols = {c.get("col") for c in load_contracts("data_lake.listing_state")}
    assert "sale_or_rent" not in cols


# ── THE FALSE-POSITIVE TRAP THAT IS ENFORCED BY ABSENCE ────────────────────────


def test_leepa_parcels_carries_no_price_contract_ever():
    """41,510 of 528,130 non-null `last_sale_amount` values sit in $1-9,999 — legitimate
    quitclaim / family / non-arm's-length transfers recorded at nominal consideration. That IS
    the correct value for that column. A `>= 20000` floor here quarantines 71,388 real deeds.
    Protection is TABLE-SCOPING: no price contract exists, and this test is what keeps it so."""
    for c in load_contracts("data_lake.leepa_parcels"):
        assert c.get("col") != "last_sale_amount"
        assert "last_sale_amount" not in (c.get("failing_rows_sql") or "")


# ── SOLD/RENT BAND: green on day one, and not satisfiable by having no data ────


def test_sold_rent_band_seeds_the_two_known_accepted_zips():
    """NOT GREEN ON DAY ONE without this. It fires on 2 real rows: 33972 (sold $30,000 / rent
    $1,950, ratio 1.28) and 33920 Alva (84.3% land, ratio 1.90). Both are TRUE positives of
    upstream realtor.com land-drag that we cannot fix. If doctor equates nonzero rows with
    failure, the contract is RED from commit #1."""
    spec = _by_name("data_lake.market_details_swfl", "market_details_sold_rent_band")
    excl = [c for c in spec["where"] if c["col"] == "zip_code" and c["op"] == "not_in"]
    assert excl and set(excl[0]["value"]) == {"33972", "33920"}
    assert (spec["min"], spec["max"]) == (4.0, 40.0)


def test_the_two_accepted_zips_stay_visible_via_a_warn_twin():
    """Excluded from the ERROR contract, never hidden: the watch twin carries no exclusion and
    reports 2 today at severity `warn` (summary-only, opens no checks row). If it ever reports
    3, the error twin has already fired on the new one."""
    watch = _by_name("data_lake.market_details_swfl", "market_details_sold_rent_band_watch")
    assert watch["severity"] == "warn"
    assert "33972" not in watch["failing_rows_sql"]


def test_the_band_has_a_coverage_floor_or_it_is_satisfiable_by_no_data():
    """The band's WHERE filters `median_rent_price IS NOT NULL`, so a rent-column OUTAGE makes
    rows VANISH — it does not trip the band. If rent coverage collapsed from 49 ZIPs to 3, the
    band returns 0 rows and reports GREEN. 5 ZIPs already carry NULL rent."""
    sql = _by_name("data_lake.market_details_swfl",
                   "market_details_rent_coverage_floor")["failing_rows_sql"]
    assert "< 45" in sql and "median_rent_price IS NOT NULL" in sql


# ── shape invariants every contract must hold ─────────────────────────────────


@pytest.mark.parametrize("table", [
    "data_lake.listing_state",
    "data_lake.listing_active_stats",
    "data_lake.market_details_swfl",
])
def test_every_contract_declares_a_valid_type_locus_policy_and_severity(table):
    for c in load_contracts(table):
        assert c["type"] in ("range", "enum", "sql_expectation"), c["name"]
        assert c["locus"] in ("merge", "probe", "both"), c["name"]
        assert c["policy"] in ("report", "quarantine"), c["name"]
        assert c["severity"] in ("error", "warn"), c["name"]
        # A sql_expectation is cross-row — it can NEVER run at the merge locus.
        if c["type"] == "sql_expectation":
            assert c["locus"] == "probe", c["name"]


def test_listing_active_stats_is_probe_only_it_is_a_VIEW_with_no_pipeline():
    """CREATE OR REPLACE VIEW ... (docs/sql/20260711_listing_active_stats_homes_only.sql:34).
    grep of ingest/ returns exactly one hit and it is a consumer COMMENT. There is no batch, no
    merge call, no Locus A. Locus B is the only gate a view has."""
    for c in load_contracts("data_lake.listing_active_stats"):
        assert c["locus"] == "probe"


def test_the_existing_value_tests_are_untouched():
    """content_contracts is ADDITIVE. The four seeded value_tests tables keep working."""
    tables = load_registry()["tables"]
    assert tables["data_lake.news_articles_swfl"]["value_tests"]
    assert tables["data_lake.leepa_parcels"]["value_tests"]
    assert tables["data_lake.zhvi_swfl"]["schema_baseline"] is True
