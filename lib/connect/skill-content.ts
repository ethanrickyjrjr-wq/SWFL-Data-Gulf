// lib/connect/skill-content.ts
// The hosted intake skill — served by /api/connect/skill from THIS deploy so
// it can never drift from the endpoints it documents (spec 2026-08-03 §2,
// failure mode 11). Format: agentskills.io SKILL.md contract (live-verified
// 08/02/2026 — name ≤64 lowercase/digits/hyphens, description ≤1024).
export const SKILL_MD = `---
name: swfl-data-connect
description: Import a user's own data (contacts, listings, stated figures) into SWFL Data Gulf through its typed import endpoints, with a verify-first-record check. Use when a SWFL Data Gulf user asks to connect, upload, or import their contacts, listings, or figures.
---

# Connect your data to SWFL Data Gulf

CRITICAL — DO NOT SEND ANY DATA YET. This is a guided conversation, not a batch job.

## Before anything, ASK the user:

1. What is the data? (contacts / property listings / individual figures — anything else stops here: tell the user SWFL Data Gulf parks unrecognized files visibly in the web app instead.)
2. Where does it come from? (which tool exported it — so column names can be mapped)
3. Do they have their API token? (minted at POST /api/tokens while signed in — shown once)

## Contacts

POST https://www.swfldatagulf.com/api/contacts/import
- Auth: Authorization: Bearer <token>
- Body: multipart/form-data, field "file" = CSV (header row required; "email" column required; "name", "tags" recognized; every other column is kept as an attribute)
- Caps: 5 MB, 5000 rows

## Listings

POST https://www.swfldatagulf.com/api/listings/import
- Auth: Authorization: Bearer <token>
- Body: multipart/form-data, field "file" = CSV (header row required; "address" column required — aliases: street address, full address, property address; recognized: price, beds, baths, sqft, status, url; every other column kept as an attribute)
- Caps: 5 MB, 5000 rows

## VERIFY — do not tell the user it worked until this passes

The import response carries an "echo" array: rows read back from the database AFTER the write, plus counts (added / skipped with reasons / matched_to_county for listings). Show the user the echo rows and the counts VERBATIM. If echo is empty or counts don't match expectations, the import did NOT fully land — say so plainly and show skip_reasons.

## Rules

- Never invent or repair a value while mapping columns — a cell you can't map stays unmapped (it lands as an attribute).
- Never send data the user didn't hand you in this conversation.
- Report partial success honestly: "X of Y rows landed, Z skipped because …" — that is the normal outcome, not an error.
`;
