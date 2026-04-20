"""
PNL FORECAST -- Flask API Backend
Connects to SQL Server (Actual) & StarRocks (Forecast)
Windows-compatible version
"""

import os
import sys
import io
import json
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime
from functools import lru_cache

# ─── Windows UTF-8 safety ───────────────────────────────────
# Prevents UnicodeEncodeError when printing Vietnamese/emoji
# characters to Windows console (default cp1252 / cp65001).
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        sys.stdout = io.TextIOWrapper(
            sys.stdout.buffer, encoding='utf-8', errors='replace'
        )
        sys.stderr = io.TextIOWrapper(
            sys.stderr.buffer, encoding='utf-8', errors='replace'
        )

from flask import Flask, jsonify, request, send_from_directory, session, redirect, url_for
from flask_cors import CORS
from dotenv import load_dotenv
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from authlib.integrations.flask_client import OAuth
from werkzeug.security import check_password_hash, generate_password_hash

# ─── Load environment ───
load_dotenv()

# ─── App Setup ───
app = Flask(__name__, static_folder='.', static_url_path='')
app.secret_key = os.getenv('FLASK_SECRET_KEY', os.urandom(24))

# 1. Strict CORS
CORS(app, resources={r"/api/*": {"origins": [
    "http://localhost:5050", 
    "http://127.0.0.1:5050", 
    "https://pnl.ggg.com.vn",
    "https://forecast.ggg.com.vn"
]}}, supports_credentials=True)

# 2. Rate Limiting (chống DDoS)
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["200 per minute", "1000 per hour"],
    storage_uri="memory://"
)

# 3. Authentication SSO
oauth = OAuth(app)
google = oauth.register(
    name='google',
    client_id=os.getenv('GOOGLE_CLIENT_ID', 'placeholder_id'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET', 'placeholder_secret'),
    access_token_url='https://accounts.google.com/o/oauth2/token',
    access_token_params=None,
    authorize_url='https://accounts.google.com/o/oauth2/auth',
    authorize_params=None,
    api_base_url='https://www.googleapis.com/oauth2/v1/',
    userinfo_endpoint='https://openidconnect.googleapis.com/v1/userinfo',
    client_kwargs={'scope': 'openid email profile'},
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration'
)

USERS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'users.json')

def get_users():
    if not os.path.exists(USERS_FILE):
        return []
    with open(USERS_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)

def filter_restaurants_by_rbac(pc_list):
    """Filters a list of PC codes based on current user session role."""
    if not session.get('user'):
        return pc_list
    user = session['user']
    if user.get('role') == 'admin':
        return pc_list
    allowed_pcs = set(user.get('allowed_pcs', []))
    allowed_chains = set(user.get('allowed_chains', []))
    return [pc for pc in pc_list if pc in allowed_pcs or (len(pc) >= 4 and pc[:4] in allowed_chains)]

@app.before_request
def check_auth():
    """Global API Protection: Check session"""
    if request.path.startswith('/api/') and not request.path.startswith('/api/auth/') and not request.path.startswith('/api/health'):
        if request.method == 'OPTIONS':
            return # Let CORS preflight pass
        
        if 'user' not in session:
            return jsonify({'status': 'error', 'message': 'Unauthorized. Please login.', 'code': 'AUTH_REQUIRED'}), 401
        
        auth_mode = os.getenv('AUTH_MODE', 'local').lower()
        if auth_mode == 'google':
            email = session['user'].get('email', '')
            if not email.endswith('@ggg.com.vn'):
                return jsonify({'status': 'error', 'message': 'Forbidden. GGG emails only.', 'code': 'FORBIDDEN'}), 403

# ─── Auth Routes ───
@app.route('/api/auth/login')
def auth_login_page():
    # Serve unified login page
    return send_from_directory('.', 'login.html')

@app.route('/api/auth/google')
def auth_google_redirect():
    redirect_uri = url_for('auth_callback', _external=True)
    return google.authorize_redirect(redirect_uri, prompt='select_account')

@app.route('/api/auth/local/login', methods=['POST'])
def auth_local_login():
    data = request.json or {}
    username = data.get('username', '').strip()
    password = data.get('password', '')

    users = get_users()
    matched_user = next((u for u in users if u['username'].lower() == username.lower()), None)
    
    if matched_user and check_password_hash(matched_user['password_hash'], password):
        session['user'] = {
            'username': matched_user['username'],
            'email': matched_user.get('email', username),
            'role': matched_user.get('role', 'user'),
            'allowed_chains': matched_user.get('allowed_chains', []),
            'allowed_pcs': matched_user.get('allowed_pcs', [])
        }
        return jsonify({'status': 'ok'})
    else:
        return jsonify({'status': 'error', 'message': 'Sai tên đăng nhập hoặc mật khẩu'}), 401

@app.route('/api/auth/callback')
def auth_callback():
    try:
        token = google.authorize_access_token()
        user = google.parse_id_token(token)
    except Exception as e:
        return f"""
        <!DOCTYPE html>
        <html><head><title>Lỗi xác thực</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 100px; background-color: #f9fafb;">
            <h2 style="color: #dc2626; margin-bottom: 5px;">Lỗi Đăng Nhập</h2>
            <p style="color: #4b5563;">{str(e)}</p>
            <a href="/api/auth/login" style="display:inline-block; margin-top:20px; padding:10px 20px; background:#2563eb; color:white; font-weight: bold; text-decoration:none; border-radius:6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">Thử Đăng nhập Lại</a>
        </body></html>
        """, 400

    if user:
        email = user.get('email', '')
        auth_mode = os.getenv('AUTH_MODE', 'local').lower()
        if auth_mode == 'google' and not email.endswith('@ggg.com.vn'):
            return f"""
            <!DOCTYPE html>
            <html><head><title>Từ chối truy cập</title></head>
            <body style="font-family: Arial, sans-serif; text-align: center; padding-top: 100px; background-color: #f9fafb;">
                <h2 style="color: #dc2626; margin-bottom: 5px;">Truy cập bị từ chối</h2>
                <p style="color: #4b5563; font-size: 1.1rem;">Khách vị <strong>{email}</strong> không thuộc tổ chức nội bộ.</p>
                <p style="color: #6b7280; font-size: 0.9rem;">Vui lòng đăng nhập lại bằng email công ty mang đuôi @ggg.com.vn.</p>
                <a href="/api/auth/login" style="display:inline-block; margin-top:20px; padding:10px 20px; background:#2563eb; color:white; font-weight: bold; text-decoration:none; border-radius:6px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);">Chọn Tài khoản khác</a>
            </body></html>
            """, 403
            
        session['user'] = {
            'username': email.split('@')[0],
            'email': email,
            'role': 'admin' if email == 'ndtrunghieu.nus@gmail.com' else 'user',
            'allowed_chains': [],
            'allowed_pcs': []
        }
        return redirect('/')
    return "Đăng nhập thất bại.", 401

@app.route('/api/auth/logout')
def auth_logout():
    session.pop('user', None)
    return redirect('/')

@app.route('/api/auth/me')
def auth_me():
    if 'user' in session:
        return jsonify({'status': 'ok', 'user': session['user']})
    return jsonify({'status': 'unauthorized'}), 401

