# Project Map: The Core Navigation for Developers & Agents

This document serves as the primary roadmap for navigating this codebase. It defines the separation between infrastructure, logic, and content to ensure that automated agents (LLMs) can identify "Truth" quickly without drifting into trial-and-error.

## 1. The Execution Pipeline
All "Recipes" follow a strict three-step flow. When building or editing features, ensuring this separation is critical:

### A. Data Acquisition (The Source)
Found in `lib/delivery/*` and related data scripts.
- **Purpose:** Fetching raw information from APIs, databases, or external scrapers.
- **Requirement:** No interpretation allowed here. The goal is to get the raw "fact" as close to the source as possible.

### B. Guardrails (The Filter)
Found in `lib/validation/*` and embedded within `lib/deliverable/recipes.*`.
- **Purpose:** Comparing raw data against business rules before it hits the narrative engine.
- **Rules:** 
  - Price validation (ensuring numbers are logical).
  - Sense-check (checking dates, locations, and status durations).
  - Integrity check (verifying required fields aren't null or "dummy" values).

### C. Narrative Synthesis (The Voice)
Found in `lib/narrative/*` and prompt-engineered templates.
- **Purpose:** Taking the *validated* data packet and drafting the final communication.
- **Standard:** These prompts should only receive "cleaned" data from the Guardrails. If a value is missing or invalid, it should be noted as such in the system message rather than being hallucinated or ignored by the LLM.

## 2. Core Assets & Products
Located in `public/` and `lib/delivery/products`.
- **Production Templates:** The high-fidelity HTML files found in `public/new_emails/`.
- **Alternative Versions:** Older, "Showcase," or specialized variations are generally located in `public/showcase/` and should be treated as historical reference.

## 3. Automation & Orchestration
Found in `scripts/`, `cron/`, and `.github/workflows/`.
- **Cron Jobs:** Scheduled tasks for data refreshes, integrity checks (e.g., "Report Stale").
- **Validation Scripts:** Automated tests (`*.test.*` or `.spec.ts`) that ensure the logic gates remain closed to hallucination.

## 4. Core Technologies & Tooling
- **Database:** Supabase/PostgreSQL for long-term data persistence.
- **Sync Pipeline:** Managed via `lib/deliverable/` and our transition scripts.
- **Intelligence Interface:** We use a modular approach; if it's "opinionated," it belongs in the Narrative layer. If it’s "factual," it must go through the Guardrail layer.

---
**General Rule for Agents:** 
If you are unsure whether a piece of data is "safe" to show to an end-user, look for the **Guardrails**. If a guard doesn't exist, flag it as a pending safety check in `_ASSISTANT/investigations`.
