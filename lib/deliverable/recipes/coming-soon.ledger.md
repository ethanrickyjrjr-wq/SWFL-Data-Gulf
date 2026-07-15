## Enforced
- Claim: the street address never leaks from the built doc's hero, photo alt, subject line, or CTA
  Test: lib/deliverable/recipes/coming-soon.test.ts > "no rendered field carries the street line, the street name, or the house number"
- Claim: leaksStreet flags prose that still carries the street name or house number — the guard on the model's output
  Test: lib/deliverable/recipes/coming-soon.test.ts > "leaksStreet catches what redaction is meant to remove"

## Unenforced
- [none found this pilot]
