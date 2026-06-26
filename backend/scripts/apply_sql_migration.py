import sys

DSN = None
if len(sys.argv) >= 2:
    DSN = sys.argv[1]
else:
    import os
    DSN = os.environ.get('DB_DSN')
    if not DSN:
        print('Usage: python apply_sql_migration.py <dsn> OR set DB_DSN env var')
        sys.exit(2)
SQL_FILE = 'backend/migrations/008_extend_passenger_preferences.sql'

try:
    import psycopg2
except Exception as e:
    print('psycopg2 not installed:', e)
    print('Attempting to install psycopg2-binary via pip...')
    try:
        import subprocess
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'psycopg2-binary'])
        import psycopg2
    except Exception as e2:
        print('Failed to install psycopg2-binary:', e2)
        sys.exit(3)

try:
    with open(SQL_FILE, 'r', encoding='utf-8') as f:
        sql = f.read()
except Exception as e:
    print('Failed to read SQL file:', e)
    sys.exit(4)

print('Connecting to', DSN.split('@')[-1])
try:
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    cur = conn.cursor()
    cur.execute(sql)
    print('Migration executed successfully')
    cur.close()
    conn.close()
except Exception as e:
    print('Migration failed:', e)
    sys.exit(5)
