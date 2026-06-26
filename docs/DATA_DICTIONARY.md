# Từ điển dữ liệu — thư mục `data/`

> Mô tả cấu trúc từng file trong `data/` và hàm code nào trong `app.py` đọc/ghi
> chúng. Đọc kèm phần diễn giải (docstring) ngay trong `app.py`.

---

## Phân loại

| File | Commit? | Vai trò |
|---|:---:|---|
| `users.json` | ✅ | Tài khoản nội bộ + phân quyền (RBAC) |
| `forecast_formulas.json` | ✅ | Cấu hình logic forecast — **KHOÁ** |
| `forecast_period_archive.json` | ✅ | Bản chốt forecast hợp nhất theo từng kỳ |
| `saved_reports.json` | ❌ runtime | Báo cáo forecast user lưu lại |
| `rental_costs.json` | ❌ runtime | Tiền thuê/tháng theo PC (import Excel) → CP0209 |
| `dna_costs.json` | ❌ runtime | Khấu hao/tháng theo PC (import Excel) → CP0211 |
| `forecast_excel_benchmark.json` | ❌ runtime | Số benchmark tổng từ Excel để đối chiếu |
| `master_load_log.json` | ❌ runtime | Nhật ký import file master Open_Close.xlsx |
| `Open_Close.xlsx` | ❌ runtime | Danh sách nhà hàng master (Code/Status/Brand) |

---

## 1. `users.json`

List các tài khoản. Đọc bởi `get_users()`; lọc phạm vi bởi `filter_restaurants_by_rbac()`.

```json
[
  {
    "username": "admin",
    "password_hash": "scrypt:32768:8:1$...",
    "role": "admin",
    "allowed_chains": [],
    "allowed_pcs": []
  }
]
```

| Trường | Kiểu | Ý nghĩa |
|---|---|---|
| `username` | string | Tên đăng nhập (khoá định danh) |
| `password_hash` | string | Mật khẩu băm bằng werkzeug **scrypt** — không bao giờ lưu plaintext |
| `role` | string | `admin` (toàn quyền) / `manager` (chỉnh được variable split) / `user` |
| `allowed_chains` | string[] | Mã chuỗi (4 ký tự) được xem; `[]` = không giới hạn theo chuỗi |
| `allowed_pcs` | string[] | Mã profit-center được xem; `[]` = không giới hạn theo PC |

> Quy tắc RBAC: `admin` thấy tất cả. User thường chỉ thấy PC ∈ `allowed_pcs`
> hoặc có 4 ký tự đầu ∈ `allowed_chains`.

---

## 2. `forecast_formulas.json` (LOGIC KHOÁ)

Single source of truth cho engine forecast. Đọc bởi `_load_forecast_formula_configs()`
(lấy phần `formulas`) và `get_forecast_formulas()`; chỉ ghi qua `update_variable_split()`
và `save_forecast_formulas()` (sau cùng cần `ALLOW_FORMULA_EDIT=true`).

```json
{
  "updated_at": "2026-06-11 15:30:00",
  "updated_by": "system — mapping theo Gop_y_Fin_rule...",
  "formulas": {
    "DT01": { "method": "historical", "growth_rate": 5, "lookback": 2 },
    "TC":   { "method": "rolling4w", "rolling4w_adjustment": 5, "_rule": "..." }
  }
}
```

Mỗi entry `formulas[indicator_code]` chọn 1 trong **5 method** (xử lý trong
`_project()` của `compute_forecast_v2`):

| `method` | Tham số | Công thức |
|---|---|---|
| `historical` | `growth_rate` (%), `lookback` | base × (1 + growth)^n; base = bình quân `lookback` kỳ |
| `anchor` | `multiplier`, `buffer`, `anchor_period` | value_kỳ_neo × multiplier + buffer (`anchor_period: null` → tháng gần nhất) |
| `percent_revenue` | `ratio_percent` **hoặc** `lookback` | DT01 dự phóng × tỷ lệ (cố định hoặc %LM bình quân) |
| `fixed_variable` | `variable_percent` (0–100) | fix giữ nguyên + biến phí scale theo DT01; **manager chỉnh được `variable_percent`** |
| `rolling4w` | `rolling4w_adjustment` (%) | TC: bình quân/ngày 28 ngày × số ngày tháng × (1+adj)^n |

> `_rule` là chú thích nghiệp vụ (không ảnh hưởng tính toán). `indicator_code`
> phân cấp theo độ dài: 4 ký tự = L1, 6 = L2, 8 = L3 (con dài hơn cha 2 ký tự).

---

## 3. `forecast_period_archive.json`

Bản chốt forecast hợp nhất theo từng kỳ. Ghi bởi `_archive_report_by_period()`
(upsert + gộp dần theo store), đọc/ghi qua `_load_forecast_archive()` /
`_save_forecast_archive()`.

```json
{
  "periods": {
    "202606": {
      "id": 1780649415231,
      "savedAt": "15:50:15 5/6/2026",
      "datekey": 202606,
      "filter": "10PZ (1 chuỗi)",
      "method": "historical",
      "model": "bottom_up_store",
      "projections": [ { "datekey": 202606, "DT01": ..., "CP01": ... } ],
      "restaurant_projections": { "<pc>": { "datekey": 202606, ... } },
      "source_reports": [ { "id": ..., "savedAt": ..., "filter": ... } ],
      "calibration_scope": { ... },
      "reconciliation": null,
      "reconciliation_warning": null
    }
  }
}
```

| Trường | Ý nghĩa |
|---|---|
| `periods["YYYYMM"]` | Một snapshot cho mỗi kỳ |
| `projections` | Dòng tổng của kỳ (rollup từ các store nếu có chi tiết) |
| `restaurant_projections` | Chi tiết từng PC cho đúng kỳ này |
| `source_reports` | Truy vết các lần lưu đã gộp vào kỳ này |
| `calibration_scope` | Phạm vi & việc có căn chỉnh theo benchmark Excel hay không |

Mỗi dòng projection chứa toàn bộ chỉ tiêu P&L (DT*, CP*, SD*, TC, TA).

---

## 4. File chi phí per-PC: `rental_costs.json` / `dna_costs.json`

Sinh khi manager/admin import Excel. Đọc bởi `_read_pc_costs_meta()` →
`_load_pc_cost_amounts()` (rút thành `{pc: amount}`). Dùng trong
`compute_forecast_v2` để ghi đè **CP0209** (thuê) / **CP0211** (khấu hao).

```json
{
  "updated_at": "...",
  "updated_by": "...",
  "costs": { "<pc>": { "amount": 123456789 } }
}
```

> Store có số import → dùng số thực; store chưa import → fallback theo công thức
> `anchor` (flat giá trị tháng gần nhất) trong `forecast_formulas.json`.
