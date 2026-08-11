# Merge-tag / personalization-slot fallback behavior — vendor docs, fetched live 08/09/2026

Method: crawl4ai (RULE 0.4), three vendor docs fetched live this session for the sentence-bank
brainstorm (typed fill-in slots in email prose). Raw dumps local-only in the session scratchpad;
the load-bearing quotes are verbatim below.

## Question

When a fill-in slot (merge tag / personalization token) has no value at send time, what do the
major senders do? This calibrates our own unfilled-slot rule.

## Findings (verbatim, per vendor)

**Mailchimp** — https://mailchimp.com/help/getting-started-with-merge-tags/
> "If you don't set a default value and the subscribed contact doesn't have the data in their
> profile, they'll see a blank space where the contact-specific content was supposed to appear."
Mechanism: per-audience "default merge values" (e.g. FNAME → "Friend"). No default → literal blank
ships.

**HubSpot** — https://knowledge.hubspot.com/website-pages/personalize-your-content
> "If you don't set a default value for a personalization token, the token will be left blank for
> contacts who don't have a value for that property."
Mechanism: per-token fallback value + global default values per property.

**Klaviyo** — https://help.klaviyo.com/hc/en-us/articles/115005084927
> "The `default` filter sets a default value to appear if a message recipient doesn't have that
> property set." (e.g. `{{ first_name|default:"friend" }}`)
Mechanism: Django-style `|default:` filter per tag. Behavior WITHOUT the filter was not explicitly
stated in the fetched page — do not claim Klaviyo ships a blank without re-checking.

## What this means for us

All three converge on per-token fallback values as the only guard, and (documented for Mailchimp +
HubSpot) an unfilled token with no fallback ships a literal blank into the send. Our design is
strictly stronger: an unfilled slot renders as a labeled OPEN SLOT on canvas (builder types it),
and at send time the whole sentence is dropped — a gap never ships. Essential slots (e.g. open
house time) block the send by name instead of dropping.

Consumed by: `docs/superpowers/specs/2026-08-09-sentence-banks-design.md` (sentence-bank build).
