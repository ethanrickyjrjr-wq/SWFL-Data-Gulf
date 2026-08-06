## Enforced
- Claim: days-to-contract is read from OUR OWN listing clock, and DROPS TO AN OPEN SLOT rather than
  shipping an estimate when that clock holds no real count (a `first_seen` floor is not a count).
  Test: lib/deliverable/recipes/under-contract.test.ts > "DROPS to null when the listing clock has no real count — never an estimate"
- Claim: with no real clock the build still lands and the empty cells' LABELS carry the instruction —
  never a zero, never a placeholder number.
  Test: lib/deliverable/recipes/under-contract.test.ts > "a build with no real clock ships OPEN SLOTS whose labels are the instruction"

<!-- SUPERSEDED 08/06/2026. The prior claim read: "no days-to-contract fabrication (labels the
running age 'Days Since Listed' — never 'time on market' and never 'days to contract')", pointing at
a test named "SETS THE TWO CLOCKS SIDE BY SIDE". Both the claim and that test belonged to the JULY
under-contract recipe, which was deleted and rewritten new on 08/06/2026. The operator's decree that
unblocked this email (playbook 2.4.0) settled the opposite call: the email DOES ship a cell labelled
"Days to contract", with the contract date taken as the build date. The guard did not weaken — it
moved. What is forbidden now is an ESTIMATE standing in for a real count, and that is what the two
tests above enforce. The MLS-term caution ("time on market", whose clock stops at pending) survives
as playbook 2.4.3 trap 1 and is asserted against the rendered bytes by the acceptance run
(`scripts/email/render-under-contract.mts`, assertion 5), not by a unit test. -->

## Unenforced
- `inventedAttributes`'s word-guard can be legitimized by a community NAME containing a water word
  (e.g. "Heritage Bay") once the neighborhood-stats settled sentence is in the narrator's source
  text — tracked, open: check `community_name_water_word_legitimizes_invented_attribute`.
