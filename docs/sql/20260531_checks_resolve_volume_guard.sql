-- Attest: volume guard infrastructure shipped (commit 5bedd50); fema + fhfa pre-promote guards wired.
UPDATE public.checks
SET state = 'done', resolved_at = now()
WHERE check_key = 'flywheel_volume_guard';
