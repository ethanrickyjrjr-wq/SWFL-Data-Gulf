import sys

import dlt

from .fetcher import fetch_all_sources


@dlt.resource(
    name="news_articles_swfl",
    write_disposition="merge",
    primary_key="article_url",
    # published_date is a TEXT column (ISO YYYY-MM-DD): dlt's insert-values
    # loader won't cast a string into a pre-created Postgres `date` column.
    columns={"published_date": {"data_type": "text"}},
    # Recurrence-prevention for the 2026-06-20 published_date date->text red
    # (build 01 ALTERed the live column once; build 22 stops the whole class).
    # freeze on data_type ONLY: the next type drift on ANY column fails loud with
    # full DataValidationError context instead of an opaque psycopg
    # DatatypeMismatch. tables/columns stay at the evolve default, so new
    # columns/tables are still tolerated (per-pipeline opt-in, RULE 3 C2).
    schema_contract={"data_type": "freeze"},
)
def news_articles(rows=None):
    # rows is materialized in run() so the novelty guard can inspect the batch
    # BEFORE the merge; the bare call path stays for ad-hoc/manual use.
    articles = fetch_all_sources() if rows is None else rows
    print(f"[news_swfl] fetched {len(articles)} SWFL-relevant articles")
    yield from articles


def build_pipeline():
    return dlt.pipeline(
        pipeline_name="news_swfl",
        destination="postgres",
        dataset_name="data_lake",
    )


def run(dry_run: bool = False):
    if dry_run:
        articles = fetch_all_sources()
        print(f"[news_swfl] DRY RUN — would insert {len(articles)} articles:")
        for a in articles[:5]:
            print(f"  {a['source_name']}: {a['headline'][:80]}")
        return

    from dlt.pipeline.exceptions import PipelineStepFailed

    from ingest.lib.guards import assert_content_fresh
    from ingest.lib.schema_contract import explain_contract_failure, log_schema_update

    from .novelty import NEWS_NOVELTY_MAX_AGE_DAYS, carry_first_seen

    # NOVELTY guard, not an age guard: news has no real content date (published_date is
    # today-coerced and re-bumped by delete-insert merge). carry_first_seen restores each
    # re-seen URL's stored first-seen date, so MAX(published_date) = the last time a NEW
    # article_url appeared. 7d gate: a week with zero new URLs across all sources is a
    # broken scrape, not a quiet news week. An empty batch (all sources failing, currently
    # a green no-op) raises immediately via newest=None.
    batch = carry_first_seen(fetch_all_sources())
    newest = max((r["published_date"] for r in batch if r.get("published_date")), default=None)
    assert_content_fresh(newest, NEWS_NOVELTY_MAX_AGE_DAYS, label="news_swfl")

    pipeline = build_pipeline()
    try:
        load_info = pipeline.run(news_articles(rows=batch))
    except PipelineStepFailed as exc:
        # Turn a freeze-mode contract violation into a classifier-routable,
        # plain-English line; re-raises the original failure either way.
        explain_contract_failure(exc, "news_swfl")
    print(load_info)
    # Surface every added/changed column on a SUCCESSFUL load (observability half).
    log_schema_update(load_info, "news_swfl")


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    run(dry_run=dry_run)
