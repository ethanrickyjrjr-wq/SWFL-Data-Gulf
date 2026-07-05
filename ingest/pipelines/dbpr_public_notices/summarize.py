import anthropic

from ingest.lib.api_usage import log_api_usage


# Haiku 4.5 (cost mode 07/05/2026): a 2-3 sentence factual summary of a short
# notice PDF is squarely small-model work — Sonnet was ~4x the cost for parity here.
def summarize_notice(pdf_text: str, model: str = 'claude-sonnet-4-6') -> str:
    """Generate a 2-3 sentence plain-English summary of a DBPR notice.

    Returns the summary string. On API error, returns empty string (caller logs, row still upserts).
    """
    client = anthropic.Anthropic()
    prompt = (
        "Summarize this DBPR enforcement notice in 2-3 plain English sentences. "
        "Include: who is named, what practice is at issue, and the response deadline. "
        "Do not use legal jargon. Do not add commentary or opinion.\n\n"
        f"{pdf_text[:3000]}"
    )
    try:
        msg = client.messages.create(
            model=model,
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}],
        )
        log_api_usage(model=msg.model, call_type="ingest_dbpr_notices", usage=msg.usage)
        return msg.content[0].text.strip()
    except Exception as e:
        print(f"[summarize] Claude API error: {e}")
        return ''
