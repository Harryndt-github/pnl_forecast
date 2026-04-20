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
    print("Searching in datamart_mis_prod...")
    cursor.execute("""
        SELECT s.name as schema_name, v.name as view_name 
        FROM datamart_mis_prod.sys.views v
        JOIN datamart_mis_prod.sys.schemas s ON v.schema_id = s.schema_id
        WHERE v.name LIKE '%v_dim_manual%'
    """)
    rows = cursor.fetchall()
    for r in rows:
        print(f"Schema: {r[0]}, View: {r[1]}")
    conn.close()
except Exception as e:
    print("FAILED:", str(e))