@app.route('/api/admin/users', methods=['GET', 'POST'])
def admin_users():
    if session.get('user', {}).get('role') != 'admin':
        return jsonify({'status': 'error', 'message': 'Forbidden'}), 403
        
    users = get_users()
    
    if request.method == 'GET':
        safe_users = []
        for u in users:
            su = dict(u)
            su.pop('password_hash', None)
            safe_users.append(su)
        return jsonify({'status': 'ok', 'users': safe_users})
        
    elif request.method == 'POST':
        data = request.json or {}
        action = data.get('action')
        username = data.get('username', '').strip()
        
        if not username:
            return jsonify({'status': 'error', 'message': 'Username is required'}), 400
            
        if action == 'create' or action == 'update':
            existing = next((u for u in users if u['username'].lower() == username.lower()), None)
            if action == 'create' and existing:
                return jsonify({'status': 'error', 'message': 'Username already exists'}), 400
                
            password = data.get('password')
            role = data.get('role', 'user')
            allowed_chains = data.get('allowed_chains', [])
            allowed_pcs = data.get('allowed_pcs', [])
            
            if not existing:
                if not password:
                    return jsonify({'status': 'error', 'message': 'Password required for new user'}), 400
                new_user = {
                    'username': username,
                    'password_hash': generate_password_hash(password),
                    'role': role,
                    'allowed_chains': allowed_chains,
                    'allowed_pcs': allowed_pcs
                }
                users.append(new_user)
            else:
                if password:
                    existing['password_hash'] = generate_password_hash(password)
                existing['role'] = role
                existing['allowed_chains'] = allowed_chains
                existing['allowed_pcs'] = allowed_pcs
                
            with open(USERS_FILE, 'w', encoding='utf-8') as f:
                json.dump(users, f, indent=4)
                
            return jsonify({'status': 'ok'})
            
        elif action == 'delete':
            if username.lower() == 'admin':
                return jsonify({'status': 'error', 'message': 'Cannot delete default admin'}), 400
            users = [u for u in users if u['username'].lower() != username.lower()]
            with open(USERS_FILE, 'w', encoding='utf-8') as f:
                json.dump(users, f, indent=4)
            return jsonify({'status': 'ok'})
            
        return jsonify({'status': 'error', 'message': 'Invalid action'}), 400


# ─── Logging: console + rotating file handler (UTF-8) ───
_log_format = '%(asctime)s [%(levelname)s] %(message)s'
logging.basicConfig(level=logging.INFO, format=_log_format)
logger = logging.getLogger(__name__)

_log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'flask.log')
try:
    _file_handler = RotatingFileHandler(
        _log_file, maxBytes=5 * 1024 * 1024, backupCount=3, encoding='utf-8'
    )
    _file_handler.setFormatter(logging.Formatter(_log_format))
    _file_handler.setLevel(logging.INFO)
    logging.getLogger().addHandler(_file_handler)
except Exception as _fh_err:
    logger.warning(f'Could not attach file log handler: {_fh_err}')

# ═══════════════════════════════════════════════════════════════
# DATABASE CONNECTION HELPERS
# ═══════════════════════════════════════════════════════════════

class MssqlCursorWrapper:
    """
    Thin wrapper around pymssql cursor that supports `as_dict` mode.
    pymssql natively supports as_dict on the cursor; this class provides
    a uniform interface used throughout the app.
    """
    def __init__(self, cursor, as_dict=False):
        self._cursor = cursor
        self.as_dict = as_dict

    def execute(self, *args, **kwargs):
        self._cursor.execute(*args, **kwargs)

    def fetchone(self):
        return self._cursor.fetchone()

    def fetchall(self):
        return self._cursor.fetchall()

    def close(self):
        self._cursor.close()


class MssqlConnWrapper:
    """Thin wrapper around pymssql connection for as_dict cursor support."""
    def __init__(self, conn, as_dict=False):
        self._conn = conn
        self._default_as_dict = as_dict

    def cursor(self, as_dict=False):
        # pymssql supports as_dict natively at cursor creation
        return MssqlCursorWrapper(
            self._conn.cursor(as_dict=as_dict or self._default_as_dict),
            as_dict=as_dict or self._default_as_dict
        )

    def close(self):
        self._conn.close()


_mssql_conn = None  # module-level singleton


def get_mssql_connection():
    """
    Return a persistent SQL Server connection via pymssql (cross-platform).
    Works on both Windows (local) and Linux (Render/Docker) without
    requiring ODBC drivers.
    """
    global _mssql_conn
    import pymssql  # cross-platform: no ODBC driver needed

    host     = os.getenv('MSSQL_HOST',     '192.168.222.13')
    user     = os.getenv('MSSQL_USER',     'misreader')
    db       = os.getenv('MSSQL_DATABASE', '')
    port     = int(os.getenv('MSSQL_PORT', 1433))
    password = os.getenv('MSSQL_PASSWORD')

    def _connect():
        logger.info(f"[DB] Opening new pymssql connection to {host}:{port} as {user}...")
        raw_conn = pymssql.connect(
            server=host,
            port=port,
            user=user,
            password=password,
            database=db,
            login_timeout=10,
            timeout=30,
            charset='UTF-8'
        )
        return MssqlConnWrapper(raw_conn)

    # Ping the existing connection before reusing it
    if _mssql_conn is not None:
        try:
            cur = _mssql_conn.cursor()
            cur.execute("SELECT 1")
            cur.close()
            return _mssql_conn
        except Exception:
            logger.warning("[DB] Stale connection detected -- reconnecting...")
            try:
                _mssql_conn.close()
            except Exception:
                pass
            _mssql_conn = None

    try:
        _mssql_conn = _connect()
        return _mssql_conn
    except Exception as e:
        logger.error(f"[DB] Connection failed to {host}: {e}")
        raise



def get_starrocks_connection():
    """Connect to StarRocks for Forecast data (MySQL protocol)."""
    import pymysql
    return pymysql.connect(
        host=os.getenv('STARROCKS_HOST', '192.168.221.200'),
        port=int(os.getenv('STARROCKS_PORT', 31234)),
        user=os.getenv('STARROCKS_USER', 'mis_admin'),
        password=os.getenv('STARROCKS_PASSWORD'),
        database=os.getenv('STARROCKS_DATABASE', 'datamart_mis_prod'),
        connect_timeout=15,
        read_timeout=30,
        charset='utf8mb4',
        cursorclass=pymysql.cursors.DictCursor
    )


def safe_float(val):
    """Safely convert database value to float."""
    if val is None:
        return 0.0
    try:
        return float(val)
    except (ValueError, TypeError):
        return 0.0


# ── Simple in-memory cache (TTL = 60 s) ──────────────────────────
import time as _time
_cache: dict = {}
_CACHE_TTL = 60  # seconds

def _cache_get(key):
    entry = _cache.get(key)
    if entry and (_time.time() - entry['ts'] < _CACHE_TTL):
        return entry['val']
    return None

def _cache_set(key, val):
    _cache[key] = {'ts': _time.time(), 'val': val}

def _cache_bust():
    """Clear all cached responses (call after a data refresh)."""
    _cache.clear()


# ═══════════════════════════════════════════════════════════════
# STATIC FILE SERVING
# ═══════════════════════════════════════════════════════════════

@app.route('/')
def serve_index():
    return send_from_directory('.', 'index.html')


@app.route('/css/<path:filename>')
def serve_css(filename):
    return send_from_directory('css', filename)


@app.route('/js/<path:filename>')
def serve_js(filename):
    return send_from_directory('js', filename)


# ═══════════════════════════════════════════════════════════════
# API 1: ACTUAL DATA (SQL Server)
# Table: DataMart.MIS.FC213_FACT_ACT
# Schema (long/vertical format):
#   pc               - restaurant code
#   indicator_code   - line item code (hierarchical: L1/L2/L3)
#   actual_numerator - the numeric value
#   datakey          - period in YYYYMM format (e.g. 202604)
# ═══════════════════════════════════════════════════════════════

ACTUAL_TABLE = "DataMart.MIS.FC213_FACT_ACT"
DAILY_SALES_TABLE = "DataMart.MIS.DAILY_SALES"


