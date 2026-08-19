# OmniVoice / VoiceStudio — DRIVE TEST, measured output (08/19/2026)

Companion to `2026-08-19-omnivoice-tts-engine-teardown.md` (that one is the engine's quality
levers; this one is what actually came out when it was driven on real SWFL copy).

**Decree being executed** (operator, 08/18/2026, session 9cb8d396): "Bring it in and we will offer
dubbing for other languages after we test it out. We can also write emails or posts in other
languages **if it is correct**."

**Verdict: the audio is good. The translation is not correct, so the second half of the decree
does not hold on the free local lane.**

---

## What was driven

Real copy, not composed for the test:
- **Email** — the Just Sold body, verbatim from the rendered `~/Downloads/just-sold-email.html`
  (baked 08/18/2026). 368 chars.
- **Social** — a caption in the exact shape `buildCaption()` emits (`lib/social/build-content.ts:83`):
  conclusion + `key_metrics[0]` + "Data: SWFL Data Gulf" + hashtags, filled from a live read
  (as of 08/14/2026). 239 chars. Note its lead metric happened to be a thin-sample one, so the
  English reads oddly before any translation — that is the builder's real output, not a test artifact.

Artifacts: `~/Downloads/omnivoice-drive-test/` (10 WAVs + `corpus.json` + `translations.json`).

## Machine + install (all measured, not assumed)

- Venv built at `<install>\_up_\_up_\.venv` — **the path the app itself looks in**, so the desktop
  GUI picks it up too. Python 3.12.13 (3.14 fails: no cp314 torch wheels), torch 2.8.0+cu128.
- Self-check (`backend/main.py --diagnose`): **9 OK, 1 warning, 0 failures**. Warning = no HF token.
- Backend: FastAPI on `127.0.0.1:3900`, engine routing `omnivoice -> cuda (accelerated)`.
- Disk: ~12 GB venv + 3.04 GB model snapshot.

## TTS performance — GOOD, and fast

Model `k2-fsa/OmniVoice`, 2,450,344,112-byte weights blob, on the RTX 4060 Ti. All 8 files audible
(24 kHz mono 16-bit, RMS 3,123–4,178; verified programmatically, not assumed).

| file | chars | audio | gen | RTF |
|---|---|---|---|---|
| email en | 368 | 23.70s | 38.4s | 1.621 (incl. cold model load) |
| social en | 239 | 14.60s | 2.9s | 0.201 |
| email es | 404 | 26.12s | 3.3s | 0.128 |
| social es | 271 | 16.79s | 2.4s | 0.142 |
| email pt | 358 | 23.04s | 2.8s | 0.122 |
| social pt | 258 | 16.25s | 2.9s | 0.178 |
| email de | 437 | 28.51s | 4.8s | 0.170 |
| social de | 248 | 15.29s | 2.4s | 0.156 |

**Warm RTF 0.12–0.18 — roughly 6–8× faster than realtime.** Throughput is a non-issue at our volume.

Also generated on **KittenTTS** (English-only fallback, CPU, 77.8 MB): RTF 4.586 cold / 0.647 warm.
Usable but far slower and English-only.

**Every output is stamped with an AudioSeal neural watermark (16-bit message mode)** — an embedded
AI-generated marker on anything we ship from this. Product decision, not a bug.

## Translation — FAILS on exactly what real estate copy cannot get wrong

Local Argos (`POST /dub/translate`, `provider=argos`, `quality=fast`), free, offline, no key.
en→es 69.3s, en→pt 43.1s, en→de 103.1s.

Defects, verbatim:
1. **Address corrupted** — "1275 Carlene Ave" → "1275 Carlene **A** Ave" (pt). Fatal for a listing email.
2. **Brand name translated** — "SWFL Data Gulf" → "**Golfo de datos SWFL**" (es). Preserved in
   pt/de, so it is inconsistent as well as wrong.
3. **Hashtags destroyed** — `#SWFLRealEstate #SWFL` → `SWFLRealEstate SWFL` (pt), `#` stripped.
4. **Register flips mid-copy** — es opens formal ("Si usted posee") then switches to tú
   ("¿Quieres saber…?"); de goes "Möchten Sie" → "um **dich** herum".
5. **German casing destroyed** — "wenn sie in **fort myers** besitzen", lowercase nouns throughout.
   Ungrammatical in German.
6. **Meaning inverted** — "Se é dono **de** Fort Myers" (pt) = owner *of the city*, not *in* it.
   "lo que realmente ha estado vendiendo a su alrededor" (es) makes the reader the seller.
7. **Domain term unstable** — "bearish" → "oso" (es, the animal) / "resistente" then "urso" (pt) /
   "bärisch" then left English (de). Four handlings, one term.
8. "high magnitude" → "hohe **Größe**" (de) = high *size*.

`quality=cinematic`/`autofit` and `dialect` (e.g. `pt-BR`) exist but are **LLM-only** — they need
`provider=openai` + `TRANSLATE_BASE_URL`. The free lane cannot honor them (`dialect_applied=false`).
A glossary field (`glossary: [{source,target}]`) exists and is the obvious guard for defects 1, 2,
3 and 7 — **untested this session**.

## App defects found (independent of output quality)

- **`/setup/status` lies.** Returned `models_ready: true, missing: []` with **zero** model bytes on
  disk. A user reads "ready" and gets a hang.
- **`/models` flips `installed: true` early.** Went `installed:true, incomplete:false` at
  **805,701,629 bytes of a 2.4 GB model**. This is what wedged synthesis for 10 min with no error.
- **CTranslate2 ASR dead on this box** — `cudnn_ops_infer64_8.dll` missing; WhisperX/faster-whisper
  unavailable, fell back to `pytorch-whisper`. Fix: `uv pip install --target
  <venv>/Lib/site-packages/cudnn8_compat nvidia-cudnn-cu12==8.9.7.29`.
- **Anonymous HF downloads stall.** The 1.84 GB weights file hung at 0 bytes/60s with connections
  open, on both Xet and legacy transports; killed clients orphaned 2.5 GB of `.part`/`.incomplete`
  duplicates. A retry completed it in 1,765s. No HF token exists anywhere (env, `.env*`, gh
  secrets, `~/.cache/huggingface/token`) — setting one is the fix.

## NOT tested

- **Video dubbing.** Email copy and a social post are text; there is no source video and no speaker
  to preserve. The `/dub/*` pipeline (ASR + Demucs + pyannote + lip-sync) is untouched.
- Voice cloning against a real agent voice sample.
- The `glossary` guard on the translation path.
- Any native-speaker review of the translated text.

## What this means for the offer

Dubbing/narration in other languages is **viable on the audio side today** — fast, local, free,
zero per-unit cost. The blocker is translation correctness, and it is a hard blocker: an email that
corrupts the street address and renames the brand cannot go to a client. Two paths, both untested:
route translation through an LLM (`provider=openai`, `quality=cinematic`, `dialect=pt-BR`) and/or
pin a glossary of never-translate terms (address tokens, "SWFL Data Gulf", hashtags, "bearish").
Either way it needs a native-speaker check gate before any send, which is the operator's own
"if it is correct" condition.
