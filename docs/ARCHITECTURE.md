# Kiến trúc

## Tổng quan

`app.py` là một Flask app đơn (monolith) đảm nhận cả hai vai trò:

1. **Serve frontend** — trả về `templates/index.html`, `templates/login.html`
   và tài nguyên tĩnh `static/css`, `static/js`.
2. **REST API** (`/api/...`) — truy vấn dữ liệu, xử lý forecast, auth, RBAC,
   import/export Excel.

```
Browser ──HTTP──► Flask (app.py)
                    ├── /                → templates/index.html
                    ├── /login           → templates/login.html
                    ├── /css/*, /js/*    → static/
                    └── /api/*           ├── MSSQL      (Actuals)
                                         ├── StarRocks  (Forecast)
                                         └── data/*.json (state, config)
```

## Nguồn dữ liệu

| Nguồn | Dùng cho | Cấu hình |
|-------|----------|----------|
| MSSQL (`DataMart.MIS.FC213_FACT_ACT`) | Số liệu thực tế (Actuals) | `MSSQL_*` |
| StarRocks / MySQL | Dữ liệu forecast | `STARROCKS_*` |
| `data/Open_Close.xlsx` (sheet `Master`) | Danh mục nhà hàng (ACTIVE) | upload runtime |
| `data/*.json` | State & cấu hình ứng dụng | file cục bộ |

## Xác thực & phân quyền

- **Đăng nhập:** Google OAuth2 (Authlib) hoặc tài khoản nội bộ
  (`data/users.json`, mật khẩu hash bằng `werkzeug.security`).
- **RBAC:** mỗi user có `allowed_chains` / `allowed_pcs`; danh sách chuỗi và
  profit-center trả về cho client đã được lọc theo quyền.
- **Rate limiting:** `flask-limiter`.

## Quy ước đường dẫn

Mọi đường dẫn file đều tính theo `BASE_DIR` (vị trí `app.py`), không phụ thuộc
thư mục làm việc hiện tại:

- `BASE_DIR/static`, `BASE_DIR/templates` — frontend
- `BASE_DIR/data` — dữ liệu & state (tự tạo nếu thiếu)
- `BASE_DIR/flask.log` — log xoay vòng (RotatingFileHandler)

## Forecast bị khoá

`forecast_formulas.json` là nguồn chân lý duy nhất cho logic forecast và bị khoá
theo rule Tài chính. API sửa công thức bị chặn trừ khi đặt
`ALLOW_FORMULA_EDIT=true` trong môi trường.