def _fetch_daily_sales_tc(conn, datekey, pc_raw=None, chain=None):
    """
    Fetch TC (GuestsCount) from DAILY_SALES for a given period.
    Considers both single/multiple restaurants (pc_raw) or chains (chain).
    """
    cursor = conn.cursor(as_dict=True)
    dk = int(datekey)
    year, month = dk // 100, dk % 100

    query = f"""
        SELECT SUM(CAST(ISNULL(GuestsCount, 0) AS FLOAT)) AS total_tc
        FROM {DAILY_SALES_TABLE}
        WHERE YEAR(ShiftDate) = %s AND MONTH(ShiftDate) = %s
    """
    params = [year, month]

    # Two-step lookup for target RestaurantCodes to prevent SQL Server deadlocks
    target_rest_codes = set()

    if pc_raw:
        pc_list = [p.strip() for p in pc_raw.split(',') if p.strip()]
        for p in pc_list:
            if len(p) >= 4:
                target_rest_codes.add(p[-4:])
    elif chain:
        chain_list = [c.strip() for c in chain.split(',') if c.strip()]
        if chain_list:
            chain_conds = " OR ".join(["pc LIKE %s"] * len(chain_list))
            chain_params = [f"{c}%" for c in chain_list]
            cursor.execute(f"SELECT DISTINCT RIGHT(RTRIM(pc), 4) AS rcode FROM {ACTUAL_TABLE} WHERE {chain_conds}", tuple(chain_params))
            for row in cursor.fetchall():
                if row.get('rcode'):
                    target_rest_codes.add(row['rcode'])
                    
    target_list = list(target_rest_codes)
    if (pc_raw or chain) and not target_list:
        # Filter provided but matched zero rest codes -> return 0
        cursor.close()
        return 0.0

    if target_list:
        placeholders = ', '.join(['%s'] * len(target_list))
        query += f" AND RestaurantCode IN ({placeholders})"
        params.extend(target_list)

    cursor.execute(query, tuple(params))
    row = cursor.fetchone()
    cursor.close()

    return safe_float(row['total_tc']) if row else 0.0


