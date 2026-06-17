/* ═══════════════════════════════════════════════════════════════
   PNL FORECAST — PnL Line Items (DB-aligned hierarchy)
   Code level logic (FC213_FACT_ACT indicator_code):
     2-char  = KPI root   (TC, TA)
     4-char  = Level 1    (DT01, SD01, CP01 …)
     6-char  = Level 2    (CP0201, DT0101 …)
     8-char  = Level 3    (CP010101, CP020201 …)
    10-char  = Level 4    (CP02110101 …)
   isSubtotal : styled as summary row, value from DB directly.
   isFormula  : value computed client-side (only TA).
   ═══════════════════════════════════════════════════════════════ */

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CURRENT_MONTH = 3; // April (0-indexed)

// ─── PnL Line Items ─────────────────────────────────────────────
const PNL_DATA = [

    // ── Volume KPIs ──────────────────────────────────────────────
    { code: 'TC',       label: 'Số lượt khách (TC)',             actual: 0, forecast: 0, prior: 0 },
    { code: 'TA',       label: 'Doanh thu TB / khách (TA)',      actual: 0, forecast: 0, prior: 0, isFormula: true, formulaDesc: 'DT01 / TC' },

    // ════════════════════════════════════════════════════════════
    // A. DOANH THU
    // ════════════════════════════════════════════════════════════
    { code: 'DT01',     label: 'A. Doanh thu bán hàng',          actual: 0, forecast: 0, prior: 0 },
    { code: 'DT0101',   label: 'Doanh thu F&B',                  actual: 0, forecast: 0, prior: 0 },
    { code: 'DT010101', label: 'Doanh thu tại cửa hàng',         actual: 0, forecast: 0, prior: 0 },
    { code: 'DT010102', label: 'Doanh thu delivery',             actual: 0, forecast: 0, prior: 0 },

    { code: 'DT02',     label: 'B. Chiết khấu (Discount)',       actual: 0, forecast: 0, prior: 0 },
    { code: 'DT020101', label: 'CK thẻ ngân hàng',               actual: 0, forecast: 0, prior: 0 },
    { code: 'DT020201', label: 'CK nội bộ',                      actual: 0, forecast: 0, prior: 0 },
    { code: 'DT020301', label: 'CK voucher',                     actual: 0, forecast: 0, prior: 0 },
    { code: 'DT020302', label: 'CK ứng dụng / online',           actual: 0, forecast: 0, prior: 0 },
    { code: 'DT020303', label: 'CK khuyến mãi',                  actual: 0, forecast: 0, prior: 0 },
    { code: 'DT020304', label: 'CK nhân viên',                   actual: 0, forecast: 0, prior: 0 },
    { code: 'DT020310', label: 'CK khác',                        actual: 0, forecast: 0, prior: 0 },

    { code: 'SD01',     label: 'Doanh thu thuần (Net Revenue)',  actual: 0, forecast: 0, prior: 0, isSubtotal: true },

    // ════════════════════════════════════════════════════════════
    // B. GIÁ VỐN
    // ════════════════════════════════════════════════════════════
    { code: 'CP01',     label: 'C. Giá vốn (COGS)',              actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0101',   label: 'Nguyên vật liệu',                actual: 0, forecast: 0, prior: 0 },
    { code: 'CP010101', label: 'NVL chính',                      actual: 0, forecast: 0, prior: 0 },
    { code: 'CP010102', label: 'Bao bì đóng gói',                actual: 0, forecast: 0, prior: 0 },
    { code: 'CP010103', label: 'NVL phụ',                        actual: 0, forecast: 0, prior: 0 },
    { code: 'CP010201', label: 'Chi phí pha chế / chế biến',     actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0104',   label: 'Hao hụt & điều chỉnh NVL',      actual: 0, forecast: 0, prior: 0 },
    { code: 'CP010401', label: 'Điều chỉnh giảm NVL',            actual: 0, forecast: 0, prior: 0 },
    { code: 'CP010402', label: 'Hao hụt NVL',                    actual: 0, forecast: 0, prior: 0 },

    { code: 'SD02',     label: 'Lợi nhuận gộp (Gross Profit)',   actual: 0, forecast: 0, prior: 0, isSubtotal: true },

    // ════════════════════════════════════════════════════════════
    // C. CHI PHÍ VẬN HÀNH (CP02)
    // ════════════════════════════════════════════════════════════
    { code: 'CP0201',   label: 'Chi phí nhân sự (COL)',          actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020104', label: 'Lương thử việc',                 actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020105', label: 'Phụ cấp nhân viên',              actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020106', label: 'Lương cơ bản & OT',              actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020116', label: 'BHXH / BHYT / BHTN',             actual: 0, forecast: 0, prior: 0 },

    { code: 'CP0202',   label: 'Chi phí tiện ích (Utilities)',   actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020201', label: 'Điện',                           actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020202', label: 'Nước',                           actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020203', label: 'Gas',                            actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020204', label: 'Điện thoại / Internet',          actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020205', label: 'Chi phí nhiên liệu',             actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020206', label: 'Chi phí vệ sinh',                actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020207', label: 'Chi phí tiện ích khác',          actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020208', label: 'Phí xử lý rác thải',             actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020209', label: 'Dịch vụ diệt côn trùng',        actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020210', label: 'Chi phí tiện ích nhỏ lẻ',        actual: 0, forecast: 0, prior: 0 },

    { code: 'CP0203',   label: 'Công cụ dụng cụ (Tools)',        actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020301', label: 'Dụng cụ nhà bếp',                actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020302', label: 'Dụng cụ phục vụ',                actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020303', label: 'Văn phòng phẩm',                 actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020305', label: 'Đồng phục nhân viên',            actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020306', label: 'Công cụ dụng cụ khác',           actual: 0, forecast: 0, prior: 0 },

    { code: 'CP0204',   label: 'Nghiên cứu & PT sản phẩm',       actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020401', label: 'Chi phí R&D sản phẩm mới',       actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020402', label: 'Điều chỉnh giá vốn R&D',         actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020403', label: 'Chi phí test / đào tạo SP',      actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020404', label: 'Chi phí R&D khác',               actual: 0, forecast: 0, prior: 0 },

    { code: 'CP0205',   label: 'Chi phí bảo trì (Maintenance)',  actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020501', label: 'Bảo trì thiết bị',               actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020502', label: 'Sửa chữa cơ sở vật chất',       actual: 0, forecast: 0, prior: 0 },

    { code: 'CP0206',   label: 'Chi phí khác vận hành',          actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020601', label: 'Chi phí vận chuyển',             actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020602', label: 'Chi phí quản lý nội bộ',         actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020603', label: 'Chi phí in ấn / truyền thông',   actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020604', label: 'Chi phí vận hành khác',          actual: 0, forecast: 0, prior: 0 },

    { code: 'CP0207',   label: 'Chi phí Marketing',              actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020701', label: 'Quảng cáo & truyền thông',       actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020702', label: 'Tổ chức sự kiện',                actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020703', label: 'Tài trợ thương hiệu',            actual: 0, forecast: 0, prior: 0 },

    { code: 'CP0208',   label: 'Loyalty fee',                    actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020801', label: 'Phí chương trình loyalty',       actual: 0, forecast: 0, prior: 0 },

    { code: 'CP0209',   label: 'Chi phí thuê mặt bằng',         actual: 0, forecast: 0, prior: 0 },
    { code: 'CP020901', label: 'Tiền thuê mặt bằng',             actual: 0, forecast: 0, prior: 0 },

    { code: 'CP0210',   label: 'Chi phí chung (General)',        actual: 0, forecast: 0, prior: 0 },
    { code: 'CP021003', label: 'Chi phí bảo hiểm',               actual: 0, forecast: 0, prior: 0 },
    { code: 'CP021004', label: 'Chi phí kiểm toán / pháp lý',   actual: 0, forecast: 0, prior: 0 },
    { code: 'CP021008', label: 'Chi phí chung khác',             actual: 0, forecast: 0, prior: 0 },

    { code: 'CP0211',   label: 'Khấu hao cửa hàng (Store D&A)', actual: 0, forecast: 0, prior: 0 },
    { code: 'CP021103', label: 'Khấu hao TSCĐ cửa hàng',        actual: 0, forecast: 0, prior: 0 },
    { code: 'CP02110301', label: 'KH thiết bị & máy móc',        actual: 0, forecast: 0, prior: 0 },

    { code: 'SD03',     label: 'CM (Contribution Margin)',       actual: 0, forecast: 0, prior: 0, isSubtotal: true },

    // ════════════════════════════════════════════════════════════
    // D. CHI PHÍ NGOÀI VẬN HÀNH
    // ════════════════════════════════════════════════════════════
    { code: 'CP03',     label: 'D. Chi phí phân bổ (CP03)',      actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0301',   label: 'Phân bổ CP03 loại 1',            actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0302',   label: 'Phân bổ CP03 loại 2',            actual: 0, forecast: 0, prior: 0 },

    { code: 'CP04',     label: 'E. Chi phí phân bổ (CP04)',      actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0401',   label: 'Phân bổ CP04 loại 1',            actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0402',   label: 'Phân bổ CP04 loại 2',            actual: 0, forecast: 0, prior: 0 },

    { code: 'SD04',     label: 'Lãi / Lỗ NH sau khấu hao',      actual: 0, forecast: 0, prior: 0, isSubtotal: true },

    // ════════════════════════════════════════════════════════════
    // E. KHẤU HAO & PHÂN BỔ TẬP ĐOÀN
    // ════════════════════════════════════════════════════════════
    { code: 'CP09',     label: 'F. Khấu hao & phân bổ TĐ (D&A)',actual: 0, forecast: 0, prior: 0 },

    { code: 'SD05',     label: 'EBIT',                           actual: 0, forecast: 0, prior: 0, isSubtotal: true },

    // ════════════════════════════════════════════════════════════
    // F. TÀI CHÍNH & CHI PHÍ KHÁC
    // ════════════════════════════════════════════════════════════
    { code: 'DT03',     label: 'G. Thu nhập tài chính',          actual: 0, forecast: 0, prior: 0 },
    { code: 'DT0301',   label: 'Lãi tiền gửi',                   actual: 0, forecast: 0, prior: 0 },
    { code: 'DT0302',   label: 'Thu nhập từ đầu tư',             actual: 0, forecast: 0, prior: 0 },
    { code: 'DT0303',   label: 'Thu nhập tài chính khác',        actual: 0, forecast: 0, prior: 0 },

    { code: 'CP05',     label: 'H. Chi phí tài chính',           actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0501',   label: 'Lãi vay',                        actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0502',   label: 'Phí ngân hàng',                  actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0503',   label: 'Chi phí tài chính khác',         actual: 0, forecast: 0, prior: 0 },

    { code: 'DT04',     label: 'I. Thu nhập khác',               actual: 0, forecast: 0, prior: 0 },
    { code: 'DT0401',   label: 'Thanh lý tài sản',               actual: 0, forecast: 0, prior: 0 },
    { code: 'DT0402',   label: 'Hoàn nhập dự phòng',             actual: 0, forecast: 0, prior: 0 },
    { code: 'DT0403',   label: 'Thu nhập khác',                  actual: 0, forecast: 0, prior: 0 },

    { code: 'CP06',     label: 'J. Chi phí hoạt động khác',      actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0601',   label: 'Chi phí phạt / bồi thường',      actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0602',   label: 'Dự phòng tổn thất',              actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0603',   label: 'Chi phí khác',                   actual: 0, forecast: 0, prior: 0 },

    { code: 'CP07',     label: 'K. Thưởng quản lý (Mgt. Bonus)', actual: 0, forecast: 0, prior: 0 },

    { code: 'SD07',     label: 'Lãi / Lỗ điều chỉnh',           actual: 0, forecast: 0, prior: 0, isSubtotal: true },
    { code: 'SD08',     label: 'Lợi nhuận trước thuế (EBT)',     actual: 0, forecast: 0, prior: 0, isSubtotal: true },

    { code: 'CP08',     label: 'L. Thuế TNDN (CIT)',             actual: 0, forecast: 0, prior: 0 },

    { code: 'SD09',     label: 'Lợi nhuận sau thuế (PAT)',       actual: 0, forecast: 0, prior: 0, isSubtotal: true },

    // ════════════════════════════════════════════════════════════
    // G. TỔNG HỢP
    // ════════════════════════════════════════════════════════════
    { code: 'SD10',     label: 'EBITDA',                         actual: 0, forecast: 0, prior: 0, isSubtotal: true },
    { code: 'SD11',     label: 'Lãi ròng (Net Income)',          actual: 0, forecast: 0, prior: 0, isSubtotal: true },
];

// ─── Forecast Settings (only forecastable items) ──────────────
const FORECAST_SETTINGS = {
    'TC':       { configured: true,  method: 'historical', base: 50000 },
    'TA':       { configured: true,  method: null,         base: 0 },
    'DT01':     { configured: true,  method: 'historical', base: 3120000 },
    'DT0101':   { configured: true,  method: 'historical', base: 3120000 },
    'DT010101': { configured: true,  method: 'historical', base: 2800000 },
    'DT010102': { configured: true,  method: 'historical', base: 320000 },
    'DT02':     { configured: true,  method: 'percent_revenue', base: 156000 },
    'CP01':     { configured: true,  method: 'anchor',     base: 854250 },
    'CP0101':   { configured: true,  method: 'anchor',     base: 820000 },
    'CP010101': { configured: true,  method: 'anchor',     base: 700000 },
    'CP010102': { configured: true,  method: 'fixed',      base: 60000 },
    'CP010103': { configured: true,  method: 'fixed',      base: 60000 },
    'CP0201':   { configured: true,  method: 'fixed',      base: 641000 },
    'CP020106': { configured: true,  method: 'fixed',      base: 570000 },
    'CP0202':   { configured: true,  method: 'historical', base: 99663 },
    'CP020203': { configured: true,  method: 'fixed',      base: 60000 },
    'CP0203':   { configured: false, method: null,         base: 0 },
    'CP0204':   { configured: false, method: null,         base: 0 },
    'CP0205':   { configured: false, method: null,         base: 0 },
    'CP0206':   { configured: false, method: null,         base: 0 },
    'CP0207':   { configured: false, method: null,         base: 0 },
    'CP0208':   { configured: false, method: null,         base: 0 },
    'CP0209':   { configured: true,  method: 'fixed',      base: 227850 },
    'CP020901': { configured: true,  method: 'fixed',      base: 227850 },
    'CP0210':   { configured: false, method: null,         base: 0 },
    'CP0211':   { configured: true,  method: 'fixed',      base: 56950 },
    'CP09':     { configured: true,  method: 'fixed',      base: 0 },
    'DT03':     { configured: false, method: null,         base: 0 },
    'CP05':     { configured: false, method: null,         base: 0 },
    'DT04':     { configured: false, method: null,         base: 0 },
    'CP06':     { configured: false, method: null,         base: 0 },
    'CP07':     { configured: false, method: null,         base: 0 },
    'CP08':     { configured: false, method: null,         base: 0 },
};

// Generate FORECAST_ITEMS from PNL_DATA
const FORECAST_ITEMS = PNL_DATA.map(pnl => {
    const settings = FORECAST_SETTINGS[pnl.code] || { configured: false, method: null, base: 0 };
    return { code: pnl.code, name: pnl.label, ...settings };
});


// ─── Entity Hierarchy ───────────────────────────────────────────
const ENTITY_HIERARCHY = {
    name: 'Aeon Holdings Group', type: 'group',
    children: [
        { name: 'Miền Bắc', type: 'region', children: [
            { name: 'Unit #01 Hà Nội Phố Cổ', type: 'unit' },
            { name: 'Unit #02 Hà Nội Tây Hồ', type: 'unit' },
        ]},
        { name: 'Miền Nam', type: 'region', children: [
            { name: 'Unit #10 HCMC Quận 1', type: 'unit' },
            { name: 'Unit #11 HCMC Bình Thạnh', type: 'unit' },
        ]},
        { name: 'Miền Trung', type: 'region', children: [
            { name: 'Unit #20 Đà Nẵng Beach', type: 'unit' },
        ]}
    ]
};

// ─── GL Code Mappings ───────────────────────────────────────────
const GL_MAPPINGS = [
    { code: 'DT01',   desc: 'Doanh thu bán hàng',    target: 'Doanh thu thuần' },
    { code: 'CP01',   desc: 'Nguyên vật liệu',       target: 'Giá vốn hàng bán' },
    { code: 'CP0101', desc: 'NVL chính',              target: 'Giá vốn — NVL' },
    { code: 'CP0201', desc: 'Lương & phụ cấp',        target: 'Chi phí nhân sự' },
    { code: 'CP0202', desc: 'Điện nước gas',           target: 'Chi phí tiện ích' },
    { code: 'CP0207', desc: 'Marketing',              target: 'Chi phí marketing' },
    { code: 'CP0209', desc: 'Thuê mặt bằng',          target: 'Chi phí thuê' },
    { code: 'CP0211', desc: 'Khấu hao TSCĐ NH',      target: 'Khấu hao cửa hàng' },
    { code: 'CP09',   desc: 'Khấu hao TĐ',           target: 'Khấu hao & phân bổ' },
];

// ─── Validation Mock Data ───────────────────────────────────────
const VALIDATION_ROWS = [
    { row: 1, status: 'verified', gl: 'DT01',   amount: 312000, issue: '—' },
    { row: 2, status: 'verified', gl: 'CP0101',  amount: -89500, issue: '—' },
    { row: 3, status: 'warning',  gl: 'CP010102',amount: -15200, issue: 'Số tiền thấp hơn ngưỡng' },
    { row: 4, status: 'verified', gl: 'CP020106',amount: -125400, issue: '—' },
    { row: 5, status: 'error',    gl: '9999',    amount: 0,      issue: 'Mã GL không tồn tại' },
    { row: 6, status: 'verified', gl: 'CP0209',  amount: -53390, issue: '—' },
    { row: 7, status: 'warning',  gl: 'CP0207',  amount: -48000, issue: 'Vượt ngân sách 15%' },
    { row: 8, status: 'verified', gl: 'CP020203',amount: -24925, issue: '—' },
    { row: 9, status: 'error',    gl: 'DT01',    amount: null,   issue: 'Thiếu số tiền' },
    { row: 10,status: 'verified', gl: 'CP0211',  amount: -17800, issue: '—' },
];

// ─── Consolidated Preview Data ──────────────────────────────────
const CONSOL_DATA = {
    labels: ['Doanh thu', 'Giá vốn', 'Nhân sự', 'Hoạt động', 'EBITDA', 'Lãi ròng'],
    units: [2847500, -854250, -641000, -747521, 661679, 472394],
    eliminations: [0, 45000, 0, 28000, -73000, -51100],
    consolidated: [2847500, -809250, -641000, -719521, 734679, 523494],
};
