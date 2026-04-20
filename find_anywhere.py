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
    dbs = [r[0] for r in cursor.fetchall()]
    
    for db in dbs:
        try:
            print(f"Checking {db}...")
            cursor.execute(f"SELECT s.name, v.name FROM {db}.sys.views v JOIN {db}.sys.schemas s ON v.schema_id = s.schema_id WHERE v.name = 'v_dim_manual_fc_operation_report_forecast_pnl'")
            rows = cursor.fetchall()
            for r in rows:
                print(f"FOUND in {db}: {r[0]}.{r[1]}")
        except:
            pass
    conn.close()
except Exception as e:
    print("FAILED:", str(e))
