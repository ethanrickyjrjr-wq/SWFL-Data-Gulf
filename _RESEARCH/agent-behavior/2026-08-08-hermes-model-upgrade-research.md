# Hermes model upgrade — what beats gemma4:12b on this box (researched live 08/08/2026)

Operator decree: "HOW DO WE GET IT BETTER THAN GEMMA:12B... DID YOU REALLY RESEARCH."
Hermes install: `C:\Users\ethan\AppData\Local\hermes` (hermes-agent, MIT, venv Python).
Hardware: RTX 4060 Ti 16GB (verified in 07/30 omnigent research). Current model:
gemma4:12b via local Ollama (`config.yaml` → `model.default`).

## Live-verified findings (all fetched this session, not memory)

1. **gpt-oss:20b fits this card and is the free local upgrade.**
   Source: https://ollama.com/library/gpt-oss — `gpt-oss:20b` = **14GB, 128K context,
   tools + thinking**, OpenAI open-weights, "designed for powerful reasoning, agentic
   tasks." 14GB < 16GB VRAM → fits the 4060 Ti. gemma4:12b is a dense general model;
   gpt-oss:20b is the agentic/tool-calling class Hermes needs now that the swfl-lake
   MCP is wired. Switch: `ollama pull gpt-oss:20b` then set `model.default` in
   Hermes config (or `hermes` config UI).

2. **nemotron-3-nano:30b does NOT fit locally.**
   Source: https://ollama.com/library/nemotron-3-nano — 30b = **24GB** > 16GB VRAM.
   MoE (3.5B active/30B total), 1M context. Use `nemotron-3-nano:30b-cloud` instead.

3. **Ollama Cloud removes the VRAM ceiling entirely, free tier included.**
   Source: https://docs.ollama.com/cloud + https://ollama.com/pricing (fetched live).
   Free plan: "Access cloud models" (low usage cap). Pro **$20/mo**: larger models,
   3 concurrent, 50x usage. Max $100/mo (sign-ups paused as of 08/08/2026).
   This Hermes install already caches the cloud model list
   (`ollama_cloud_models_cache.json`): kimi-k3, glm-5.2, deepseek-v4-pro,
   gpt-oss:120b, qwen3.5:397b, gemma4:31b, mistral-large-3:675b, kimi-k2.7-code,
   nemotron-3-ultra, minimax-m3, and 10 more. Requires `ollama signin`; model names
   take the `-cloud` suffix through the same local Ollama endpoint — Hermes config
   change is one line, no new provider.

4. **Hermes is model-agnostic beyond Ollama.** `hermes.exe` accepts any
   OpenAI-compatible `base_url` + key (Nous Portal, OpenRouter). Profile routing
   (`docs/profile-routing.md` in the install) isolates per-channel profiles — each
   profile can carry its own model, so chores can stay on local gemma/gpt-oss while
   a "desk" profile runs a cloud model.

## Sources that did NOT survive verification

- quantized.fyi "best LLM for 16GB VRAM 2026" (surfaced via DDG, cited r/LocalLLaMA
  + Hardware Corner) — domain suspended; the DDG snippet was stale. Not usable.
- Reddit direct (old.reddit login-wall, www.reddit JS challenge, JSON API 403) —
  blocked to this crawler as of 08/08/2026; go through DDG snippets or secondary
  benchmark sites when Reddit-grade consensus is needed.

## Recommended ladder (START WITH WHAT WE HAVE, MOVE TO PAID — RULE 0.7a)

1. Free/local today: gemma4:12b → **gpt-oss:20b** (14GB, fits, tool-calling).
2. Free/cloud: `ollama signin` → **gpt-oss:120b-cloud** or nemotron-3-nano:30b-cloud
   on the free low-usage cap for the harder drafts.
3. Paid, only if the free cap actually bites: Ollama Pro $20/mo → kimi-k3 /
   glm-5.2 / deepseek-v4-pro class at 50x usage.

Related same-session work: `.hermes.md` repo context file, `swfl-data-gulf` Hermes
skill (`AppData\Local\hermes\skills\research\swfl-data-gulf\`), swfl-lake MCP wired
into Hermes (connected 906ms, 6 tools discovered).
