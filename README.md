# PNL Forecast

Ứng dụng web **dự báo Báo cáo Kết quả Kinh doanh (P&L Forecast)** cho chuỗi nhà hàng F&B. Backend Flask phục vụ API dữ liệu thực tế (Actuals) và dự báo (Forecast), kèm giao diện dashboard, nhập/xuất Excel, phân quyền theo chuỗi/profit-center và đăng nhập Google SSO + tài khoản nội bộ.

---

## 1. Giới thiệu nghiệp vụ

Hệ thống thay thế quy trình lập kế hoạch P&L thủ công bằng Excel, cho phép:

- Xem báo cáo P&L **thực tế** theo kỳ, chuỗi thương hiệu, hoặc từng nhà hàng.
- **Dự báo** P&L các kỳ tương lai bằng nhiều phương pháp (xem mục 5).
- **Điều chỉnh & phê duyệt** kế hoạch forecast theo từng cấp (tổng hợp / chuỗi / nhà hàng).
- **Phân quyền** truy cập theo vai trò và phạm vi dữ liệu được phép.
- **Xuất báo cáo PDF** phục vụ ban lãnh đạo.

### Khái niệm cốt lõi

| Thuật ngữ | Ý nghĩa |
|-----------|---------|
| **P&L** | Profit & Loss — Báo cáo Kết quả Kinh doanh |
| **PC** | Profit Center — mã trung tâm lợi nhuận (một nhà hàng) |
| **Chain** | Chuỗi thương hiệu (nhóm nhiều PC) |
| **TC** | Traffic Count — số lượt khách trong kỳ |
| **Datekey** | Mã kỳ định dạng `YYYYMM` (vd `202604` = tháng 4/2026) |
| **Indicator code** | Mã chỉ tiêu P&L phân cấp: 4 ký tự = L1, 6 = L2, 8 = L3 |
| **Actual** | Số liệu thực tế đã phát sinh |
| **Forecast** | Số liệu dự báo cho kỳ tương lai |

---

## 2. Các module chức năng

| Module | File frontend | Mô tả |
|--------|---------------|-------|
| **Dashboard** | `dashboard.js` | Xem P&L thực tế, so sánh Actual vs Forecast, biểu đồ xu hướng |
| **Forecast Builder** | `forecast.js` | Xây dựng dự báo P&L theo các phương pháp đã cấu hình |
| **Consolidation** | `consolidation.js` | Review, điều chỉnh (override) và chốt kế hoạch forecast |
| **Lock Manager** | `lockmanager.js` | Khóa/mở kỳ forecast, kiểm soát quyền chỉnh sửa |
| **User Manager** | `users.js` | Quản trị tài khoản & phân quyền (chỉ Admin) |
| **Onboarding** | `onboarding.js` | Nhập liệu khi onboard dữ liệu mới |
| **New Restaurant** | `newrestaurant.js` | Cấu hình nhà hàng chưa có lịch sử dữ liệu |

---

## 3. Cấu trúc dự án

```
pnl_forecast/
├── app.py                 # Flask app: API + serve frontend (single entry point)
├── requirements.txt       # Python dependencies
├── run.bat / run.sh       # Script khởi động (Windows / macOS-Linux)
├── .env.example           # Mẫu biến môi trường — copy sang .env
├── README.md              # Tài liệu này
├── static/
│   ├── css/               # styles.css
│   └── js/                # các module frontend (app, dashboard, forecast, ...)
├── templates/
│   ├── index.html         # giao diện chính
│   └── login.html         # trang đăng nhập
├── data/                  # dữ liệu & state (xem mục 6)
├── scripts/               # tiện ích vận hành (PowerShell, ...)
├── tests/                 # script kiểm thử thủ công (chạy khi server đang chạy)
└── docs/                  # tài liệu kỹ thuật (ARCHITECTURE.md)
```

---

## 4. Yêu cầu & Cài đặt

### Yêu cầu

- Python 3.10+
- Truy cập tới CSDL MSSQL (Actuals) và StarRocks/MySQL (Forecast)
- (Tùy chọn) Google OAuth2 client cho đăng nhập SSO

### Cài đặt & chạy

1. Tạo file cấu hình từ mẫu:
   ```bash
   cp .env.example .env
   # rồi điền thông tin DB, secret key, Google OAuth...
   ```

2. Khởi động:
   - **macOS / Linux:** `./run.sh` (dev) hoặc `./run.sh prod`
   - **Windows:** `run.bat` (dev) hoặc `run.bat prod`

   Script tự tạo virtualenv, cài dependencies và chạy server. Mặc định: <http://localhost:5050>

   Chạy thủ công nếu muốn:
   ```bash
   python3 -m venv .venv && source .venv/bin/activate
   pip install -r requirements.txt
   python app.py
   ```

### Biến môi trường

Xem `.env.example` để biết danh sách đầy đủ. Nhóm chính:

