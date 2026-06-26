# Tài liệu Bàn giao — PNL Forecast

> Tài liệu này dành cho đội tiếp nhận vận hành (IT/DevOps + nhà phát triển kế thừa).
> Đọc kèm `README.md` (nghiệp vụ + API) và `docs/ARCHITECTURE.md` (kiến trúc).

---

## 1. Tổng quan kỹ thuật

| Hạng mục | Giá trị |
|---|---|
| Ngôn ngữ / Framework | Python 3.10+ / Flask |
| WSGI server (prod) | Waitress (`run.sh prod` / Docker) |
| Entry point | `app.py` (đối tượng `app`) |
| Cổng mặc định | `5050` (biến `FLASK_PORT`) |
| CSDL Actuals | MSSQL — bảng `DataMart.MIS.FC213_FACT_ACT` |
| CSDL Forecast | StarRocks / MySQL protocol |
| Đăng nhập | Tài khoản nội bộ (`data/users.json`) + Google SSO |

---

## 2. Checklist bàn giao

- [ ] Bàn giao quyền truy cập **repo GitHub** (`Harryndt-github/pnl_forecast`).
- [ ] Bàn giao **credentials** CSDL MSSQL & StarRocks (không nằm trong repo — xem `.env`).
- [ ] Bàn giao **Google OAuth client** (`GOOGLE_CLIENT_ID` / `SECRET`) nếu dùng SSO.
- [ ] Bàn giao **`FLASK_SECRET_KEY`** production (chuỗi ngẫu nhiên đủ dài).
- [ ] Bàn giao file dữ liệu runtime đang chạy nếu cần (xem mục 5).
- [ ] Xác nhận danh sách **tài khoản admin** trong `data/users.json`.
- [ ] Thống nhất quy trình **khóa công thức forecast** (mục 6).

---

## 3. Cấu hình môi trường (`.env`)

Copy từ mẫu và điền giá trị thật:

```bash
cp .env.example .env
```

| Biến | Bắt buộc | Ghi chú |
|---|:---:|---|
| `FLASK_SECRET_KEY` | ✅ | Khóa ký session. **Đổi** giá trị mẫu trước khi chạy prod. |
| `FLASK_PORT` | | Mặc định `5050`. |
| `FLASK_DEBUG` | | `false` ở production. |
| `MSSQL_*` | ✅ | Kết nối dữ liệu Actuals. |
| `STARROCKS_*` | ✅ | Kết nối dữ liệu Forecast. |
| `GOOGLE_CLIENT_ID` / `_SECRET` | ⚠️ | Bắt buộc nếu `AUTH_MODE=google`. |
| `AUTH_MODE` | | `local` (mặc định) hoặc `google`. |
| `ALLOW_FORMULA_EDIT` | | `false` mặc định — chỉ bật tạm khi sửa công thức. |

> ⚠️ `.env` **không** được commit (đã có trong `.gitignore`). Bàn giao qua kênh bảo mật.

---

## 4. Triển khai (Deployment)

### Cách A — Docker (khuyến nghị cho bàn giao)

```bash
cp .env.example .env          # điền creds
docker compose up -d --build  # build + chạy nền
docker compose logs -f        # xem log
curl http://localhost:5050/api/health
```

- App nói chuyện với MSSQL/StarRocks **bên ngoài** container (không containerise DB).
- Thư mục `data/` được mount làm volume → dữ liệu runtime tồn tại qua các lần restart.
- Healthcheck tích hợp gọi `/api/health` mỗi 30s.

### Cách B — Chạy trực tiếp (script)

```bash
./run.sh prod        # macOS/Linux, Waitress WSGI
run.bat prod         # Windows
```

Script tự tạo `.venv`, cài `requirements.txt`, rồi chạy Waitress.

### Cài đặt tái lập (deterministic)

Dùng lock đã pin để build giống hệt môi trường đã kiểm thử:

```bash
pip install -r requirements.lock
```

---

## 5. Dữ liệu (`data/`)

**Commit trong repo (cấu hình):**

| File | Vai trò |
|---|---|
| `users.json` | Tài khoản nội bộ + phân quyền chain/PC |
| `forecast_formulas.json` | Công thức forecast — **KHÓA** theo rule Tài chính |
| `forecast_period_archive.json` | Lưu trữ kỳ forecast đã chốt |

**Sinh runtime (đã `.gitignore` — backup khi bàn giao nếu cần giữ):**
`Open_Close.xlsx`, `master_load_log.json`, `saved_reports.json`, `rental_costs.json`, `dna_costs.json`, `forecast_excel_benchmark.json`.

---

## 6. ⚠️ Rủi ro & lưu ý kế thừa

1. **Hai engine forecast song song** — `compute_forecast()` (v1) và `compute_forecast_v2()` tồn tại đồng thời với logic method độc lập. **Trước khi sửa logic**, xác nhận `static/js/forecast.js` đang gọi endpoint nào (`/api/forecast/compute-v2` là bản v2) để biết engine "live".
2. **Công thức forecast bị khóa** — `data/forecast_formulas.json` là logic Tài chính. Chỉ sửa khi đặt `ALLOW_FORMULA_EDIT=true` tạm thời. Carve-out duy nhất: Manager/Admin chỉnh `variable_percent` qua `POST /api/forecast/formulas/variable-split`.
3. **`app.py` là một file lớn (~3200 dòng)** — gồm cả API, serve frontend và engine forecast. Cân nhắc tách module dần khi bảo trì.
4. **Rate limit dùng bộ nhớ tiến trình** (`storage_uri="memory://"`) — không chia sẻ giữa nhiều worker/replica. Nếu scale ngang, chuyển sang Redis.
5. **Test hiện tại** — `tests/test_unit.py` + `tests/test_api.py` là test tự động (chạy không cần DB). Các file `tests/test_db.py`, `test_chains.py`, ... là **script debug thủ công** cần server/DB sống, không nằm trong CI.

---

## 7. Kiểm thử & CI

```bash
pip install -r requirements.txt -r requirements-dev.txt
pytest
```

- CI tự chạy trên GitHub Actions (`.github/workflows/ci.yml`) khi push/PR vào `main`, test trên Python 3.10–3.12.
- Test tự động **không** cần kết nối DB (health endpoint trả `degraded`, route bảo vệ trả 401).

---

## 8. Liên hệ & nguồn

- Repo: `https://github.com/Harryndt-github/pnl_forecast`
- Tài liệu nghiệp vụ & API: `README.md`
- Kiến trúc: `docs/ARCHITECTURE.md`
