"""
Database Connection Diagnostic Script
Tests MSSQL and StarRocks with multiple configurations
"""
import os
import sys
import time

# UTF-8 for Windows console
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except:
        pass

from dotenv import load_dotenv
load_dotenv()

print("=" * 60)
print("DATABASE CONNECTION DIAGNOSTICS")
print("=" * 60)

# ── 1. MSSQL Tests ──
print("\n[1] MSSQL CONNECTION TESTS")
print("-" * 40)

host = os.getenv('MSSQL_HOST', '192.168.222.13')
port = int(os.getenv('MSSQL_PORT', 1433))
user = os.getenv('MSSQL_USER', 'misreader')
pwd  = os.getenv('MSSQL_PASSWORD', '')
db   = os.getenv('MSSQL_DATABASE', '')

print(f"  Host:     {host}:{port}")
print(f"  User:     {user}")
print(f"  Password: {'*' * len(pwd)} ({len(pwd)} chars)")
print(f"  Database: '{db}' {'(EMPTY!)' if not db else ''}")

import pymssql

# Test with different TDS versions
for tds in ['7.4', '7.3', '7.2', '7.1', '7.0']:
    print(f"\n  >> Testing tds_version='{tds}' (timeout=8s)...")
    start = time.time()
    try:
        conn = pymssql.connect(
            server=host, port=port,
            user=user, password=pwd,
            database=db if db else None,
            timeout=8, login_timeout=8,
            charset='UTF-8', tds_version=tds
        )
        elapsed = time.time() - start
        cur = conn.cursor()
        cur.execute("SELECT @@VERSION")
        ver = cur.fetchone()[0][:100]
        cur.execute("SELECT DB_NAME()")
        current_db = cur.fetchone()[0]
        print(f"     SUCCESS in {elapsed:.1f}s")
        print(f"     Version: {ver}")
        print(f"     Current DB: {current_db}")
        
        # Test a real query
        cur.execute("SELECT COUNT(*) FROM sys.databases")
        db_count = cur.fetchone()[0]
        print(f"     Databases: {db_count}")
        
        cur.close()
        conn.close()
        print(f"     >>> MSSQL WORKING with tds={tds}! <<<")
        break  # Stop trying other versions
    except Exception as e:
        elapsed = time.time() - start
        print(f"     FAILED in {elapsed:.1f}s: {type(e).__name__}: {e}")

# ── 2. StarRocks Tests ──
print("\n" + "=" * 60)
print("[2] STARROCKS CONNECTION TEST")
print("-" * 40)

sr_host = os.getenv('STARROCKS_HOST', '192.168.221.200')
sr_port = int(os.getenv('STARROCKS_PORT', 31234))
sr_user = os.getenv('STARROCKS_USER', 'mis_admin')
sr_pwd  = os.getenv('STARROCKS_PASSWORD', '')
sr_db   = os.getenv('STARROCKS_DATABASE', 'datamart_mis_prod')

print(f"  Host:     {sr_host}:{sr_port}")
print(f"  User:     {sr_user}")
print(f"  Database: {sr_db}")

import pymysql

start = time.time()
try:
    conn = pymysql.connect(
        host=sr_host, port=sr_port,
        user=sr_user, password=sr_pwd,
        database=sr_db,
        connect_timeout=10,
        cursorclass=pymysql.cursors.DictCursor
    )
    elapsed = time.time() - start
    cur = conn.cursor()
    cur.execute("SELECT version()")
    ver = cur.fetchone()
    print(f"  SUCCESS in {elapsed:.1f}s")
    print(f"  Version: {ver}")
    
    # Test actual data query
    cur.execute("SHOW TABLES LIMIT 5")
    tables = cur.fetchall()
    print(f"  Sample tables: {tables}")
    
    cur.close()
    conn.close()
    print("  >>> STARROCKS WORKING! <<<")
except Exception as e:
    elapsed = time.time() - start
    print(f"  FAILED in {elapsed:.1f}s: {type(e).__name__}: {e}")

print("\n" + "=" * 60)
print("DIAGNOSTICS COMPLETE")
print("=" * 60)
