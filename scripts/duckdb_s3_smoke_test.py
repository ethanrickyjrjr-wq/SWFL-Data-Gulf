"""
Smoke test: DuckDB <-> Supabase Storage S3 round-trip.

Run with: python scripts/duckdb_s3_smoke_test.py

PASS: prints 'SMOKE TEST PASSED'.
FAIL: raises with the specific DuckDB or HTTP error. If it fails here,
do NOT proceed to build the NOAA pipeline -- pivot to the fallback path
described in the spec (write Parquet locally then upload via Supabase
Storage REST API).
"""
import os
import sys
from pathlib import Path

# Load .env.local manually (project doesn't use python-dotenv globally)
env_path = Path(__file__).parent.parent / ".env.local"
for line in env_path.read_text().splitlines():
    if "=" in line and not line.startswith("#"):
        k, _, v = line.partition("=")
        os.environ.setdefault(k.strip(), v.strip().strip("'\""))

import duckdb

REQUIRED = ["SUPABASE_S3_ENDPOINT", "SUPABASE_S3_ACCESS_KEY_ID", "SUPABASE_S3_SECRET_ACCESS_KEY"]
missing = [k for k in REQUIRED if not os.environ.get(k)]
if missing:
    print(f"Missing env vars: {missing}", file=sys.stderr)
    sys.exit(1)

# Strip the https:// prefix -- DuckDB wants host:port for s3_endpoint
endpoint = os.environ["SUPABASE_S3_ENDPOINT"].replace("https://", "").replace("http://", "")

con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
con.execute(f"""
    SET s3_endpoint='{endpoint}';
    SET s3_access_key_id='{os.environ["SUPABASE_S3_ACCESS_KEY_ID"]}';
    SET s3_secret_access_key='{os.environ["SUPABASE_S3_SECRET_ACCESS_KEY"]}';
    SET s3_url_style='path';
    SET s3_use_ssl=true;
""")

# Write 1 row
con.execute("COPY (SELECT 1 AS x, 'hello' AS s) TO 's3://lake-tier1/_smoke_test.parquet' (FORMAT PARQUET);")

# Read it back
result = con.execute("SELECT * FROM read_parquet('s3://lake-tier1/_smoke_test.parquet');").fetchall()

assert result == [(1, 'hello')], f"Round-trip mismatch: got {result!r}"
print("SMOKE TEST PASSED -- DuckDB <-> Supabase Storage S3 round-trip works.")
print(f"  Endpoint: {endpoint}")
print(f"  Test file: s3://lake-tier1/_smoke_test.parquet (you can delete this from the Storage dashboard)")
