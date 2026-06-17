import os
import pyodbc
from dotenv import load_dotenv

load_dotenv()

print("Available ODBC Drivers:")
drivers = [d for d in pyodbc.drivers() if 'SQL' in d]
for d in drivers:
    print(f"  - {d}")

if not drivers:
    print("No SQL Server ODBC drivers found!")
    exit(1)

host = os.getenv('MSSQL_HOST', '192.168.222.13')
port = int(os.getenv('MSSQL_PORT', 1433))
user = os.getenv('MSSQL_USER', 'misreader')
pwd  = os.getenv('MSSQL_PASSWORD', '')
db   = os.getenv('MSSQL_DATABASE', 'master') # Fallback to master if empty

# Use the newest installed driver
driver = drivers[-1]
if any("ODBC Driver" in d for d in drivers):
    driver = [d for d in drivers if "ODBC Driver" in d][-1]

conn_str = (
    f"DRIVER={{{driver}}};"
    f"SERVER={host},{port};"
    f"DATABASE={db};"
    f"UID={user};"
    f"PWD={pwd};"
)

print(f"\nTesting connection with '{driver}' to {host}:{port}...")
try:
    # 5 seconds timeout
    conn = pyodbc.connect(conn_str, timeout=5)
    print("SUCCESS! Connection established.")
    cursor = conn.cursor()
    cursor.execute("SELECT @@VERSION")
    row = cursor.fetchone()
    print(f"Server info: {row[0][:100]}")
    conn.close()
except pyodbc.Error as e:
    print(f"FAILED. Error:\n{e}")
except Exception as e:
    print(f"Unexpected error: {type(e).__name__}: {e}")
