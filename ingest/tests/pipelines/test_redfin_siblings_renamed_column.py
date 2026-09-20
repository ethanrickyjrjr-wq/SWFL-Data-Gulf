"""A vendor column rename must fail the pull, not land NULLs.

Redfin relabeled DOM MOM/YOY "(%)" -> "(DAYS)" on 09/15/2026. redfin_swfl failed loudly
(SQL column refs); these three siblings look columns up by name in `_KEEP` and would have
written None for the renamed column on every row, green. Three sites, one guard.
"""
import importlib

import pytest

from ingest.lib.guards import ContentContractError

SIBLINGS = [
    ("ingest.pipelines.redfin_lee.resources", "iter_lee_rows"),
    ("ingest.pipelines.redfin_collier.resources", "iter_collier_rows"),
    ("ingest.pipelines.redfin_city_swfl.resources", "iter_city_rows"),
]


class _Resp:
    def __init__(self, text):
        self._b = text.encode()

    def raise_for_status(self):
        pass

    def iter_content(self, chunk_size):
        yield self._b

    def close(self):
        pass


@pytest.mark.parametrize("modname,fn", SIBLINGS)
def test_renamed_vendor_column_raises_instead_of_landing_nulls(monkeypatch, modname, fn):
    mod = importlib.import_module(modname)
    renamed = next(k for k in mod._KEEP if k != "REGION NAME")
    cols = ["REGION TYPE"] + [k for k in mod._KEEP if k != renamed] + [renamed + " RELABELED"]
    csv_text = ",".join(f'"{c}"' for c in cols) + "\n"
    monkeypatch.setattr(mod.requests, "get", lambda *a, **k: _Resp(csv_text))

    with pytest.raises(ContentContractError, match=renamed.replace("(", r"\(").replace(")", r"\)").replace("$", r"\$")):
        list(getattr(mod, fn)())
