"""Run SQL migration files in backend/migrations in lexical order.

Usage:
    python run_migrations.py

Environment:
    DATABASE_URL may be set to a PostgreSQL URI.
    If unset, this script uses a local sqlite database file at backend.sqlite.
"""
import os
import glob
import sqlite3
from urllib.parse import urlparse


def get_sql_files(path):
    files = sorted(glob.glob(os.path.join(path, "*.sql")))
    return files


def run_sql_file(conn, path):
    with open(path, 'r', encoding='utf-8') as f:
        sql = f.read()
    if hasattr(conn, 'cursor'):
        cur = conn.cursor()
        cur.executescript(sql)
        conn.commit()
    else:
        raise RuntimeError('Unsupported connection object')


def main():
    migrations_dir = os.path.join(os.path.dirname(__file__), '..', 'migrations')
    migrations_dir = os.path.abspath(migrations_dir)
    database_url = os.environ.get('DATABASE_URL')

    files = get_sql_files(migrations_dir)
    if not files:
        print('No migration files found in', migrations_dir)
        return

    if database_url:
        # PostgreSQL connection
        import psycopg2
        print('Running migrations against PostgreSQL database')
        conn = psycopg2.connect(database_url)

        try:
            print('Running migrations from', migrations_dir)
            for f in files:
                print('Applying', f)
                run_sql_file(conn, f)
            print('Migrations applied successfully')
        finally:
            conn.close()
    else:
        import sys
        from sqlalchemy import create_engine

        root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
        if root_dir not in sys.path:
            sys.path.insert(0, root_dir)

        from app.models.vehicle_platform import Base as ModelBase

        sqlite_path = os.environ.get('SQLITE_PATH', os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend.sqlite')))
        print('DATABASE_URL not set; using local SQLite fallback at', sqlite_path)
        engine = create_engine(f"sqlite:///{sqlite_path}", connect_args={"check_same_thread": False})
        ModelBase.metadata.create_all(bind=engine)
        print('SQLite tables created successfully (via SQLAlchemy metadata)')
        return


if __name__ == '__main__':
    main()
