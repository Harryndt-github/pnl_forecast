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
    print("Columns in DataMart.MIS.V_OPS_FC213_FACT_ACT:")
    cursor.execute("SELECT TOP 0 * FROM DataMart.MIS.V_OPS_FC213_FACT_ACT")
    cols = [d[0] for d in cursor.description]
    print(cols)
    conn.close()
except Exception as e:
    print("FAILED:", str(e))
