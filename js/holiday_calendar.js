/* ═══════════════════════════════════════════════════════════════
   VIETNAM HOLIDAY CALENDAR — Seasonal & Holiday Factors
   Auto-learns from historical data, admin can override.
   ═══════════════════════════════════════════════════════════════ */

const VN_HOLIDAYS = {

    // ─── Vietnam Public Holidays (Gregorian dates) ───────────────
    // Tet Nguyen Dan dates are hard-coded per year (lunar → solar)
    HOLIDAYS: {
        2024: [
            { name: 'Tet Nguyen Dan',    start: '2024-02-08', end: '2024-02-14', type: 'tet' },
            { name: 'Gio To Hung Vuong', start: '2024-04-18', end: '2024-04-18', type: 'gio_to' },
            { name: 'Giai phong 30/4',   start: '2024-04-30', end: '2024-05-01', type: '30_4' },
            { name: 'Quoc Khanh 2/9',    start: '2024-09-02', end: '2024-09-03', type: 'quoc_khanh' },
            { name: 'Christmas & NYE',   start: '2024-12-24', end: '2024-12-31', type: 'nye' },
        ],
        2025: [
            { name: 'Tet Nguyen Dan',    start: '2025-01-26', end: '2025-02-02', type: 'tet' },
            { name: 'Gio To Hung Vuong', start: '2025-04-07', end: '2025-04-07', type: 'gio_to' },
            { name: 'Giai phong 30/4',   start: '2025-04-30', end: '2025-05-01', type: '30_4' },
            { name: 'Quoc Khanh 2/9',    start: '2025-09-01', end: '2025-09-02', type: 'quoc_khanh' },
            { name: 'Christmas & NYE',   start: '2025-12-24', end: '2025-12-31', type: 'nye' },
        ],
        2026: [
            { name: 'Tet Nguyen Dan',    start: '2026-02-15', end: '2026-02-21', type: 'tet' },
            { name: 'Gio To Hung Vuong', start: '2026-04-26', end: '2026-04-26', type: 'gio_to' },
            { name: 'Giai phong 30/4',   start: '2026-04-30', end: '2026-05-01', type: '30_4' },
            { name: 'Quoc Khanh 2/9',    start: '2026-09-02', end: '2026-09-03', type: 'quoc_khanh' },
            { name: 'Christmas & NYE',   start: '2026-12-24', end: '2026-12-31', type: 'nye' },
        ],
        2027: [
            { name: 'Tet Nguyen Dan',    start: '2027-02-04', end: '2027-02-10', type: 'tet' },
            { name: 'Gio To Hung Vuong', start: '2027-04-15', end: '2027-04-15', type: 'gio_to' },
            { name: 'Giai phong 30/4',   start: '2027-04-30', end: '2027-05-01', type: '30_4' },
            { name: 'Quoc Khanh 2/9',    start: '2027-09-02', end: '2027-09-03', type: 'quoc_khanh' },
            { name: 'Christmas & NYE',   start: '2027-12-24', end: '2027-12-31', type: 'nye' },
        ],
        2028: [
            { name: 'Tet Nguyen Dan',    start: '2028-01-25', end: '2028-01-31', type: 'tet' },
            { name: 'Gio To Hung Vuong', start: '2028-04-03', end: '2028-04-03', type: 'gio_to' },
            { name: 'Giai phong 30/4',   start: '2028-04-28', end: '2028-05-01', type: '30_4' },
            { name: 'Quoc Khanh 2/9',    start: '2028-09-01', end: '2028-09-04', type: 'quoc_khanh' },
            { name: 'Christmas & NYE',   start: '2028-12-22', end: '2028-12-31', type: 'nye' },
        ],
    },

    // ─── Default holiday factors (fallback before learning) ──────
    DEFAULT_FACTORS: {
        tet:         1.45,   // Tet: strong boost (~45% more guests)
        gio_to:      1.12,   // Gio To Hung Vuong: moderate
        '30_4':      1.20,   // Liberation Day + Labour Day
        quoc_khanh:  1.10,   // National Day
        nye:         1.15,   // Christmas + New Year's Eve
    },

    // ─── Admin overrides (loaded from server) ────────────────────
    _adminOverrides: {},    // { 'tet': 1.5, ... }
    _learnedFactors: {},    // { 'tet': 1.42, ... }

    /**
     * Set admin overrides for holiday factors.
     * @param {Object} overrides - { type: factor, ... }
     */
    setAdminOverrides(overrides) {
        this._adminOverrides = overrides || {};
    },

    /**
     * Get the list of holidays that fall in a given month/year.
     * @returns {Array} holidays with { name, type, days_in_month }
     */
    getHolidaysInMonth(month, year) {
        const yearHolidays = this.HOLIDAYS[year] || [];
        const result = [];

        yearHolidays.forEach(h => {
            const start = new Date(h.start);
            const end = new Date(h.end);

            // Count how many holiday days fall in this month
            let daysInMonth = 0;
            const d = new Date(start);
            while (d <= end) {
                if (d.getMonth() + 1 === month && d.getFullYear() === year) {
                    daysInMonth++;
                }
                d.setDate(d.getDate() + 1);
            }

            if (daysInMonth > 0) {
                result.push({
                    name: h.name,
                    type: h.type,
                    days_in_month: daysInMonth
                });
            }
        });

        return result;
    },

    /**
     * Learn holiday factors from historical TC data.
     * Compares TC in holiday months vs non-holiday months.
     *
     * @param {Array} historicalData - [{ datekey: YYYYMM, TC: value }, ...]
     * @returns {Object} learned factors by holiday type
     */
    learnHolidayFactors(historicalData) {
        if (!historicalData || historicalData.length < 6) {
            return { ...this.DEFAULT_FACTORS };
        }

        // Group TC by month and identify holiday months
        const monthlyTC = {};
        const nonHolidayTCs = [];
        const holidayMonthData = {}; // { type: [{ tc, days }] }

        historicalData.forEach(row => {
            const dk = parseInt(row.datekey);
            const year = Math.floor(dk / 100);
            const month = dk % 100;
            const tc = parseFloat(row.TC) || 0;
            if (tc <= 0) return;

            // Days in month for normalization
            const daysInMonth = new Date(year, month, 0).getDate();
            const dailyAvgTC = tc / daysInMonth;

            monthlyTC[dk] = { tc, dailyAvgTC, year, month };

            // Check if this month has holidays
            const holidays = this.getHolidaysInMonth(month, year);
            if (holidays.length > 0) {
                holidays.forEach(h => {
                    if (!holidayMonthData[h.type]) holidayMonthData[h.type] = [];
                    holidayMonthData[h.type].push({ dailyAvgTC, days: h.days_in_month });
                });
            } else {
                nonHolidayTCs.push(dailyAvgTC);
            }
        });

        // Baseline: average daily TC in non-holiday months
        const baseline = nonHolidayTCs.length > 0
            ? nonHolidayTCs.reduce((a, b) => a + b, 0) / nonHolidayTCs.length
            : 1;

        // Compute factor for each holiday type
        const learned = {};
        Object.keys(this.DEFAULT_FACTORS).forEach(type => {
            const data = holidayMonthData[type];
            if (data && data.length > 0 && baseline > 0) {
                const avgHolidayTC = data.reduce((a, d) => a + d.dailyAvgTC, 0) / data.length;
                const rawFactor = avgHolidayTC / baseline;
                // Clamp to reasonable range [0.7, 2.5]
                learned[type] = Math.max(0.7, Math.min(2.5, rawFactor));
            } else {
                learned[type] = this.DEFAULT_FACTORS[type];
            }
        });

        this._learnedFactors = learned;
        return learned;
    },

    /**
     * Get the effective holiday factor for a given month/year.
     * Priority: admin override > learned > default
     *
     * @returns {number} multiplier (1.0 = no effect)
     */
    getHolidayFactor(month, year) {
        const holidays = this.getHolidaysInMonth(month, year);
        if (holidays.length === 0) return 1.0;

        // Get total days in month
        const totalDays = new Date(year, month, 0).getDate();

        // Weighted factor: only holiday days get the factor, rest are 1.0
        let weightedFactor = 0;
        let holidayDaysTotal = 0;

        holidays.forEach(h => {
            const factor = this._adminOverrides[h.type]
                        || this._learnedFactors[h.type]
                        || this.DEFAULT_FACTORS[h.type]
                        || 1.0;
            weightedFactor += factor * h.days_in_month;
            holidayDaysTotal += h.days_in_month;
        });

        // Non-holiday days have factor 1.0
        const nonHolidayDays = totalDays - holidayDaysTotal;
        const totalWeighted = weightedFactor + (nonHolidayDays * 1.0);

        return totalWeighted / totalDays;
    },

    /**
     * Compute seasonal factors from historical data (YoY monthly pattern).
     * Returns factor for each month (1-12) relative to annual average.
     *
     * @param {Array} historicalData - [{ datekey: YYYYMM, TC: value }, ...]
     * @returns {Object} { 1: 0.95, 2: 1.1, ..., 12: 1.05 }
     */
    getSeasonalFactors(historicalData) {
        if (!historicalData || historicalData.length < 6) {
            // Not enough data: return flat seasonality
            const flat = {};
            for (let m = 1; m <= 12; m++) flat[m] = 1.0;
            return flat;
        }

        // Group TC by month (across years)
        const monthBuckets = {};
        for (let m = 1; m <= 12; m++) monthBuckets[m] = [];

        historicalData.forEach(row => {
            const dk = parseInt(row.datekey);
            const month = dk % 100;
            const year = Math.floor(dk / 100);
            const tc = parseFloat(row.TC) || 0;
            if (tc <= 0) return;

            // Normalize by days in month
            const daysInMonth = new Date(year, month, 0).getDate();
            const dailyAvg = tc / daysInMonth;
            monthBuckets[month].push(dailyAvg);
        });

        // Compute average daily TC per month
        const monthAvg = {};
        let totalAvg = 0;
        let countMonths = 0;

        for (let m = 1; m <= 12; m++) {
            const vals = monthBuckets[m];
            if (vals.length > 0) {
                monthAvg[m] = vals.reduce((a, b) => a + b, 0) / vals.length;
                totalAvg += monthAvg[m];
                countMonths++;
            } else {
                monthAvg[m] = null;
            }
        }

        const overallAvg = countMonths > 0 ? totalAvg / countMonths : 1;

        // Seasonal factor = month avg / overall avg
        const factors = {};
        for (let m = 1; m <= 12; m++) {
            if (monthAvg[m] !== null && overallAvg > 0) {
                factors[m] = Math.max(0.5, Math.min(2.0, monthAvg[m] / overallAvg));
            } else {
                factors[m] = 1.0;
            }
        }

        return factors;
    },

    /**
     * Get seasonal factor for a specific month.
     * @param {number} month - 1-12
     * @param {Array} historicalData
     * @returns {number} seasonal multiplier
     */
    getSeasonalFactor(month, historicalData) {
        const factors = this.getSeasonalFactors(historicalData);
        return factors[month] || 1.0;
    },

    /**
     * Get combined adjustment factor (seasonal × holiday).
     */
    getCombinedFactor(month, year, historicalData) {
        const seasonal = this.getSeasonalFactor(month, historicalData);
        const holiday = this.getHolidayFactor(month, year);
        return seasonal * holiday;
    },

    /**
     * Get summary for display in UI.
     */
    getSummary(month, year, historicalData) {
        const holidays = this.getHolidaysInMonth(month, year);
        const seasonal = this.getSeasonalFactor(month, historicalData);
        const holiday = this.getHolidayFactor(month, year);

        return {
            month, year,
            holidays: holidays.map(h => ({
                name: h.name,
                type: h.type,
                days: h.days_in_month,
                factor: this._adminOverrides[h.type]
                     || this._learnedFactors[h.type]
                     || this.DEFAULT_FACTORS[h.type] || 1.0,
                source: this._adminOverrides[h.type] ? 'admin'
                      : this._learnedFactors[h.type] ? 'learned' : 'default'
            })),
            seasonalFactor: Math.round(seasonal * 1000) / 1000,
            holidayFactor: Math.round(holiday * 1000) / 1000,
            combinedFactor: Math.round(seasonal * holiday * 1000) / 1000,
        };
    }
};
