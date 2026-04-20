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
cursor = conn.cursor()

cursor.execute("SELECT DISTINCT RIGHT(pc, 4) FROM DataMart.MIS.FC213_FACT_ACT WHERE pc LIKE '10GF%'")
print('RIGHT 4 chars:', cursor.fetchall())

cursor.execute("SELECT DISTINCT RestaurantCode FROM DataMart.MIS.DAILY_SALES WHERE RestaurantCode = '4001'")
print('Direct matching 4001:', cursor.fetchall())

cursor.close()
conn.close()
