# Email length + per-TYPE benchmark numbers — crawl4ai pass

Date: 08/03/2026. Method: crawl4ai (RULE 0.4), four sources fetched live this session. Written
because the operator rejected his own ~200-word figure that had just been written into
`docs/standards/emails.md` §0.1 — verbatim: *"don't use my numbers. if it says 95 word is best, use
that / crawl4ai the numbers for the types of emails and update the file."*

**Outcome: neither 200 nor 95 is the right number.** The strongest primary source measures a
**50–125 word band**, and the 95-word datapoint already in our 08/03 research sits inside it.

Companion file: `2026-08-03-strongest-real-estate-email-concepts-structure.md` (template anatomy,
subject-line taxonomy, market-report structure, Outlook/dark-mode/102KB render constraints). This
file covers only what that one lacked: measured LENGTH and per-CAMPAIGN-TYPE engagement numbers.

---

## 1. Length, subject, and reply mechanics — Boomerang (primary, their own corpus)

Source: blog.boomerangapp.com/2016/02/7-tips-for-getting-more-responses-to-your-emails-with-data
[crawl4ai — fetched live, quotes verbatim from the page]

This is the strongest length evidence found: Boomerang measured **response rate**, not open rate, on
their own users' real sent mail. Response rate is immune to the Apple MPP inflation that makes every
open-rate benchmark below untrustworthy — that is why this source outranks the ESP reports.

- **"The sweet spot for email length is between 50-125 words," all of which yielded response rates
  above 50%.** Verbatim.
- Decline above the band is GENTLE: ~50% at 125 words → ~44% at 500 words, then flat to ~2000 words,
  then falls off a cliff (below 35% past 2500 words). *"So while the optimal length for an email is
  under 125 words, you shouldn't worry too much if you need a few extra."*
- **Decline BELOW the band is steeper than above it.** A 25-word email performs about as badly as a
  2000-word one (~44%). Under-writing is a real failure mode, not a safe default. A body-less
  message (subject only) got a response just **11%** of the time.
- Their own eyeball rule: *"A 50-word email looks like two short paragraphs. A 125-word email is
  roughly two normal paragraphs plus a short one."*
- **Subject lines of 3–4 words got the most responses** (excluding Re:/Fwd:). No subject line at
  all → only 14% response.
- **Emails asking 1–3 questions are 50% more likely to get a response** than emails asking none.
- **Reading level: 3rd grade is optimal** — a 36% lift over college-level writing and 17% over
  high-school level.
- **Sentiment: do not be neutral.** Slightly-to-moderately positive OR slightly-to-moderately
  negative both drew 10–15% more responses than fully neutral email.

Caveat to carry: 2016 post, general business email, not real-estate marketing broadcast. The
length/question/reading-level findings are mechanics of human reply behavior and travel well; do
not present them as real-estate campaign benchmarks.

---

## 2. Per-TYPE engagement — GetResponse Email Marketing Benchmarks, 2024 edition

Source: getresponse.com/resources/reports/email-marketing-benchmarks [crawl4ai]. Methodology
verbatim from the page: **"We analyzed more than 4.4 billion messages sent by GetResponse customers
in 2023."** Largest sample of anything in this pass.

**By campaign type — the number the operator asked for:**
- **Newsletter:** 40.08% open · 3.84% CTR
- **Triggered / automated:** 45.38% open · 5.02% CTR
- **Welcome email:** 83.63% open

Triggered beats broadcast on both axes; welcome is in a different league entirely. The product
implication is direct: a lifecycle-triggered send (just listed / price cut / just sold, fired by an
event) should outperform a scheduled newsletter of the same content, and the single highest-value
email we can ship is the first one after a signup.

**Newsletter frequency (open / CTR / CTOR / unsub, by sends per week):**
- **1 per week — 48.31% · 5.71% · 11.82% · 0.25%** ← best on every engagement axis
- 2 per week — 43.2% · 4.73% · 10.95% · 0.18%
- 3 per week — 41.34% · 3.73% · 9.03% · 0.16%
- 4 per week — 41.92% · 2.99% · 7.13% · 0.15%
- 46.77% of marketers send exactly 1/week; 19.54% send 2.

Engagement falls fastest between 1 and 3 sends per week; unsubscribe rate actually DROPS as
frequency rises (self-selection — only tolerant subscribers remain). **Read CTR, not unsub, when
setting cadence.** GetResponse's own prose summary of this table is internally garbled (it writes
"open rates reaching 4.3%" where the table says 43.2%) — cite the TABLE, never their summary line.

