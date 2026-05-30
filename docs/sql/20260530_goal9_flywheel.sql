-- Goal 9 — the compounding flywheel (the end-state the 0-8 ladder serves).
--
-- Idempotent + INSERT-ONLY (ON CONFLICT DO NOTHING). This adds ONE new row
-- (goal_number = 9) and can NEVER overwrite an operator-edited row 0-8. The
-- operator owns the ladder in Supabase Studio; re-running this is safe.
--
-- Why a new row instead of editing Goals 7/8: Goal 7 (outcomes loop) and Goal 8
-- (autonomy + fine-tuned synthesis) are the BUILD STEPS of the flywheel. Goal 9
-- is the DESTINATION they unlock — stated explicitly so the north star is on the
-- ladder, not just implied. Editing 7/8 would overwrite operator-owned rows.

INSERT INTO public.goals (goal_number, title, description, status) VALUES
(9, 'The compounding flywheel',
    'The end state the whole ladder serves. Every prediction master makes is conditional + falsifiable, so every prediction can later be graded against what the reporters observe actually happened. Loop: observe a real-world event (a Walmart opens, an interchange, a flood, a rate hike) against the area''s known starting conditions (population, traffic, income, demographics, permits, rents) -> make a falsifiable call -> measure the actual outcome by radius over time -> score it -> bank "these starting conditions + this event -> this outcome" as ground truth. One event teaches little; 50 across varied conditions build a real distribution, so by the 51st the system predicts from matched cohorts ("in the 8 prior cases most like this one, rents within 1mi moved +X%, effect died past 2mi") instead of theory. Not Walmart-specific — every observable event becomes a graded natural experiment. The moat is made of time + territory: the scored history compounds monthly and cannot be bought, only outlived. Built on Goals 7 (outcomes loop / causal layer) + 8 (fine-tuned synthesis). Status: scaffolding exists (predictions/outcomes tables, falsifiable-thesis structure live in master); volume does not yet. Early on the curve.',
    'red')
ON CONFLICT (goal_number) DO NOTHING;
