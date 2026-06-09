#!/usr/bin/env python3
"""Download Colliers SWFL Industrial PDF for a given quarter."""
import sys
import os

sys.path.insert(0, ".")
from pathlib import Path
from ingest.pipelines.marketbeat_pdf.downloader import try_download_colliers

quarter = sys.argv[1]
drop = Path("ingest/drops/marketbeat_pdf")
drop.mkdir(parents=True, exist_ok=True)

result = try_download_colliers(quarter, drop)

gho = os.environ.get("GITHUB_OUTPUT", "/dev/null")
with open(gho, "a") as f:
    if result:
        f.write(f"colliers_pdf={result}\n")
        f.write("colliers_ok=true\n")
    else:
        f.write("colliers_ok=false\n")
