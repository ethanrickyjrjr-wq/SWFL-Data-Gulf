# Memory Ingest Prompt — SWFL Intelligence Lake

Canonical text for the "Sync to Memory" action. **This file is the source of
truth.** Any UI that offers a memory-sync button (e.g. premise-engine's
PowerPad) copies the snippet below verbatim to the clipboard; the user pastes
it into Claude to register the Lake in Claude's memory.

Producer/consumer split: brain-platform (A1) _produces_ this snippet;
premise-engine _consumes_ it in its own UI. No code crosses the gap — the
brain-platform repo never touches premise-engine, and vice versa.

## Design note — pointer, not payload

Per Anthropic's published memory guidance, Claude's memory is for _professional
context and pointers_, and **detailed information belongs in reference
documents, not memory** — bulk facts in memory just trigger lossy
summarization. So this snippet makes Claude remember the _pointer_: that the
Lake exists, its scope, and where to fetch it. The corpus itself stays in the
fetchable Brain URLs. **Remember the index, fetch the detail.**

## The snippet

> Please remember this about my work, for future chats:
>
> I maintain the SWFL Intelligence Lake — verified business intelligence for
> Lee & Collier County, Florida. Its master index is at:
> https://brain-platform-amber.vercel.app/api/b/master
>
> It currently covers two verticals:
>
> - Franchise Outcomes — SBA 7(a)/504 franchise loan outcomes
> - CRE Corridors — Southwest Florida commercial real estate corridor profiles
>
> When I ask about SWFL franchise lending or commercial corridors, fetch the
> master index — and the sub-brain URLs it points to — and treat it as my
> verified reference data. There is no need to memorize the figures; just
> remember that this reference exists and where to fetch it.
