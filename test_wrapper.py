import os
import pyodbc
from dotenv import load_dotenv

load_dotenv()

class PyodbcCursorWrapper:
    def __init__(self, cursor, as_dict=False):
        self._cursor = cursor
        self.as_dict = as_dict

    def execute(self, *args, **kwargs):
        # pymssql uses %s, pyodbc uses ?
        if len(args) > 0 and isinstance(args[0], str):
            query = args[0]
            query = query.replace('%s', '?')
            args = (query,) + args[1:]
        self._cursor.execute(*args, **kwargs)

    def _make_dict(self, row):
        if not row: return row
        return dict(zip([c[0] for c in self._cursor.description], row))

    def fetchone(self):
        row = self._cursor.fetchone()
        if self.as_dict and row:
            return self._make_dict(row)
        return row

    def fetchall(self):
        rows = self._cursor.fetchall()
        if self.as_dict:
            return [self._make_dict(r) for r in rows]
        return rows

    def close(self):
        self._cursor.close()

class PyodbcConnWrapper:
    def __init__(self, conn):
        self._conn = conn
    
    def cursor(self, as_dict=False):
        return PyodbcCursorWrapper(self._conn.cursor(), as_dict=as_dict)
    
    def close(self):
        self._conn.close()

host = os.getenv('MSSQL_HOST', '192.168.222.13')
port = int(os.getenv('MSSQL_PORT', 1433))
user = os.getenv('MSSQL_USER', 'misreader')
pwd  = os.getenv('MSSQL_PASSWORD', '')
db   = os.getenv('MSSQL_DATABASE', 'master')
driver = [d for d in pyodbc.drivers() if 'SQL' in d][-1]

conn_str = f"DRIVER={{{driver}}};SERVER={host},{port};DATABASE={db};UID={user};PWD={pwd};"

try:
    raw_conn = pyodbc.connect(conn_str, timeout=5)
    conn = PyodbcConnWrapper(raw_conn)
    cursor = conn.cursor(as_dict=True)
    
    # Test query replacing %s
    val = "master"
    cursor.execute("SELECT DB_NAME() as current_db_name, %s as test_val", (val,))
    row = cursor.fetchone()
    print("Wrapped Query Test:", row)
    
    cursor.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
