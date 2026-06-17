import requests, sys, json
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

r = requests.get('http://localhost:5050/api/chains')
print(f"HTTP Status: {r.status_code}")
j = r.json()
print(f"JSON: {json.dumps(j, indent=2, ensure_ascii=False)[:2000]}")