def _fetch_daily_sales_tc_by_period(conn, datekeys, pc_raw=None, chain=None):
    """
    Fetch TC (GuestsCount) from DAILY_SALES for multiple periods.
    Considers both single/multiple restaurants (pc_raw) or chains (chain).
    Returns: { datekey: total_tc, ... }
    """
    cursor = conn.cursor(as_dict=True)

    conditions = []
    params = []
    for dk in datekeys:
        dk_int = int(dk)
        conditions.append("(YEAR(ShiftDate) = %s AND MONTH(ShiftDate) = %s)")
        params.extend([dk_int // 100, dk_int % 100])

    if not conditions:
        cursor.close()
        return {}

    query = f"""
        SELECT YEAR(ShiftDate) * 100 + MONTH(ShiftDate) AS dk,
               SUM(CAST(ISNULL(GuestsCount, 0) AS FLOAT)) AS total_tc
        FROM {DAILY_SALES_TABLE}
        WHERE ({' OR '.join(conditions)})
    """

    target_rest_codes = set()
    if pc_raw:
        pc_list = [p.strip() for p in pc_raw.split(',') if p.strip()]
        for p in pc_list:
            if len(p) >= 4:
                target_rest_codes.add(p[-4:])
    elif chain:
        chain_list = [c.strip() for c in chain.split(',') if c.strip()]
        if chain_list:
            chain_conds = " OR ".join(["pc LIKE %s"] * len(chain_list))
            chain_params = [f"{c}%" for c in chain_list]
            cursor.execute(f"SELECT DISTINCT RIGHT(RTRIM(pc), 4) AS rcode FROM {ACTUAL_TABLE} WHERE {chain_conds}", tuple(chain_params))
            for row in cursor.fetchall():
                if row.get('rcode'):
                    target_rest_codes.add(row['rcode'])

    target_list = list(target_rest_codes)
    if (pc_raw or chain) and not target_list:
        cursor.close()
        return {}

    if target_list:
        placeholders = ', '.join(['%s'] * len(target_list))
        query += f" AND RestaurantCode IN ({placeholders})"
        params.extend(target_list)

    query += " GROUP BY YEAR(ShiftDate) * 100 + MONTH(ShiftDate)"

    cursor.execute(query, tuple(params))
    rows = cursor.fetchall()
    cursor.close()

    return {int(r['dk']): safe_float(r['total_tc']) for r in rows}


def _pc_filter_clause(pc_raw, params):
    """Return (sql_clause, updated_params) for comma-separated pc list."""
    if not pc_raw:
        return "", params
    pc_list = [p.strip() for p in pc_raw.split(',') if p.strip()]
    if len(pc_list) == 1:
        return " AND pc = %s", params + [pc_list[0]]
    placeholders = ', '.join(['%s'] * len(pc_list))
    return f" AND pc IN ({placeholders})", params + pc_list


@app.route('/api/actual', methods=['GET'])
def get_actual_data():
    """
    Fetch actual PnL rows from FC213_FACT_ACT.

    Query params:
        datakey  : (optional) Period YYYYMM, e.g. 202604
        pc       : (optional) Comma-separated restaurant codes
        from     : (optional) Start period YYYYMM
        to       : (optional) End period YYYYMM
        indicator: (optional) Filter by indicator_code
    Returns rows: [{ pc, indicator_code, actual_numerator, datakey }, ...]
    """
    try:
        datakey   = request.args.get('datakey') or request.args.get('datekey')
        pc_raw    = request.args.get('pc')
        date_from = request.args.get('from')
        date_to   = request.args.get('to')
        indicator = request.args.get('indicator')

        conn   = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        query  = f"SELECT pc, indicator_code, actual_numerator, datekey FROM {ACTUAL_TABLE} WHERE 1=1"
        params = []

        if datakey:
            query += " AND datekey = %s"
            params.append(int(datakey))
        if date_from:
            query += " AND datekey >= %s"
            params.append(int(date_from))
        if date_to:
            query += " AND datekey <= %s"
            params.append(int(date_to))
        if indicator:
            query += " AND indicator_code = %s"
            params.append(indicator)

        pc_clause, params = _pc_filter_clause(pc_raw, params)
        query += pc_clause

        # Default: last 6 months if no period filter
        if not datakey and not date_from and not date_to:
            now = datetime.now()
            six_ago_month = now.month - 6
            six_ago_year  = now.year
            if six_ago_month <= 0:
                six_ago_month += 12
                six_ago_year  -= 1
            query += " AND datekey >= %s"
            params.append(six_ago_year * 100 + six_ago_month)

        query += " ORDER BY datekey DESC, pc, indicator_code"

        logger.info(f"[ACTUAL] query params: {params}")
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        cursor.close()

        result = []
        for row in rows:
            result.append({
                'pc':               str(row.get('pc') or ''),
                'indicator_code':   str(row.get('indicator_code') or ''),
                'actual_numerator': safe_float(row.get('actual_numerator')),
                'datakey':          int(row['datekey']) if row.get('datekey') else None
            })

        logger.info(f"[ACTUAL] returned {len(result)} rows")
        return jsonify({
            'status': 'ok',
            'source': 'mssql',
            'table':  ACTUAL_TABLE,
            'count':  len(result),
            'data':   result
        })

    except Exception as e:
        logger.error(f"[ACTUAL] Error: {str(e)}")
        return jsonify({'status': 'error', 'source': 'mssql', 'message': str(e)}), 500


@app.route('/api/actual/columns', methods=['GET'])
def get_actual_columns():
    """Return distinct indicator_codes available in FC213_FACT_ACT."""
    try:
        conn   = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)
        cursor.execute(f"""
            SELECT DISTINCT indicator_code
            FROM {ACTUAL_TABLE}
            WHERE indicator_code IS NOT NULL AND indicator_code != ''
            ORDER BY indicator_code
        """)
        rows = cursor.fetchall()
        cursor.close()

        columns = [{'code': r['indicator_code'], 'type': 'line_item'} for r in rows]
        return jsonify({'status': 'ok', 'columns': columns, 'total': len(columns)})

    except Exception as e:
        logger.error(f"[ACTUAL/COLUMNS] Error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/actual/restaurants', methods=['GET'])
def get_restaurants():
    """Get distinct list of restaurant codes (pc) from FC213_FACT_ACT."""
    try:
        conn   = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)
        cursor.execute(f"""
            SELECT DISTINCT pc
            FROM {ACTUAL_TABLE}
            WHERE pc IS NOT NULL AND pc != ''
            ORDER BY pc
        """)
        rows = cursor.fetchall()
        restaurants = [r['pc'] for r in rows if r.get('pc')]
        filtered_restaurants = filter_restaurants_by_rbac(restaurants)

        return jsonify({
            'status':      'ok',
            'restaurants': filtered_restaurants,
            'count':       len(filtered_restaurants)
        })

    except Exception as e:
        logger.error(f"[RESTAURANTS] Error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/actual/periods', methods=['GET'])
def get_periods():
    """Get distinct list of available reporting periods from FC213_FACT_ACT."""
    try:
        conn   = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)
        cursor.execute(f"""
            SELECT DISTINCT datekey
            FROM {ACTUAL_TABLE}
            WHERE datekey IS NOT NULL
            ORDER BY datekey DESC
        """)
        rows = cursor.fetchall()
        cursor.close()

        periods = []
        for r in rows:
            dk    = int(r['datekey'])
            year  = dk // 100
            month = dk % 100
            periods.append({
                'datekey': dk,
                'year':    year,
                'month':   month,
                'label':   f"Tháng {month}/{year}"
            })

        return jsonify({'status': 'ok', 'periods': periods, 'count': len(periods)})

    except Exception as e:
        logger.error(f"[PERIODS] Error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/actual/datekeys', methods=['GET'])
def get_actual_datekeys():
    """Return distinct datakeys from FC213_FACT_ACT, newest first."""
    try:
        conn   = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)
        cursor.execute(f"""
            SELECT DISTINCT TOP 24 datekey
            FROM {ACTUAL_TABLE}
            WHERE datekey IS NOT NULL
            ORDER BY datekey DESC
        """)
        rows = cursor.fetchall()
        cursor.close()

        datakeys = [int(r['datekey']) for r in rows]
        return jsonify({'status': 'ok', 'datekeys': datakeys})

    except Exception as e:
        logger.error(f"[DATEKEYS] Error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/actual/summary', methods=['GET'])
def get_actual_summary():
    """
    Aggregate actual data for a period → returns dict keyed by indicator_code.
    Long-format: SUM(actual_numerator) GROUP BY indicator_code.

    Query params:
        datakey / datekey : (optional) Period YYYYMM. Auto-uses latest if omitted.
        pc                : (optional) Comma-separated pc codes.
    Returns:
        { "status": "ok", "datekey": 202604, "data": { "DT01": 123456, ... } }
    """
    try:
        datakey = request.args.get('datakey') or request.args.get('datekey')
        pc_raw  = request.args.get('pc')

        # ── Cache hit ──
        cache_key = f"summary:{datakey or 'latest'}:{pc_raw or 'ALL'}"
        cached = _cache_get(cache_key)
        if cached:
            logger.info(f"[ACTUAL/SUMMARY] Cache hit → {cache_key}")
            return jsonify(cached)

        conn   = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        # Auto-detect latest datekey if not supplied
        if not datakey:
            cursor.execute(f"""
                SELECT TOP 1 datekey
                FROM {ACTUAL_TABLE}
                WHERE datekey IS NOT NULL
                ORDER BY datekey DESC
            """)
            dk_row = cursor.fetchone()
            if not dk_row:
                cursor.close()
                return jsonify({'status': 'ok', 'data': {}, 'message': 'No data in table'})
            datakey = str(dk_row['datekey'])

        # Build aggregation query: SUM actual_numerator per indicator_code
        query  = f"""
            SELECT indicator_code,
                   SUM(CAST(ISNULL(actual_numerator, 0) AS FLOAT)) AS total
            FROM {ACTUAL_TABLE}
            WHERE datekey = %s
              AND indicator_code IS NOT NULL
              AND indicator_code != ''
        """
        params = [int(datakey)]

        pc_clause, params = _pc_filter_clause(pc_raw, params)
        query += pc_clause + " GROUP BY indicator_code"

        logger.info(f"[ACTUAL/SUMMARY] datekey={datakey} pc={pc_raw}")
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        cursor.close()

        if not rows:
            return jsonify({
                'status':  'ok',
                'data':    {},
                'datekey': int(datakey),
                'message': 'No rows for this filter'
            })

        # Build {indicator_code: value} dict
        result = {}
        for row in rows:
            code = str(row['indicator_code']).strip()
            val  = safe_float(row['total'])
            result[code] = val

        # ── Merge TC from DAILY_SALES (GuestsCount) ──
        try:
            tc_val = _fetch_daily_sales_tc(conn, datakey, pc_raw)
            if tc_val > 0:
                result['TC'] = tc_val
                # Compute TA = DT01 / TC (average revenue per guest)
                dt01 = result.get('DT01', 0)
                if tc_val > 0:
                    result['TA'] = round(dt01 / tc_val, 2)
                else:
                    result['TA'] = 0
                logger.info(f"[ACTUAL/SUMMARY] TC={tc_val} from DAILY_SALES, TA={result.get('TA', 0)}")
        except Exception as e:
            logger.warning(f"[ACTUAL/SUMMARY] Could not fetch TC from DAILY_SALES: {e}")

        return jsonify({
            'status':     'ok',
            'datekey':    int(datakey),
            'restaurant': pc_raw or 'ALL',
            'data':       result
        })


    except Exception as e:
        logger.error(f"[ACTUAL/SUMMARY] Error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500





# ═══════════════════════════════════════════════════════════════
# API 2: FORECAST DATA (StarRocks)
# Table: DataMart.MIS.v_dim_manual_fc_operation_report_forecast_pnl
# ═══════════════════════════════════════════════════════════════

@app.route('/api/forecast', methods=['GET'])
def get_forecast_data():
    """
    Fetch forecast PnL data from StarRocks.
    
    Query params:
        datekey  : (optional) Filter by specific period
        pc       : (optional) Filter by restaurant code
        from     : (optional) Start period
        to       : (optional) End period
        limit    : (optional) Max rows (default 1000)
    """
    try:
        datekey = request.args.get('datekey')
        pc = request.args.get('pc')
        date_from = request.args.get('from')
        date_to = request.args.get('to')
        limit = request.args.get('limit', 1000, type=int)

        conn = get_starrocks_connection()
        cursor = conn.cursor()

        query = "SELECT * FROM DataMart.MIS.v_dim_manual_fc_operation_report_forecast_pnl WHERE 1=1"
        params = []

        if datekey:
            query += " AND datekey = %s"
            params.append(int(datekey))
        if pc:
            query += " AND pc = %s"
            params.append(pc)
        if date_from:
            query += " AND datekey >= %s"
            params.append(int(date_from))
        if date_to:
            query += " AND datekey <= %s"
            params.append(int(date_to))

        query += f" ORDER BY datekey DESC LIMIT {limit}"

        logger.info(f"[FORECAST] Executing query with params: {params}")
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        # DictCursor already returns dicts
        result = []
        for row in rows:
            clean_row = {}
            for key, val in row.items():
                if val is None:
                    clean_row[key] = None
                elif isinstance(val, (int, float)):
                    clean_row[key] = val
                else:
                    try:
                        clean_row[key] = float(val)
                    except (ValueError, TypeError):
                        clean_row[key] = str(val)
            result.append(clean_row)

        cursor.close()

        logger.info(f"[FORECAST] Returned {len(result)} rows")
        return jsonify({
            'status': 'ok',
            'source': 'starrocks',
            'table': 'DataMart.MIS.v_dim_manual_fc_operation_report_forecast_pnl',
            'count': len(result),
            'data': result
        })

    except Exception as e:
        logger.error(f"[FORECAST] Error: {str(e)}")
        return jsonify({
            'status': 'error',
            'source': 'starrocks',
            'message': str(e)
        }), 500


@app.route('/api/forecast/columns', methods=['GET'])
def get_forecast_columns():
    """Get column names from the Forecast table."""
    try:
        conn = get_starrocks_connection()
        cursor = conn.cursor()

        cursor.execute("""
            SELECT * FROM DataMart.MIS.v_dim_manual_fc_operation_report_forecast_pnl LIMIT 1
        """)
        row = cursor.fetchone()

        columns = []
        if row:
            for key in row.keys():
                col_lower = key.lower()
                if col_lower not in ('datekey', 'pc', 'tc'):
                    columns.append({'code': key, 'type': 'line_item'})
                else:
                    columns.append({'code': key, 'type': 'dimension'})

        cursor.close()

        return jsonify({
            'status': 'ok',
            'columns': columns,
            'total': len(columns)
        })

    except Exception as e:
        logger.error(f"[FORECAST/COLUMNS] Error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ═══════════════════════════════════════════════════════════════
# API 3: COMBINED — Actual vs Forecast for Dashboard
# ═══════════════════════════════════════════════════════════════

@app.route('/api/pnl', methods=['GET'])
@limiter.limit("20 per minute")
def get_pnl_combined():
    """
    Combined endpoint: fetch both Actual + Forecast for a given period/restaurant.
    Merges data into a unified PnL structure keyed by indicator_code.

    Query params:
        datakey / datekey : (optional) Period YYYYMM. Uses latest if omitted.
        pc                : (optional) Comma-separated restaurant codes
    """
    try:
        datakey = request.args.get('datakey') or request.args.get('datekey')
        pc_raw  = request.args.get('pc')

        actual_data   = {}
        forecast_data = {}
        errors        = []

        # ── Fetch Actual from MSSQL (long-format) ──
        try:
            conn_ms = get_mssql_connection()
            cur_ms  = conn_ms.cursor(as_dict=True)

            # Auto-detect latest datakey
            if not datakey:
                cur_ms.execute(f"SELECT TOP 1 datekey FROM {ACTUAL_TABLE} WHERE datekey IS NOT NULL ORDER BY datekey DESC")
                dk_row = cur_ms.fetchone()
                datakey = str(dk_row['datekey']) if dk_row else None

            if datakey:
                q      = f"""
                    SELECT indicator_code,
                           SUM(CAST(ISNULL(actual_numerator,0) AS FLOAT)) AS total
                    FROM {ACTUAL_TABLE}
                    WHERE datekey = %s
                      AND indicator_code IS NOT NULL AND indicator_code != ''
                """
                params = [int(datakey)]
                pc_clause, params = _pc_filter_clause(pc_raw, params)
                q += pc_clause + " GROUP BY indicator_code"

                cur_ms.execute(q, tuple(params))
                for row in cur_ms.fetchall():
                    actual_data[str(row['indicator_code']).strip()] = safe_float(row['total'])

            cur_ms.close()
            # NOTE: Do NOT close conn_ms here — it is the module-level
            # singleton managed by get_mssql_connection(). Closing it
            # would break subsequent requests that reuse the same socket.
        except Exception as e:
            errors.append(f"MSSQL: {str(e)}")
            logger.error(f"[PNL/ACTUAL] {str(e)}")

        # ── Fetch Forecast from StarRocks (wide-format) ──
        try:
            conn_sr = get_starrocks_connection()
            cur_sr  = conn_sr.cursor()

            q = "SELECT * FROM DataMart.MIS.v_dim_manual_fc_operation_report_forecast_pnl WHERE datekey = %s"
            p = [int(datakey)] if datakey else []
            if not datakey:
                raise ValueError("No datakey available")
            if pc_raw:
                pc_list = [x.strip() for x in pc_raw.split(',') if x.strip()]
                if len(pc_list) == 1:
                    q += " AND pc = %s"; p.append(pc_list[0])
                elif len(pc_list) > 1:
                    q += f" AND pc IN ({','.join(['%s']*len(pc_list))})"; p.extend(pc_list)

            cur_sr.execute(q, tuple(p))
            rows = cur_sr.fetchall()
            if rows:
                for row in rows:
                    for key, val in row.items():
                        if key.lower() not in ('datekey', 'pc'):
                            forecast_data[key] = forecast_data.get(key, 0) + safe_float(val)

            cur_sr.close()
            conn_sr.close()
        except Exception as e:
            errors.append(f"StarRocks: {str(e)}")
            logger.error(f"[PNL/FORECAST] {str(e)}")

        # ── Build unified line items ──
        all_codes  = set(list(actual_data.keys()) + list(forecast_data.keys()))
        line_items = []
        for code in sorted(all_codes):
            act         = actual_data.get(code, 0)
            fct         = forecast_data.get(code, 0)
            variance    = act - fct
            variance_pct = (variance / abs(fct) * 100) if fct != 0 else 0

            line_items.append({
                'code':          code,
                'actual':        round(act, 2),
                'forecast':      round(fct, 2),
                'variance':      round(variance, 2),
                'variance_pct':  round(variance_pct, 2)
            })

        return jsonify({
            'status':     'ok',
            'datakey':    int(datakey) if datakey else None,
            'restaurant': pc_raw or 'ALL',
            'line_items': line_items,
            'errors':     errors if errors else None
        })

    except Exception as e:
        logger.error(f"[PNL] Error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500



# ═══════════════════════════════════════════════════════════════
# API 4: CHAIN / RESTAURANT HIERARCHY
# Chain = first 4 chars of pc code
# ═══════════════════════════════════════════════════════════════

@app.route('/api/chains', methods=['GET'])
def get_chains():
    """
    Get chain → restaurant hierarchy.
    Chains are identified by the first 4 characters of pc.
    Source: FC213_FACT_ACT
    Returns: { chains: [ { chain: '10GG', restaurants: ['10GG4102', ...] } ] }
    """
    try:
        conn   = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        cursor.execute(f"""
            SELECT DISTINCT pc
            FROM {ACTUAL_TABLE}
            WHERE pc IS NOT NULL AND pc != ''
            ORDER BY pc
        """)
        rows = cursor.fetchall()
        rows = cursor.fetchall()
        cursor.close()

        all_pcs = [str(r['pc']).strip() for r in rows if r['pc']]
        filtered_pcs = filter_restaurants_by_rbac(all_pcs)

        # Group by first 4 characters
        chain_map = {}
        for pc in filtered_pcs:
            if len(pc) >= 4:
                chain_prefix = pc[:4]
                if chain_prefix not in chain_map:
                    chain_map[chain_prefix] = []
                chain_map[chain_prefix].append(pc)

        chains = []
        for prefix in sorted(chain_map.keys()):
            chains.append({
                'chain':       prefix,
                'count':       len(chain_map[prefix]),
                'restaurants': chain_map[prefix]
            })

        return jsonify({
            'status':             'ok',
            'chains':             chains,
            'total_chains':       len(chains),
            'total_restaurants':  sum(c['count'] for c in chains)
        })

    except Exception as e:
        logger.error(f"[CHAINS] Error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500



# ═══════════════════════════════════════════════════════════════
# API 5: MULTI-PERIOD ACTUAL TREND
# For building historical base data for forecast
# ═══════════════════════════════════════════════════════════════

@app.route('/api/actual/trend', methods=['GET'])
def get_actual_trend():
    """
    Get aggregated actual data across multiple periods.
    Long-format: aggregates SUM(actual_numerator) per (datakey, indicator_code).
    Returns pivoted result: [ { datakey, DT01: val, CP01: val, ... }, ... ]

    Query params:
        months : (optional) Number of months to look back (default 12)
        pc     : (optional) Comma-separated restaurant codes
        chain  : (optional) Chain prefix (first 4 chars)
    """
    try:
        months = request.args.get('months', 12, type=int)
        pc_raw = request.args.get('pc')
        chain  = request.args.get('chain')

        conn   = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        # Build period list
        now = datetime.now()
        periods = []
        for i in range(months):
            m = now.month - i
            y = now.year
            while m <= 0:
                m += 12
                y -= 1
            periods.append(y * 100 + m)

        where_parts = [f"datekey IN ({','.join(['%s'] * len(periods))})"]
        params = list(periods)

        if pc_raw:
            pc_clause, params = _pc_filter_clause(pc_raw, params)
            where_parts.append(pc_clause.lstrip(" AND "))
        elif chain:
            where_parts.append("LEFT(pc, 4) = %s")
            params.append(chain)

        where_sql = " AND ".join(where_parts)

        query = f"""
            SELECT datekey, indicator_code,
                   SUM(CAST(ISNULL(actual_numerator, 0) AS FLOAT)) AS total
            FROM {ACTUAL_TABLE}
            WHERE {where_sql}
              AND indicator_code IS NOT NULL AND indicator_code != ''
            GROUP BY datekey, indicator_code
            ORDER BY datekey ASC, indicator_code
        """

        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        cursor.close()

        # Pivot into { datakey: { indicator_code: value } }
        pivoted = {}
        for row in rows:
            dk   = int(row['datekey'])
            code = str(row['indicator_code']).strip()
            val  = safe_float(row['total'])
            if dk not in pivoted:
                pivoted[dk] = {'datekey': dk}
            pivoted[dk][code] = val

        result = sorted(pivoted.values(), key=lambda x: x['datekey'])

        return jsonify({
            'status':          'ok',
            'months_requested': months,
            'filter':          pc_raw or chain or 'ALL',
            'periods_found':   len(result),
            'data':            result
        })

    except Exception as e:
        logger.error(f"[ACTUAL/TREND] Error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500



# ═══════════════════════════════════════════════════════════════
# API 6: FORECAST ENGINE — Compute projections
# ═══════════════════════════════════════════════════════════════

@app.route('/api/forecast/compute', methods=['POST'])
@limiter.limit("15 per minute")
def compute_forecast():
    """
    Compute forecast projections based on actual historical data.

    POST body (JSON):
        horizon   : 1 | 3 | 6 | 12 (months to forecast)
        method    : 'historical' | 'fixed' | 'anchor' | 'percent_revenue'
        pc        : (optional) single restaurant
        chain     : (optional) chain prefix
        params    : { growth_rate, fixed_values, anchor_period, ... }
    """
    try:
        body = request.get_json() or {}
        horizon = body.get('horizon', 1)
        method = body.get('method', 'historical')
        pc = body.get('pc')
        chain = body.get('chain')
        method_params = body.get('params', {})

        # ── Step 1: Fetch historical actual data from FC213_FACT_ACT (long-format) ──
        conn = get_mssql_connection()
        cursor = conn.cursor(as_dict=True)

        now = datetime.now()
        periods = []
        for i in range(12):
            m = now.month - i
            y = now.year
            while m <= 0:
                m += 12
                y -= 1
            periods.append(y * 100 + m)

        where_parts = [f"datekey IN ({','.join(['%s'] * len(periods))})"]
        params_sql  = list(periods)

        if pc:
            pc_clause, params_sql = _pc_filter_clause(pc if isinstance(pc, str) else ','.join(pc), params_sql)
            where_parts.append(pc_clause.lstrip(" AND "))
        elif chain:
            # Handle comma-separated multiple chains (e.g. "0000,01HP,03HN")
            chain_list = [c.strip() for c in (chain if isinstance(chain, str) else ','.join(chain)).split(',') if c.strip()]
            if len(chain_list) == 1:
                where_parts.append("LEFT(pc, 4) = %s")
                params_sql.append(chain_list[0])
            else:
                placeholders = ', '.join(['%s'] * len(chain_list))
                where_parts.append(f"LEFT(pc, 4) IN ({placeholders})")
                params_sql.extend(chain_list)

        where_parts.append("indicator_code IS NOT NULL AND indicator_code != ''")

        query = f"""
            SELECT datekey, indicator_code,
                   SUM(CAST(ISNULL(actual_numerator, 0) AS FLOAT)) AS total
            FROM {ACTUAL_TABLE}
            WHERE {' AND '.join(where_parts)}
            GROUP BY datekey, indicator_code
            ORDER BY datekey ASC, indicator_code
        """

        cursor.execute(query, tuple(params_sql))
        raw_rows = cursor.fetchall()
        cursor.close()

        # Pivot long-format into { datakey: { indicator_code: value } }
        pivoted_hist = {}
        line_item_codes_set = set()
        for row in raw_rows:
            dk   = int(row['datekey'])
            code = str(row['indicator_code']).strip()
            val  = safe_float(row['total'])
            if dk not in pivoted_hist:
                pivoted_hist[dk] = {}
            pivoted_hist[dk][code] = val
            line_item_codes_set.add(code)

        hist_rows        = [dict(datekey=dk, **vals) for dk, vals in sorted(pivoted_hist.items())]
        line_item_codes  = sorted(line_item_codes_set)

        # ── Merge TC from DAILY_SALES into historical data ──
        try:
            hist_datekeys = sorted(pivoted_hist.keys())
            tc_by_period = _fetch_daily_sales_tc_by_period(
                conn, hist_datekeys, pc_raw=pc, chain=chain
            )
            for hr in hist_rows:
                dk = int(hr['datekey'])
                tc_val = tc_by_period.get(dk, 0)
                if tc_val > 0:
                    hr['TC'] = tc_val
                    dt01 = safe_float(hr.get('DT01', 0))
                    hr['TA'] = round(dt01 / tc_val, 2) if tc_val > 0 else 0
                    if 'TC' not in line_item_codes_set:
                        line_item_codes_set.add('TC')
                    if 'TA' not in line_item_codes_set:
                        line_item_codes_set.add('TA')
            line_item_codes = sorted(line_item_codes_set)
            logger.info(f"[FORECAST/COMPUTE] Merged TC from DAILY_SALES for {len(tc_by_period)} periods")
        except Exception as e:
            logger.warning(f"[FORECAST/COMPUTE] Could not merge TC from DAILY_SALES: {e}")

        if not hist_rows:
            return jsonify({'status': 'ok', 'message': 'No historical data found', 'projections': []})

        # ── Step 2: Build historical series per line item ──
        historical   = {}
        hist_periods = []
        for row in hist_rows:
            dk = int(row['datekey'])
            hist_periods.append(dk)
            for code in line_item_codes:
                if code not in historical:
                    historical[code] = []
                historical[code].append({
                    'datekey': dk,
                    'value':   safe_float(row.get(code, 0))
                })

        # ── Step 3: Compute projections ──
        last_period = hist_periods[-1] if hist_periods else now.year * 100 + now.month
        future_periods = []
        lp_year = last_period // 100
        lp_month = last_period % 100
        for i in range(1, horizon + 1):
            fm = lp_month + i
            fy = lp_year
            while fm > 12:
                fm -= 12
                fy += 1
            future_periods.append(fy * 100 + fm)

        # ── Step 2b: Read per-item configs from request ──
        item_configs = body.get('item_configs', {})

        projections = []
        for fp in future_periods:
            period_data = {'datekey': fp}
            idx = future_periods.index(fp) + 1

            for code in line_item_codes:
                series = historical.get(code, [])
                values = [s['value'] for s in series]

                # Resolve per-item method (fallback to global)
                item_cfg = item_configs.get(code, {})
                item_method = item_cfg.get('method', method)

                if item_method == 'historical':
                    growth_rate = (item_cfg.get('growth_rate', method_params.get('growth_rate', 5.0))) / 100.0
                    lookback = item_cfg.get('lookback', method_params.get('lookback', 3))
                    recent = values[-lookback:] if len(values) >= lookback else values
                    avg_base = sum(recent) / len(recent) if recent else 0
                    period_data[code] = round(avg_base * ((1 + growth_rate) ** idx), 2)

                elif item_method == 'fixed':
                    fixed_val = item_cfg.get('fixed_value')
                    if fixed_val is not None:
                        period_data[code] = fixed_val
                    else:
                        fixed_vals = method_params.get('fixed_values', {})
                        period_data[code] = fixed_vals.get(code, values[-1] if values else 0)

                elif item_method == 'anchor':
                    anchor_dk = item_cfg.get('anchor_period', method_params.get('anchor_period'))
                    multiplier = item_cfg.get('multiplier', method_params.get('multiplier', 1.05))
                    buffer_val = item_cfg.get('buffer', method_params.get('buffer', 0))
                    anchor_val = 0
                    
                    if str(anchor_dk).startswith('avg_'):
                        months_to_avg = int(str(anchor_dk).split('_')[1])
                        recent_vals = values[-months_to_avg:] if len(values) >= months_to_avg else values
                        anchor_val = sum(recent_vals) / len(recent_vals) if recent_vals else 0
                    else:
                        anchor_dk = int(anchor_dk) if anchor_dk else (hist_periods[-1] if hist_periods else None)
                        for s in series:
                            if s['datekey'] == anchor_dk:
                                anchor_val = s['value']
                                break
                        if anchor_val == 0 and values:
                            anchor_val = values[-1]
                            
                    period_data[code] = round(anchor_val * (multiplier ** idx) + buffer_val, 2)

                elif item_method == 'percent_revenue':
                    base_dk = item_cfg.get('base_period', method_params.get('base_period',
                        hist_periods[-1] if hist_periods else None))
                    
                    if str(base_dk).startswith('avg_'):
                        months_to_avg = int(str(base_dk).split('_')[1])
                        recent_dks = hist_periods[-months_to_avg:] if len(hist_periods) >= months_to_avg else hist_periods
                        sum_item = 0
                        sum_rev = 0
                        for row_h in hist_rows:
                            if int(row_h['datekey']) in recent_dks:
                                sum_item += safe_float(row_h.get(code, 0))
                                dt01 = safe_float(row_h.get('DT01', 0))
                                dt02 = safe_float(row_h.get('DT02', 0))
                                dt03 = safe_float(row_h.get('DT03', 0))
                                dt04 = safe_float(row_h.get('DT04', 0))
                                sum_rev += (dt01 - dt02 - dt03 - dt04)
                        ratio = sum_item / sum_rev if sum_rev != 0 else 0
                    else:
                        base_dk = int(base_dk) if base_dk else (hist_periods[-1] if hist_periods else None)
                        base_item_val = 0
                        base_revenue = 0
                        for row_h in hist_rows:
                            if int(row_h['datekey']) == base_dk:
                                base_item_val = safe_float(row_h.get(code, 0))
                                dt01 = safe_float(row_h.get('DT01', 0))
                                dt02 = safe_float(row_h.get('DT02', 0))
                                dt03 = safe_float(row_h.get('DT03', 0))
                                dt04 = safe_float(row_h.get('DT04', 0))
                                base_revenue = dt01 - dt02 - dt03 - dt04
                                break
                        ratio = base_item_val / base_revenue if base_revenue != 0 else 0

                    rev_growth = (item_cfg.get('revenue_growth', method_params.get('revenue_growth', 5.0))) / 100.0
                    last_rev = 0
                    if hist_rows:
                        last_row = hist_rows[-1]
                        last_rev = (safe_float(last_row.get('DT01', 0))
                                    - safe_float(last_row.get('DT02', 0))
                                    - safe_float(last_row.get('DT03', 0))
                                    - safe_float(last_row.get('DT04', 0)))
                    proj_rev = last_rev * ((1 + rev_growth) ** idx)
                    period_data[code] = round(proj_rev * ratio, 2)

                else:
                    period_data[code] = values[-1] if values else 0

            projections.append(period_data)

        # ── Step 4: Fetch previous forecast for comparison ──
        prev_forecast = {}
        try:
            conn_sr = get_starrocks_connection()
            cur_sr = conn_sr.cursor()

            prev_dk = hist_periods[-1] if hist_periods else None
            if prev_dk:
                q = "SELECT * FROM DataMart.MIS.v_dim_manual_fc_operation_report_forecast_pnl WHERE datekey = %s"
                params_sr = [prev_dk]
                if pc:
                    pc_list_sr = [x.strip() for x in pc.split(',') if x.strip()]
                    if len(pc_list_sr) == 1:
                        q += " AND pc = %s"
                        params_sr.append(pc_list_sr[0])
                    else:
                        q += f" AND pc IN ({','.join(['%s'] * len(pc_list_sr))})"
                        params_sr.extend(pc_list_sr)
                elif chain:
                    chain_list = [c.strip() for c in chain.split(',') if c.strip()]
                    if len(chain_list) == 1:
                        q += " AND LEFT(pc, 4) = %s"
                        params_sr.append(chain_list[0])
                    else:
                        q += f" AND LEFT(pc, 4) IN ({','.join(['%s'] * len(chain_list))})"
                        params_sr.extend(chain_list)

                cur_sr.execute(q, tuple(params_sr))
                fc_rows = cur_sr.fetchall()
                for row in fc_rows:
                    for key, val in row.items():
                        kl = key.lower()
                        if kl not in ('datekey', 'pc'):
                            prev_forecast[key] = prev_forecast.get(key, 0) + safe_float(val)

            cur_sr.close()
            conn_sr.close()
        except Exception as e:
            logger.warning(f"[FORECAST/COMPUTE] Could not fetch previous forecast: {str(e)}")

        return jsonify({
            'status': 'ok',
            'method': method,
            'horizon': horizon,
            'filter': pc or chain or 'ALL',
            'historical_periods': hist_periods,
            'line_items': line_item_codes,
            'historical': [{k: (int(v) if k == 'datekey' else v) for k, v in row.items()} for row in hist_rows],
            'projections': projections,
            'previous_forecast': prev_forecast if prev_forecast else None
        })

    except Exception as e:
        logger.error(f"[FORECAST/COMPUTE] Error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ═══════════════════════════════════════════════════════════════
# HEALTH CHECK & CONNECTION TEST
# ═══════════════════════════════════════════════════════════════

@app.route('/api/template/import_pnl', methods=['GET'])
def download_import_template():
    """Generate and return an Excel template for multi-period PnL import."""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    import io
    
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "PnL Import Data"
    
    # Define styles
    header_font = Font(bold=True, color='FFFFFF')
    header_fill = PatternFill(start_color='1F4E78', end_color='1F4E78', fill_type='solid')
    align_center = Alignment(horizontal='center')
    
    # Columns: Code | Name | <last 12 periods>
    now = datetime.now()
    periods = []
    for i in range(12):
        m = now.month - i
        y = now.year
        while m <= 0:
            m += 12
            y -= 1
        periods.append(y * 100 + m)
    
    # Reversed so chronological (oldest to newest left to right)
    periods = list(reversed(periods))
    
    # Headers
    headers = ["Line Item Code", "Tên chỉ tiêu"] + [str(dk) for dk in periods]
    ws.append(headers)
    
    for col_idx, cell in enumerate(ws[1], 1):
        cell.font = header_font
        cell.fill = header_fill
        cell.alignment = align_center
        ws.column_dimensions[openpyxl.utils.get_column_letter(col_idx)].width = 20 if col_idx == 2 else 15
        
    # Data Rows (using global line items)
    for code, details in line_items_dict.items():
        row = [code, details['name']] + [""] * len(periods)
        ws.append(row)
        
    # Save to memory and return
    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    
    return send_file(
        out,
        download_name='PnL_Import_Template.xlsx',
        as_attachment=True,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

@app.route('/api/health', methods=['GET'])
def health_check():
    """Test connectivity to both databases."""
    status = {'mssql': 'unknown', 'starrocks': 'unknown'}

    # Test MSSQL
    try:
        conn = get_mssql_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        status['mssql'] = 'connected'
    except Exception as e:
        status['mssql'] = f'error: {str(e)}'

    # Test StarRocks
    try:
        conn = get_starrocks_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT 1")
        cursor.close()
        status['starrocks'] = 'connected'
    except Exception as e:
        status['starrocks'] = f'error: {str(e)}'

    overall = 'healthy' if 'connected' in status['mssql'] and 'connected' in status['starrocks'] else 'degraded'

    return jsonify({
        'status': overall,
        'databases': status,
        'timestamp': datetime.now().isoformat()
    })




@app.route('/api/cache/bust', methods=['POST'])
def bust_cache():
    """Invalidate all cached responses (call when user clicks 'Cập nhật')."""
    _cache_bust()
    logger.info("[CACHE] Busted all cached responses")
    return jsonify({'status': 'ok', 'message': 'Cache cleared'})

# ═══════════════════════════════════════════════════════════════
# API: MASTER RESTAURANT LIST (from Excel file)
# Source: Open_Close.xlsx → Sheet "Master"
# Columns: C=Code Report (New), E=Status, H=Store, J=Brand
# ═══════════════════════════════════════════════════════════════

MASTER_EXCEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'Open_Close.xlsx')

# In-memory cache for master list (avoid re-reading Excel every request)
_master_cache = {'data': None, 'loaded_at': None}

# Log storage (persisted in JSON file)
MASTER_LOG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'master_load_log.json')


def _read_master_excel():
    """
    Read the Master sheet from Open_Close.xlsx.
    Returns deduplicated list of restaurants with valid codes.

    Excel structure (header at row 5):
      Col C (idx 2): Code Report (New) → pc code
      Col E (idx 4): Status → ACTIVE / CLOSED / etc.
      Col H (idx 7): Store → restaurant name
      Col J (idx 9): Brand → brand code
      Col D (idx 3): Area → region
    """
    import openpyxl

    if not os.path.exists(MASTER_EXCEL_PATH):
        raise FileNotFoundError(f"Master file not found: {MASTER_EXCEL_PATH}")

    wb = openpyxl.load_workbook(MASTER_EXCEL_PATH, read_only=True, data_only=True)
    ws = wb['Master']

    seen = set()
    restaurants = []

    # Data starts at row 6 (row 5 is header)
    for row in ws.iter_rows(min_row=6, values_only=True):
        code_raw = row[2]    # col C: Code Report (New)
        status   = row[4]    # col E: Status
        store    = row[7]    # col H: Store name
        brand    = row[9]    # col J: Brand
        area     = row[3]    # col D: Area

        # Skip empty / invalid codes
        if not code_raw:
            continue
        code = str(code_raw).strip()
        if not code or code.lower() in ('chưa có code', 'check', 'none', ''):
            continue

        # Deduplicate: keep first occurrence only
        if code in seen:
            continue
        seen.add(code)

        # Map status
        status_str = str(status).strip() if status else ''
        status_upper = status_str.upper()

        if status_upper == 'ACTIVE':
            mapped_status = 'ACTIVE'
        elif status_upper == 'CLOSED':
            mapped_status = 'CLOSED'
        else:
            # Others: Double code, Not yet open, Waiting for open,
            # Chưa triển khai, Lock mb chưa thi công → treat as LOCKED
            mapped_status = 'CLOSED'

        restaurants.append({
            'pc':     code,
            'status': mapped_status,
            'status_raw': status_str,
            'store':  str(store).strip() if store else '',
            'brand':  str(brand).strip() if brand else '',
            'area':   str(area).strip() if area else '',
        })

    wb.close()
    return restaurants


def _save_master_log(action, count, details=''):
    """Append a log entry to master_load_log.json"""
    try:
        logs = []
        if os.path.exists(MASTER_LOG_FILE):
            with open(MASTER_LOG_FILE, 'r', encoding='utf-8') as f:
                logs = json.load(f)
        logs.append({
            'timestamp': datetime.now().isoformat(),
            'action':    action,
            'count':     count,
            'details':   details
        })
        # Keep last 100 log entries
        logs = logs[-100:]
        with open(MASTER_LOG_FILE, 'w', encoding='utf-8') as f:
            json.dump(logs, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"[MASTER LOG] Failed to write log: {e}")


@app.route('/api/master/restaurants', methods=['GET'])
def get_master_restaurants():
    """
    Return the master restaurant list from Open_Close.xlsx.
    Cross-references with DB to mark which PCs have actual data.

    Query params:
        refresh : (optional) If 'true', force re-read from Excel file
        status  : (optional) Filter by status: ACTIVE, CLOSED
    Returns:
        { restaurants: [...], count, db_matched, log }
    """
    try:
        force_refresh = request.args.get('refresh', '').lower() == 'true'
        status_filter = request.args.get('status', '').upper()

        # Check cache
        if not force_refresh and _master_cache['data'] is not None:
            master_list = _master_cache['data']
            logger.info(f"[MASTER] Using cached data ({len(master_list)} restaurants)")
        else:
            # Read from Excel
            master_list = _read_master_excel()
            _master_cache['data'] = master_list
            _master_cache['loaded_at'] = datetime.now().isoformat()
            logger.info(f"[MASTER] Loaded {len(master_list)} restaurants from Excel")
            _save_master_log('LOAD_EXCEL', len(master_list),
                             f"Loaded from {MASTER_EXCEL_PATH}")

        # Cross-reference with DB
        db_pcs = set()
        try:
            conn = get_mssql_connection()
            cursor = conn.cursor(as_dict=True)
            cursor.execute(f"""
                SELECT DISTINCT pc
                FROM {ACTUAL_TABLE}
                WHERE pc IS NOT NULL AND pc != ''
            """)
            db_pcs = {str(r['pc']).strip() for r in cursor.fetchall()}
            cursor.close()
        except Exception as db_err:
            logger.warning(f"[MASTER] DB cross-reference failed: {db_err}")

        # Enrich with DB match info
        result = []
        db_matched = 0
        for r in master_list:
            entry = dict(r)
            entry['in_db'] = r['pc'] in db_pcs
            if entry['in_db']:
                db_matched += 1
            result.append(entry)

        # Apply status filter if specified
        if status_filter:
            result = [r for r in result if r['status'] == status_filter]

        # Apply RBAC Filter
        pc_codes = [r['pc'] for r in result]
        allowed_pcs = set(filter_restaurants_by_rbac(pc_codes))
        result = [r for r in result if r['pc'] in allowed_pcs]

        _save_master_log('API_SERVE', len(result),
                         f"Served {len(result)} restaurants (DB matched: {db_matched})")

        return jsonify({
            'status':      'ok',
            'restaurants': result,
            'count':       len(result),
            'db_matched':  db_matched,
            'total_master': len(master_list),
            'loaded_at':   _master_cache.get('loaded_at'),
            'excel_file':  os.path.basename(MASTER_EXCEL_PATH)
        })

    except FileNotFoundError as e:
        logger.error(f"[MASTER] {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 404
    except Exception as e:
        logger.error(f"[MASTER] Error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/master/log', methods=['GET'])
def get_master_log():
    """Return the master load log entries."""
    try:
        logs = []
        if os.path.exists(MASTER_LOG_FILE):
            with open(MASTER_LOG_FILE, 'r', encoding='utf-8') as f:
                logs = json.load(f)
        return jsonify({'status': 'ok', 'logs': logs, 'count': len(logs)})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


# ═══════════════════════════════════════════════════════════════
# MAIN — Cross-platform entry point
# ═══════════════════════════════════════════════════════════════

if __name__ == '__main__':
    port = int(os.getenv('FLASK_PORT', 5050))
    debug = os.getenv('FLASK_DEBUG', 'false').lower() == 'true'
    engine = 'Development (Flask)' if debug else 'Waitress'

    # ASCII-safe banner — avoids UnicodeEncodeError on Windows consoles
    print(f"""
    +===================================================+
    |         PNL FORECAST -- API Server                 |
    |         http://localhost:{port}                    |
    |         Environment: {'Development' if debug else 'Production'}              |
    +===================================================+
    """)

    if debug:
        # Development mode: use Flask built-in server (hot reload)
        app.run(host='0.0.0.0', port=port, debug=True)
    else:
        # Production on Windows: use Waitress (no UNIX sockets needed)
        # On Linux/Render: use gunicorn via start command instead
        try:
            from waitress import serve
            print("[Server] Starting with Waitress...")
            serve(app, host='0.0.0.0', port=port, threads=8)
        except ImportError:
            print("[Server] Waitress not found, using Flask dev server...")
            app.run(host='0.0.0.0', port=port)