- `FLASK_PORT`, `FLASK_DEBUG`, `FLASK_SECRET_KEY`
- `MSSQL_*` — kết nối dữ liệu Actuals
- `STARROCKS_*` — kết nối dữ liệu Forecast
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — đăng nhập Google SSO
- `ALLOW_FORMULA_EDIT` — mở khóa sửa công thức forecast (mặc định `false`)

---

## 5. Cơ chế Forecast (QUAN TRỌNG)

Logic forecast theo mô hình **2 lớp**:

### Lớp cấu hình — `data/forecast_formulas.json`

**Nguồn chân lý duy nhất** cho logic forecast, khai báo 97 chỉ tiêu. Mỗi chỉ tiêu chỉ định `method` + tham số. File **bị khóa** mặc định; muốn sửa phải đặt `ALLOW_FORMULA_EDIT=true` tạm thời, sau đó gọi `POST /api/forecast/formulas`.

### Lớp engine — `app.py`

Engine thực thi nằm trong hàm `_project(code)` của `compute_forecast_v2()`. Đây là nơi mỗi `method` được diễn giải thành phép tính.

> ⚠️ **Lưu ý bàn giao:** tồn tại 2 engine song song — `compute_forecast()` (v1) và `compute_forecast_v2()` (v2) — với logic method độc lập. Cần xác nhận frontend (`forecast.js`) đang gọi endpoint nào để biết engine "live" trước khi sửa.

### Các phương thức (method) hiện có

| Method | Số chỉ tiêu | Công thức rút gọn |
|--------|:-----------:|-------------------|
| `fixed_variable` | 45 | Phần fix giữ nguyên + phần biến phí scale theo doanh thu dự phóng (`variable_percent` 0–100) |
| `anchor` | 27 | `giá trị kỳ neo × multiplier + buffer` |
| `percent_revenue` | 20 | `DT01 dự phóng × tỷ lệ %` (cố định hoặc bình quân lookback) |
| `historical` | 4 | `base × (1 + growth_rate)^n`, base = bình quân `lookback` kỳ gần nhất |
| `rolling4w` | 1 | Trend TC 4 tuần gần nhất × số ngày trong tháng × hệ số điều chỉnh |

### Cấu trúc một công thức (ví dụ)

```json
"DT01": { "method": "historical", "growth_rate": 5, "lookback": 2 },
"TC":   { "method": "rolling4w", "rolling4w_adjustment": 5 }
```

> 💡 Carve-out duy nhất: **Manager/Admin** được chỉnh `variable_percent` của các item `fixed_variable` qua `POST /api/forecast/formulas/variable-split`, kể cả khi công thức đang khóa. Mọi tham số khác vẫn bị khóa.

---

## 6. Data files (`data/`)

**Được commit (dữ liệu cấu hình):**

| File | Vai trò |
|------|---------|
| `users.json` | Tài khoản nội bộ + phân quyền (chain/profit-center) |
| `forecast_formulas.json` | Công thức forecast — **KHÓA** theo rule Tài chính |
| `forecast_period_archive.json` | Lưu trữ các kỳ forecast đã chốt |

**Sinh tự động lúc chạy (đã `.gitignore`):**
`Open_Close.xlsx` (master upload), `master_load_log.json`, `saved_reports.json`, `rental_costs.json`, `dna_costs.json`, `forecast_excel_benchmark.json`.

---

## 7. API tham khảo nhanh

| Nhóm | Endpoint tiêu biểu | Mô tả |
|------|--------------------|-------|
| Auth | `POST /api/auth/local/login`, `GET /api/auth/google`, `GET /api/auth/me` | Đăng nhập, SSO, thông tin user |
| Actual | `GET /api/actual`, `/api/actual/summary`, `/api/actual/trend` | Dữ liệu thực tế từ MSSQL |
| Chains | `GET /api/chains` | Danh sách chuỗi + số nhà hàng |
| Forecast | `POST /api/forecast/compute-v2`, `GET /api/forecast/formulas` | Tính dự báo, lấy cấu hình công thức |
| Forecast | `POST /api/forecast/formulas/variable-split` | Manager chỉnh tỷ trọng biến phí |
| Admin | `GET/POST /api/admin/users` | CRUD người dùng (Admin only) |
| System | `GET /api/health` | Health check MSSQL + StarRocks |

> Mọi endpoint `/api/*` (trừ `/api/auth/*` và `/api/health`) yêu cầu session hợp lệ.

---

## 8. Tests

Thư mục `tests/` chứa các script kiểm thử thủ công (gọi API/CSDL trực tiếp); yêu cầu server đang chạy và/hoặc kết nối DB hợp lệ:

```bash
python tests/test_chains.py     # cần server chạy ở localhost:5050
python tests/test_db.py         # kiểm tra kết nối MSSQL / StarRocks
```

> 📌 Đây là script debug, **chưa phải** test suite tự động. Khuyến nghị chuyển sang `pytest` + mock DB cho CI/CD trong tương lai.

---

## 9. Tài liệu thêm

- `docs/ARCHITECTURE.md` — kiến trúc tổng quan, nguồn dữ liệu, quy ước đường dẫn.
