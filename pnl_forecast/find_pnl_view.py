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
    print("Searching for v_dim_manual_fc_operation_report_forecast_pnl in all DataMart schemas...")
    cursor.execute("""
        SELECT s.name as schema_name, v.name as view_name 
        FROM DataMart.sys.views v
        JOIN DataMart.sys.schemas s ON v.schema_id = s.schema_id
        WHERE v.name = 'v_dim_manual_fc_operation_report_forecast_pnl'
    """)
    rows = cursor.fetchall()
    for r in rows:
        print(f"Schema: {r[0]}, View: {r[1]}")
    
    # Also check tables just in case
    cursor.execute("""
        SELECT s.name as schema_name, t.name as table_name 
        FROM DataMart.sys.tables t
        JOIN DataMart.sys.schemas s ON t.schema_id = s.schema_id
        WHERE t.name = 'v_dim_manual_fc_operation_report_forecast_pnl'
    """)
    rows = cursor.fetchall()
    for r in rows:
        print(f"Schema (Table): {r[0]}, Table: {r[1]}")
        
    conn.close()
except Exception as e:
    print("FAILED:", str(e))
