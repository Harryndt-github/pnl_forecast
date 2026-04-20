import os
import pymssql
from dotenv import load_dotenv

load_dotenv()

host = os.getenv('MSSQL_HOST')
user = os.getenv('MSSQL_USER')
pwd = os.getenv('MSSQL_PASSWORD')

try:
    conn = pymssql.connect(server=host, user=user, password=pwd, database='', tds_version='7.0')
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sys.databases")
    rows = cursor.fetchall()
    for r in rows:
        print(r[0])
    conn.close()
except Exception as e:
    print("FAILED:", str(e))
