-- Add "regulatory" to the brain_registry domain CHECK constraint.
-- Mirrors the BrainDomain union in refinery/types/pack.mts.
-- Required by condo-sirs-swfl (catalog.mts) which uses domain: "regulatory".

ALTER TABLE brain_registry DROP CONSTRAINT IF EXISTS brain_registry_domain_check;

ALTER TABLE brain_registry ADD CONSTRAINT brain_registry_domain_check CHECK (
    domain IN (
        'real-estate',
        'finance',
        'environmental',
        'demographics',
        'logistics',
        'hospitality',
        'macro',
        'regulatory'
    )
);
