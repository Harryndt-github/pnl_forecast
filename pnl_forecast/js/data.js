/* ═══════════════════════════════════════════════════════════════
   PNL FORECAST — PnL Line Items (DB-aligned hierarchy)
   Code logic (FC213_FACT_ACT indicator_code):
     2-char  = root group  (TC)
     4-char  = level 1     (DT01, SD01, CP01, SD02 …)
     6-char  = level 2     (CP0201, CP0202 …)
   Parent actual = SUM of direct children that share the code prefix.
   ═══════════════════════════════════════════════════════════════ */

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CURRENT_MONTH = 3; // April (0-indexed)

// ─── PnL Line Items ─────────────────────────────────────────────
const PNL_DATA = [
    { code: 'TC',     label: 'Số lượt khách',             actual: 0, forecast: 0, prior: 0 },
    { code: 'TA',     label: 'Doanh thu TB / khách',      actual: 0, forecast: 0, prior: 0, isFormula: true, formulaDesc: 'DT01 / TC' },
    { code: 'DT01',   label: 'Revenue',                 actual: 0, forecast: 0, prior: 0 },
    { code: 'DT02',   label: 'Discount',                actual: 0, forecast: 0, prior: 0 },
    { code: 'SD01',   label: 'Net Revenue',             actual: 0, forecast: 0, prior: 0, isFormula: true, formulaDesc: 'DT01 - DT02' },
    { code: 'CP01',   label: 'COGS',                    actual: 0, forecast: 0, prior: 0 },
    { code: 'SD02',   label: 'Gross profit',            actual: 0, forecast: 0, prior: 0, isFormula: true, formulaDesc: 'SD01 - CP01' },
    
    // Operating Expenses (CP02XX)
    { code: 'CP0201', label: 'COL',                     actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0202', label: 'Utilities',               actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0203', label: 'Tools',                   actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0204', label: 'Prod. Develop.',          actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0205', label: 'Maintenance',             actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0206', label: 'Other',                   actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0207', label: 'Marketing',               actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0208', label: 'Loyalty fee',             actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0209', label: 'Rental fee',              actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0210', label: 'General cost',            actual: 0, forecast: 0, prior: 0 },
    { code: 'CP0211', label: 'Store D&A',               actual: 0, forecast: 0, prior: 0 },

    { code: 'SD03',   label: 'CM',                      actual: 0, forecast: 0, prior: 0, isFormula: true, formulaDesc: 'SD02 - SUM(CP02XX)' },
    { code: 'SD04',   label: 'UC',                      actual: 0, forecast: 0, prior: 0 },
    
    { code: 'DT03',   label: 'Financial income',        actual: 0, forecast: 0, prior: 0 },
    { code: 'CP05',   label: 'Financial expense',       actual: 0, forecast: 0, prior: 0 },
    { code: 'DT04',   label: '- Other income',          actual: 0, forecast: 0, prior: 0 },
    { code: 'CP06',   label: '- Other expense',         actual: 0, forecast: 0, prior: 0 },
    { code: 'CP07',   label: 'Mgt. Bonus',              actual: 0, forecast: 0, prior: 0 },
    { code: 'CP08',   label: 'CIT',                     actual: 0, forecast: 0, prior: 0 },
    
    { code: 'SD09',   label: 'Profit after tax',        actual: 0, forecast: 0, prior: 0 },
    { code: 'SD10',   label: 'EBITDA',                  actual: 0, forecast: 0, prior: 0 }
];

// ─── Forecast Settings (Base values & methods) ───
const FORECAST_SETTINGS = {
    'TC':     { configured: true,  method: 'historical', base: 50000 },
    'TA':     { configured: true,  method: null,         base: 0 },  // formula: DT01 / TC
    'DT01':   { configured: true,  method: 'historical', base: 3120000 },
    'DT02':   { configured: true,  method: 'fixed',      base: 156000 },
    'SD01':   { configured: true,  method: 'historical', base: 0 },
    'CP01':   { configured: true,  method: 'anchor',     base: 854250 },
    'SD02':   { configured: true,  method: 'historical', base: 0 },
    'CP0201': { configured: true,  method: 'fixed',      base: 641000 },
    'CP0202': { configured: true,  method: 'historical', base: 99663 },
    'CP0209': { configured: true,  method: 'fixed',      base: 227850 },
    'CP0211': { configured: true,  method: 'fixed',      base: 56950 },
    'SD03':   { configured: true,  method: 'historical', base: 0 },
    'SD04':   { configured: true,  method: 'historical', base: 0 },
    'DT03':   { configured: false, method: null,         base: 5000 },
    'CP05':   { configured: false, method: null,         base: 12000 },
    'DT04':   { configured: false, method: null,         base: 3000 },
    'CP06':   { configured: false, method: null,         base: 2000 },
    'CP07':   { configured: false, method: null,         base: 10000 },
    'CP08':   { configured: false, method: null,         base: 50000 },
    'SD09':   { configured: true,  method: 'historical', base: 0 },
    'SD10':   { configured: true,  method: 'historical', base: 0 },
};

// Generate FORECAST_ITEMS from PNL_DATA to ensure 100% sync
const FORECAST_ITEMS = PNL_DATA.map(pnl => {
    const settings = FORECAST_SETTINGS[pnl.code] || { configured: false, method: null, base: 0 };
    return {
        code: pnl.code,
        name: pnl.label,
        ...settings
    };
});



// ─── Entity Hierarchy ───
const ENTITY_HIERARCHY = {
    name: 'Aeon Holdings Group',
    type: 'group',
    children: [
        {
            name: 'Miền Bắc',
            type: 'region',
            children: [
                { name: 'Unit #01 Hà Nội Phố Cổ', type: 'unit' },
                { name: 'Unit #02 Hà Nội Tây Hồ', type: 'unit' },
                { name: 'Unit #03 Hải Phòng Central', type: 'unit' },
            ]
        },
        {
            name: 'Miền Nam',
            type: 'region',
            children: [
                { name: 'Unit #10 HCMC Quận 1', type: 'unit' },
                { name: 'Unit #11 HCMC Bình Thạnh', type: 'unit' },
                { name: 'Unit #12 Saigon Central', type: 'unit' },
                { name: 'Unit #13 HCMC Thủ Đức', type: 'unit' },
            ]
        },
        {
            name: 'Miền Trung',
            type: 'region',
            children: [
                { name: 'Unit #20 Đà Nẵng Beach', type: 'unit' },
                { name: 'Unit #21 Huế Imperial', type: 'unit' },
            ]
        },
        {
            name: 'Tây Nguyên & Duyên hải',
            type: 'region',
            children: [
                { name: 'Unit #30 Nha Trang Bay', type: 'unit' },
                { name: 'Unit #31 Đà Lạt Highland', type: 'unit' },
            ]
        }
    ]
};

// ─── GL Code Mappings ───
const GL_MAPPINGS = [
    { code: 'DT01',   desc: 'Doanh thu bán hàng',    target: 'Doanh thu thuần' },
    { code: 'CP01',   desc: 'Nguyên vật liệu',       target: 'Giá vốn hàng bán' },
    { code: 'CP0102', desc: 'Bao bì đóng gói',       target: 'Giá vốn — Bao bì' },
    { code: 'CP02',   desc: 'Lương & phụ cấp',        target: 'Chi phí nhân sự' },
    { code: 'CP0203', desc: 'BHXH / BHYT / BHTN',     target: 'Nhân sự — Bảo hiểm' },
    { code: 'CP03',   desc: 'Thuê mặt bằng',         target: 'Chi phí thuê' },
    { code: 'CP04',   desc: 'Điện nước gas',          target: 'Chi phí tiện ích' },
    { code: 'CP05',   desc: 'Marketing',              target: 'Chi phí marketing' },
    { code: 'CP06',   desc: 'Công nghệ / IT',         target: 'Chi phí công nghệ' },
    { code: 'CP10',   desc: 'Khấu hao TSCĐ',         target: 'Khấu hao & phân bổ' },
];

// ─── Validation Mock Data ───
const VALIDATION_ROWS = [
    { row: 1, status: 'verified', gl: 'DT01', amount: 312000, issue: '—' },
    { row: 2, status: 'verified', gl: 'DT01', amount: 285000, issue: '—' },
    { row: 3, status: 'verified', gl: 'CP0101', amount: -89500, issue: '—' },
    { row: 4, status: 'warning', gl: 'CP0102', amount: -15200, issue: 'Số tiền thấp hơn ngưỡng' },
    { row: 5, status: 'verified', gl: 'CP0201', amount: -125400, issue: '—' },
    { row: 6, status: 'error', gl: '9999', amount: 0, issue: 'Mã GL không tồn tại' },
    { row: 7, status: 'verified', gl: 'CP0301', amount: -53390, issue: '—' },
    { row: 8, status: 'warning', gl: 'CP0501', amount: -48000, issue: 'Vượt ngân sách 15%' },
    { row: 9, status: 'verified', gl: 'CP0203', amount: -24925, issue: '—' },
    { row: 10, status: 'error', gl: 'DT01', amount: null, issue: 'Thiếu số tiền' },
    { row: 11, status: 'verified', gl: 'CP0401', amount: -17800, issue: '—' },
    { row: 12, status: 'warning', gl: 'CP0601', amount: -12500, issue: 'Nghi ngờ trùng lặp' },
    { row: 13, status: 'verified', gl: 'CP0101', amount: -92100, issue: '—' },
    { row: 14, status: 'error', gl: '', amount: 5600, issue: 'Thiếu mã GL' },
    { row: 15, status: 'verified', gl: 'DT01', amount: 298000, issue: '—' },
];

// ─── Consolidated Preview Data ───
const CONSOL_DATA = {
    labels: ['Doanh thu', 'Giá vốn', 'Nhân sự', 'Hoạt động', 'EBITDA', 'Lãi ròng'],
    units: [2847500, -854250, -641000, -747521, 661679, 472394],
    eliminations: [0, 45000, 0, 28000, -73000, -51100],
    consolidated: [2847500, -809250, -641000, -719521, 734679, 523494],
};