**Autoresponder cycle length (CTR / CTOR, by number of messages in the cycle):**
- **1 message — 29.39% · 28.52%** · 43.5% of cycles
- 2 messages — 26.69% · 25.80%
- **3 messages — 12.98% · 18.12%** ← the cliff
- 4 messages — 9.79% · 17.46%
- 19+ — 3.95% · 8.39%

Engagement roughly halves between the 2nd and 3rd message. Note: the open-rate column in this table
exceeds 100% (103.04% at one message), which means it counts repeat opens, not unique openers —
**do not quote that column**; CTR and CTOR are the usable ones.

**Real Estate industry row (2023 data):** 42.71% open · 3.51% CTR · 8.23% CTOR · 0.17% unsub ·
0.01% complaint · **4.86% bounce**.

Two things worth acting on in that row. The **bounce rate is among the highest of any industry**
(vs. 2.33% all-industry average) — real-estate lists decay fast and list hygiene is a real cost
center, not a hygiene footnote. And the **CTOR of 8.23% is well below the all-industry pattern**
while the open rate is above it: real-estate email gets opened and then fails to earn the click.
That is a CONTENT problem, and it is exactly the gap a sourced, locally-grounded email is supposed
to close.

**Two adjacent real-estate rows, same report:** landing-page conversion (subscription rate) **2.86%**
— near the bottom of all industries; double opt-in usage **3.46%** (96.54% single opt-in) — the
LOWEST double-opt-in adoption of any industry measured. Both are consistent with the high bounce
rate: the industry collects addresses carelessly.

---

## 3. Real Estate industry row — Campaign Monitor Benchmarks, 2022 report

Source: campaignmonitor.com/resources/guides/email-marketing-benchmarks [crawl4ai]

- **Real Estate, Design, Construction:** 21.7% open · 3.6% CTR · **17.2% CTOR** · 0.2% unsub.
  Campaign Monitor calls out that this category holds the **highest click-to-open rate of any
  industry** in their panel.
- Best day for opens: Monday (22.0%). Best day for CTR: Tuesday (2.4%). Worst for opens: Sunday
  (20.3%). The spread across days is small — roughly 1.7 points of open rate — so send-day is a
  weak lever, not a strong one.
- They flag Apple MPP as artificially inflating open rate and show the month-by-month step change
  when iOS 15 shipped.

---

## 4. THE CONFLICT — and the rule it forces

Same industry, two reputable ESPs, **wildly incompatible numbers**:

- Open rate: GetResponse **42.71%** vs Campaign Monitor **21.7%** — a 2× disagreement.
- CTOR: GetResponse **8.23%** vs Campaign Monitor **17.2%** — a 2× disagreement the OTHER direction.

These cannot both describe the same reality. Different customer panels, different years (2023 vs
2021 data), different open-rate handling post-MPP, and different industry bucketing (Campaign
Monitor lumps Real Estate with Design and Construction; GetResponse does not).

**Standing rule this forces: never promise a client an absolute open or click rate, and never set an
internal target from one.** Use these numbers only for RELATIVE comparison inside a single source —
triggered beats newsletter, 1/week beats 3/week, short cycles beat long ones — because those
comparisons hold within one panel even when the absolute levels don't survive contact with another.
This is the same discipline as our own no-invention gate applied to borrowed benchmarks.

Mailchimp's benchmark page was fetched (54KB) but its industry table did not contain a Real Estate
row in the crawled output — not used.

---

## 5. What changed in the repo because of this

`docs/standards/emails.md` §0.1 rewritten off this file:
- The ~200-word operator figure is REMOVED at the operator's own instruction.
- Body target is now the **50–125 word band** (Boomerang), with the "under 50 words is as bad as
  2000" floor stated, since that failure mode is invisible to anyone optimizing for brevity.
- Added: 1–3 questions, 3rd-grade reading level, non-neutral sentiment, the per-type table, the
  1/week cadence finding, the 3-message autoresponder cliff, and the never-promise-a-rate rule.
- Subject-line guidance now distinguishes the two JOBS it was silently conflating: **3–4 words when
  the email wants a REPLY** (Boomerang, measured on response rate) vs **30–40 characters for a
  marketing broadcast** (the earlier three-source finding, measured on opens). Those are different
  emails with different success metrics; the old card gave one rule for both.

---

## Sources (all crawl4ai, this session, 08/03/2026)

1. blog.boomerangapp.com/2016/02/7-tips-for-getting-more-responses-to-your-emails-with-data
2. getresponse.com/resources/reports/email-marketing-benchmarks — 2024 edition, 4.4B messages, 2023
3. campaignmonitor.com/resources/guides/email-marketing-benchmarks — 2022 report
4. mailchimp.com/resources/email-marketing-benchmarks — fetched, no Real Estate row, unused
