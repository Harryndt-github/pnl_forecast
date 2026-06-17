# PNL Forecast

Ứng dụng web dự báo Lợi nhuận (P&L Forecast) cho chuỗi nhà hàng. Backend Flask
phục vụ API dữ liệu thực tế (Actuals) và dự báo (Forecast), kèm giao diện
dashboard, nhập/xuất Excel, phân quyền theo chuỗi/profit-center và đăng nhập
Google SSO + tài khoản nội bộ.

## Cấu trúc dự án

```
pnl_forecast/
├── app.py                 # Flask app: API + serve frontend (single entry point)
├── requirements.txt       # Python dependencies
├── run.bat / run.sh       # Script khởi động (Windows / macOS-Linux)
├── .env.example           # Mẫu biến môi trường — copy sang .env
├── static/
│   ├── css/               # styles.css
│   └── js/                # các module frontend (app, dashboard, forecast, ...)
├── templates/
│   ├── index.html         # giao diện chính
│   └── login.html         # trang đăng nhập
├── data/                  # dữ liệu & state (xem mục Data files bên dưới)
├── scripts/               # tiện ích vận hành (PowerShell, ...)
├── tests/                 # script kiểm thử thủ công (chạy khi server đang chạy)
└── docs/                  # tài liệu kỹ thuật
```

## Yêu cầu

- Python 3.10+
- Truy cập tới CSDL MSSQL (Actuals) và StarRocks/MySQL (Forecast)
- (Tùy chọn) Google OAuth2 client cho đăng nhập SSO

## Cài đặt & chạy

1. Tạo file cấu hình từ mẫu:
   ```bash
   cp .env.example .env
   # rồi điền thông tin DB, secret key, Google OAuth...
   ```

2. Khởi động:
   - **macOS / Linux:** `./run.sh` (dev) hoặc `./run.sh prod`
   - **Windows:** `run.bat` (dev) hoặc `run.bat prod`

   Script sẽ tự tạo virtualenv, cài dependencies và chạy server.
   Mặc định: <http://localhost:5050>

   Chạy thủ công nếu muốn:
   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   python app.py
   ```

## Biến môi trường

Xem `.env.example` để biết danh sách đầy đủ. Nhóm chính:

- `FLASK_PORT`, `FLASK_DEBUG`, `FLASK_SECRET_KEY`
- `MSSQL_*` — kết nối dữ liệu Actuals
- `STARROCKS_*` — kết nối dữ liệu Forecast
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — đăng nhập Google SSO

## Data files (`data/`)

**Được commit (dữ liệu cấu hình):**

| File | Vai trò |
|------|---------|
| `users.json` | Tài khoản nội bộ + phân quyền (chain/profit-center) |
| `forecast_formulas.json` | Công thức forecast — **KHOÁ** theo rule Tài chính |
| `forecast_period_archive.json` | Lưu trữ các kỳ forecast đã chốt |

**Sinh tự động lúc chạy (đã `.gitignore`):**
`Open_Close.xlsx` (master upload), `master_load_log.json`, `saved_reports.json`,
`rental_costs.json`, `dna_costs.json`, `forecast_excel_benchmark.json`.

> ⚠️ Logic forecast bị khoá: muốn đổi `forecast_formulas.json` phải đặt
> `ALLOW_FORMULA_EDIT=true` tạm thời (xem chi tiết trong `app.py`).

## Tests

Thư mục `tests/` chứa các script kiểm thử thủ công (gọi API/CSDL trực tiếp);
chúng yêu cầu server đang chạy và/hoặc kết nối DB hợp lệ, ví dụ:

```bash
python tests/test_chains.py     # cần server chạy ở localhost:5050
python tests/test_db.py         # kiểm tra kết nối MSSQL / StarRocks
```
