# OmniVoice (k2-fsa) TTS Engine Teardown — the levers that make it talk better

**Date:** 08/19/2026
**Ordered by:** operator, verbatim: *"can't we rip this apart and figure out how we can make our
ai talk better? because we suck"* + URL https://github.com/k2-fsa/OmniVoice
**Method:** repomix full pack of the repo (88 files, ~176k tokens), local machine probes.
Pack lives in session scratchpad (`omnivoice.xml`), not committed.
**Context recovered from scratchpad:** operator decree 08/18 (session 9cb8d396): *"Bring it in and
we will offer dubbing for other languages after we test it out. We can also write emails or posts
in other languages if it is correct."* OmniVoice-Studio desktop app installed 08/18 at
`C:\Users\ethan\AppData\Local\Programs\VoiceStudio\`.

## What it is

k2-fsa/OmniVoice = massively multilingual **zero-shot TTS model** from the Next-gen Kaldi team
(Daniel Povey et al.), Apache-2.0, arXiv 2604.00688. 600+ languages, voice cloning from a 3–10s
reference clip, voice design from text attributes, diffusion-LM architecture, RTF down to 0.025
on GPU. Python >= 3.10, torch >= 2.4 (cu128 wheels pinned for Windows via uv), HF weights
`k2-fsa/OmniVoice`.

**KEY LINK (verified in the repo's own docs/community-projects.md):** OmniVoice-Studio — the
desktop app installed on this machine 08/18 — is a listed community frontend "Desktop application
for OmniVoice voice generation." Same engine. The Studio and this repo are ONE product family;
yesterday's "two different products" confusion is dead — the k2-fsa model IS what the Studio runs.

## Machine reality (probed 08/19)

- GPU: **RTX 4060 Ti, 16,380 MiB VRAM** (nvidia-smi; WMI lies and caps at 4GB). fp16 inference
  fits comfortably; long-form generation chunks at ~15s segments for near-constant VRAM.
- `C:\Users\ethan\omnivoice-venv` exists but is a HUSK — no torch, no pip. The 08/19 aborted
  install never completed. Delete or finish it; do not trust it.
- Studio install dir holds ffmpeg/ffprobe/uv — Studio provisions its own Python env via uv.

## The quality levers (why output can suck and what fixes it)

1. **Reference audio is the #1 lever.** 3–10 seconds, clean, SAME LANGUAGE as the target text.
   Longer clips DEGRADE cloning; cross-language reference imports a foreign accent. A bad clip =
   bad output no matter what else is set.
2. **`num_step`** (default 32): diffusion unmasking steps. 16 = fast/worse; higher = better/slower.
   If the Studio defaults low for speed, that alone explains "we suck."
3. **`normalize_text=True`** (opt-in, extra `omnivoice[tn]`): without it "123" can be read
   digit-by-digit. **Critical for us — prices, sqft, ZIPs in listing copy.** English/Chinese get
   WeTextProcessing; other languages fall back to num2words (integers only).
4. **`denoise=True`** (default on): `<|denoise|>` token for cleaner speech.
5. **`instruct` + `ref_audio` together:** consistent instruct stabilizes cloning attributes.
6. **Voice design** (no reference needed): "female, young adult, low pitch, american accent" —
   trained on EN/ZH only; other languages unstable. Matches the demo-personas-female rule.
7. **Pronunciation control:** CMU ARPAbet inline overrides for English ("[B EY1 S]") — fixes
   proper nouns like Estero/Alva/Matlacha if mispronounced. Non-verbal tags ([laughter], [sigh]).
8. **Short clips (1–2s) are unreliable without reference audio** — always give one.
9. **guidance_scale** 2.0 default, `speed`/`duration` control pacing, silence trim/fade built in.
10. **LoRA fine-tuning** (`omnivoice[lora]`, peft): 3–5% params trainable, tens-of-MB adapters —
    a real path to "the agent's own branded voice" later. Full training pipeline also in repo.
11. **FlashInfer**: 2–2.9x lossless speedup, NVIDIA-only, optional.

## Serving shapes already built by the community (RULE 0.9 — don't build the highway)

- `omnivoice-server` (maemreyo): **OpenAI-compatible `/v1/audio/speech` HTTP server** with
  persistent voice profiles + sentence streaming — the obvious wire-in if the platform ever
  speaks.
- `omnivoice-demo`: Gradio web UI shipped in the repo itself — the fastest way to tune levers
  by ear without the Studio in the way.
- pyVideoTrans: video translation + dubbing tool with OmniVoice backend — matches the 08/18
  dubbing decree more directly than raw TTS.

## Verdict

The engine is state-of-the-art and the machine can run it properly. "We suck" is almost
certainly a LEVER problem (reference clip quality/length, num_step, no text normalization on
numbers), not an engine problem — the Studio wrapper exposes some unknown subset of these.
Recommended path: proper venv install (torch cu128 + omnivoice[tn], ~3–4 GB download), drive
`omnivoice-demo` directly, A/B the levers by ear with the same reference clip, THEN decide what
the Studio is worth. Install NOT started — operator sign-off first (yesterday's incident).
