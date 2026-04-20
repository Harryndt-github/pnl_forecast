import os
import pyodbc
from dotenv import load_dotenv
load_dotenv()
host = os.getenv('MSSQL_HOST')
port = int(os.getenv('MSSQL_PORT'))
db   = os.getenv('MSSQL_DATABASE')
user = os.getenv('MSSQL_USER')
pwd  = os.getenv('MSSQL_PASSWORD')

drivers = [d for d in pyodbc.drivers() if 'SQL' in d]
driver = drivers[-1] if drivers else 'SQL Server'
if any('ODBC Driver' in d for d in drivers):
    driver = [d for d in drivers if 'ODBC Driver' in d][-1]

conn = pyodbc.connect(f'DRIVER={{{driver}}};SERVER={host},{port};DATABASE={db};UID={user};PWD={pwd};', timeout=5)
cur = conn.cursor()

cur.execute("SELECT TOP 5 pc FROM DataMart.MIS.FC213_FACT_ACT WHERE pc LIKE '%4001'")
print('FC213 with 4001:', cur.fetchall())

cur.execute("SELECT TOP 5 pc FROM DataMart.MIS.FC213_FACT_ACT WHERE pc LIKE '%10AS%'")
print('FC213 with 10AS:', cur.fetchall())

cur.close()
conn.close()
