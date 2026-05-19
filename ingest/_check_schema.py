import tomllib, psycopg2

with open('.dlt/secrets.toml', 'rb') as f:
    s = tomllib.load(f)
pg = s['destination']['postgres']['credentials']
conn = psycopg2.connect(
    host=pg['host'], port=pg.get('port', 5432),
    dbname=pg['database'], user=pg['username'], password=pg['password']
)
cur = conn.cursor()

# All tables + views in data_lake
cur.execute("""
    SELECT table_name, table_type
    FROM information_schema.tables
    WHERE table_schema = 'data_lake'
    ORDER BY table_name
""")
print("=== data_lake objects ===")
for r in cur.fetchall():
    cur2 = conn.cursor()
    try:
        cur2.execute(f"SELECT COUNT(*) FROM data_lake.{r[0]}")
        count = cur2.fetchone()[0]
    except:
        count = "ERR"
    print(f"  {r[1]:12s}  {r[0]:50s}  {count}")

# Check service_role grants on data_lake tables
cur.execute("""
    SELECT grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
    WHERE table_schema = 'data_lake'
      AND grantee = 'service_role'
    ORDER BY table_name
""")
print("\n=== service_role grants on data_lake ===")
for r in cur.fetchall():
    print(f"  {r[1]}")

conn.close()
