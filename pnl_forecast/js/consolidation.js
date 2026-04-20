/* ═══════════════════════════════════════════════════════════════
   PNL FORECAST — Module 4: Consolidation & Adjustment
   
   Flow:
     1. Forecast.computeResult → imported here on tab open
     2. User views data by All / Chain / Restaurant
     3. User clicks a cell to adjust (increase / decrease)
     4. Adjustments are tracked in a log
     5. "Lưu Final" saves the adjusted report to localStorage
   ═══════════════════════════════════════════════════════════════ */

const Consolidation = {
    /* ── State ── */
    sourceData: null,           // Raw forecast result from Forecast module
    baseProjections: null,      // Unmodified forecast baseline for current context (Forecast column)
    adjustedProjections: null,  // Deep-copy of projections with user edits (current context)
    adjInputs: {},              // Raw adj strings: { 'DT01_202504': '+5%', ... } (current context)
    adjustments: [],            // [{ code, datekey, oldVal, newVal, delta, adjStr, time }] (current context)
    adjContexts: {},            // Per-context snapshots: { 'all': {...}, 'chain_10GG': {...}, ... }
    currentContextKey: 'all',   // Key of the active context
    savedReports: [],           // Persisted final reports
    currentView: 'all',         // 'all' | 'chain' | 'restaurant'
    currentFilter: '',          // Selected chain/restaurant code
    _lastResultId: null,        // Change-detection for new forecast runs

    /* ═══════════════════════════════════════════════════════════
       INIT — Called when the Consolidation tab is activated
       ═══════════════════════════════════════════════════════════ */
    init() {
        this._loadSavedReports();
        this._renderSavedReports();
        this.bindEvents();
        this.refreshFromForecast();
    },

    /* ═══════════════════════════════════════════════════════════
       IMPORT — Pull data from Forecast.computeResult
       ═══════════════════════════════════════════════════════════ */
    refreshFromForecast() {
        // Read from the global `Forecast` object (defined in forecast.js as `const Forecast = {...}`)
        const result = typeof Forecast !== 'undefined'
            ? Forecast.computeResult
            : null;

        const statusBar  = document.getElementById('consolStatusBar');
        const statusText = document.getElementById('consolStatusText');
        const statusIcon = document.querySelector('.consol-status-icon');

        if (!result || !result.projections || result.projections.length === 0) {
            if (statusBar)  statusBar.className = 'consol-status-bar status-warning';
            if (statusIcon) statusIcon.textContent = '⚠️';
            if (statusText) statusText.textContent = 'Chưa có dữ liệu Forecast. Vui lòng chạy Forecast Builder trước.';
            this._hideDataPanels();
            return;
        }

        // Detect if this is genuinely new forecast data (different run)
        const newId = (result.filter || '') + '_' + (result.projections.length || 0)
                    + '_' + (result.projections[0]?.datekey || '');
        const isNewData = (this._lastResultId !== newId);
        this._lastResultId = newId;

        // Always store source; only reset ALL contexts when genuinely new forecast
        this.sourceData = result;
        if (isNewData) {
            // Full reset: new forecast invalidates all previous adj contexts
            this.adjContexts       = {};
            this.currentContextKey = 'all';
            this.currentView       = 'all';
            this.currentFilter     = '';
            // baseProjections = raw API values for Forecast column
            this.baseProjections      = JSON.parse(JSON.stringify(result.projections));
            this.adjustedProjections  = JSON.parse(JSON.stringify(result.projections))
                .map(r => this._computeFormulas({ ...r, datekey: parseInt(r.datekey) }));
            this.adjustments = [];
            this.adjInputs   = {};
            // Reset view buttons
            document.querySelectorAll('.consol-view-btn').forEach(b => b.classList.remove('active'));
            const allBtn = document.querySelector('.consol-view-btn[data-view="all"]');
            if (allBtn) allBtn.classList.add('active');
            const fw = document.getElementById('consolFilterWrap');
            if (fw) fw.style.display = 'none';
        }

        // Update status
        const filterDesc = result.filter || 'ALL';
        const periods    = result.projections.length;
        const ctxLabel   = this._contextLabel();
        const adjNote    = this.adjustments.length > 0 ? ` · ${this.adjustments.length} adj` : '';
        if (statusBar)  statusBar.className = 'consol-status-bar status-ok';
        if (statusIcon) statusIcon.textContent = '✅';
        if (statusText) statusText.textContent =
            `Dữ liệu Forecast: ${periods} kỳ · Filter: ${filterDesc} · ${result.method || '—'} · Đang xem: ${ctxLabel}${adjNote}`;

        this._showDataPanels();
        this._populateFilterOptions();
        this.renderTable();
        this._updateAdjSummary();
        if (this.adjustments.length > 0) this._renderAdjLog();
    },

    /* ═══════════════════════════════════════════════════════════
       CONTEXT MANAGEMENT
       Each view context (all / chain_X / rest_Y) has its own
       independent adj state stored in adjContexts.
       ═══════════════════════════════════════════════════════════ */
    _getContextKey() {
        if (this.currentView === 'all')        return 'all';
        if (this.currentView === 'chain')      return `chain_${this.currentFilter}`;
        return `rest_${this.currentFilter}`;
    },

    _contextLabel() {
        if (this.currentView === 'all')        return 'Tổng hợp';
        if (this.currentView === 'chain')      return `Chuỗi: ${this.currentFilter || '—'}`;
        return `NH: ${this.currentFilter || '—'}`;
    },

    // Snapshot the current working state into adjContexts
    _saveCurrentContext() {
        const key = this.currentContextKey;
        if (!key) return;
        this.adjContexts[key] = {
            baseProjections:     JSON.parse(JSON.stringify(this.baseProjections || [])),
            adjInputs:           JSON.parse(JSON.stringify(this.adjInputs || {})),
            adjustments:         JSON.parse(JSON.stringify(this.adjustments || [])),
            adjustedProjections: JSON.parse(JSON.stringify(this.adjustedProjections || [])),
        };
    },

    // Load a saved context, or start fresh.
    // freshProjections = post-formula projections (for adjustedProjections)
    // rawProjections   = raw API values (for baseProjections / Forecast column)
    _loadContext(key, freshProjections, rawProjections) {
        this.currentContextKey = key;
        const saved = this.adjContexts[key];
        if (saved && saved.adjustedProjections && saved.adjustedProjections.length > 0) {
            this.baseProjections     = JSON.parse(JSON.stringify(saved.baseProjections || rawProjections || freshProjections || []));
            this.adjInputs           = JSON.parse(JSON.stringify(saved.adjInputs));
            this.adjustments         = JSON.parse(JSON.stringify(saved.adjustments));
            this.adjustedProjections = JSON.parse(JSON.stringify(saved.adjustedProjections));
        } else {
            this.baseProjections     = rawProjections || freshProjections || [];
            this.adjInputs           = {};
            this.adjustments         = [];
            this.adjustedProjections = freshProjections || [];
        }
    },

    // Update status bar with current context info
    _refreshStatus() {
        const statusBar  = document.getElementById('consolStatusBar');
        const statusText = document.getElementById('consolStatusText');
        const statusIcon = document.querySelector('.consol-status-icon');
        if (!this.sourceData) return;
        const filterDesc = this.sourceData.filter || 'ALL';
        const periods    = this.sourceData.projections?.length || 0;
        const ctxLabel   = this._contextLabel();
        const adjNote    = this.adjustments.length > 0 ? ` · ${this.adjustments.length} adj` : '';
        const allCtxAdj  = Object.values(this.adjContexts).reduce((s, c) => s + (c.adjustments?.length || 0), 0)
                         + this.adjustments.length;
        const totalNote  = allCtxAdj > this.adjustments.length ? ` (tổng ${allCtxAdj} adj toàn hệ thống)` : '';
        if (statusBar)  statusBar.className = 'consol-status-bar status-ok';
        if (statusIcon) statusIcon.textContent = '✅';
        if (statusText) statusText.textContent =
            `${periods} kỳ · Filter: ${filterDesc} · ${this.sourceData.method || '—'} · 📍 ${ctxLabel}${adjNote}${totalNote}`;
    },

    /* ═══════════════════════════════════════════════════════════
       RENDER — Build the P&L table with dedicated Adj column
       Columns per period: Forecast | Adj (input) | Final
       ═══════════════════════════════════════════════════════════ */
    renderTable() {
        const thead = document.getElementById('consolThead');
        const tbody = document.getElementById('consolTbody');
        if (!thead || !tbody || !this.adjustedProjections) return;

        // Build period descriptors
        const periods = this.adjustedProjections.map(r => {
            const dk = parseInt(r.datekey);
            const m  = dk % 100;
            const y  = Math.floor(dk / 100);
            return { dk, label: `T${m}/${y}` };
        });

        // ── Header row: Mã | Chỉ tiêu | [Forecast | Adj | Final] per period ──
        thead.innerHTML = `
            <th class="col-code">Mã</th>
            <th class="col-item">Chỉ tiêu</th>
            ${periods.map(p => `
                <th class="col-forecast-hdr">🔮 ${p.label}</th>
                <th class="col-adj-hdr">△ Adj</th>
                <th class="col-final-hdr">✅ Final</th>
            `).join('')}
        `;

        // ── Body rows ──
        const rows = PNL_DATA.map(item => {
            const isFormula = !!item.isFormula;
            const level     = this._getLevel(item.code);
            const rowClass  = isFormula ? 'row-formula' : (level === 0 ? 'row-parent' : '');
            const indent    = level === 2 ? 'indent-2' : (level === 1 ? 'indent-1' : '');

            const cells = periods.map((p, pi) => {
                // Original forecast value — uses context-specific baseline (NOT aggregate)
                const origRow  = this.baseProjections ? this.baseProjections[pi] : null;
                const origVal  = origRow ? (origRow[item.code] ?? 0) : 0;

                // Final value after adjustment (may use _computeFormulas result)
                const finalRow = this.adjustedProjections[pi];
                const finalVal = finalRow ? (finalRow[item.code] ?? 0) : 0;

                const adjKey = `${item.code}_${p.dk}`;
                const adjStr = this.adjInputs[adjKey] || '';

                // Delta between final and original
                const delta     = Math.round(finalVal - origVal);
                const hasAdj    = delta !== 0;
                const deltaHtml = hasAdj
                    ? `<span class="adj-delta-hint ${delta > 0 ? 'delta-pos' : 'delta-neg'}">` +
                      `${delta > 0 ? '+' : ''}${this._fmt(delta)}</span>`
                    : '';

                if (isFormula) {
                    // Formula rows: show original + formula result, no adj input
                    return `
                        <td class="consol-cell cell-forecast">${this._fmt(origVal)}</td>
                        <td class="consol-cell adj-cell-formula" title="Tự động tính theo công thức">—</td>
                        <td class="consol-cell final-cell ${hasAdj ? 'cell-has-adj' : ''}">${this._fmt(finalVal)}</td>
                    `;
                } else {
                    // Editable rows: Forecast (read-only) | Adj input (text) | Final
                    return `
                        <td class="consol-cell cell-forecast">${this._fmt(origVal)}</td>
                        <td class="consol-cell adj-cell">
                            <input class="adj-col-input"
                                   type="text"
                                   placeholder="+5% / -1M"
                                   value="${adjStr}"
                                   data-code="${item.code}"
                                   data-dk="${p.dk}"
                                   data-pi="${pi}"
                                   data-orig="${origVal}"
                                   title="Nhập số tuyệt đối (+5000) hoặc phần trăm (+5%)"
                            >
                            ${deltaHtml}
                        </td>
                        <td class="consol-cell final-cell ${hasAdj ? 'cell-has-adj' : ''}">${this._fmt(finalVal)}</td>
                    `;
                }
            }).join('');

            return `<tr class="${rowClass}">
                <td class="col-code"><span class="code-tag code-level-${level}">${item.code}</span></td>
                <td class="col-item ${indent}">${item.label}</td>
                ${cells}
            </tr>`;
        }).join('');

        tbody.innerHTML = rows;
        this._bindCellEvents();
    },

    /* ═══════════════════════════════════════════════════════════
       CELL EVENTS — Adj column input handler
       Supports: +5000000 | -3% | +10% | 2000000
       ═══════════════════════════════════════════════════════════ */
    _bindCellEvents() {
        document.querySelectorAll('#consolTbody .adj-col-input').forEach(input => {
            // Apply on blur
            input.addEventListener('blur', () => {
                this._applyAdjFromInput(input);
            });
            // Apply on Enter key
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
                if (e.key === 'Escape') { input.value = ''; input.blur(); }
            });
        });
    },

    /* ═══════════════════════════════════════════════════════════
       PARSE ADJ INPUT — Handles % and absolute amounts
       Examples: '+5%' → +5% of original
                 '-3%' → -3% of original
                 '+1000000' → add 1,000,000
                 '-500000'  → subtract 500,000
                 '5M' or '5m' → +5,000,000
                 '' or '0'  → no adjustment
       ═══════════════════════════════════════════════════════════ */
    _parseAdjInput(str, origVal) {
        if (!str || str.trim() === '' || str.trim() === '0') {
            return { delta: 0, newVal: origVal };
        }
        const s = str.trim();

        // Percentage: ends with %
        if (s.endsWith('%')) {
            const pct = parseFloat(s) || 0;    // e.g. '-3.5'
            const delta = Math.round(origVal * pct / 100);
            return { delta, newVal: origVal + delta };
        }

        // Shorthand: M (millions), B (billions), K (thousands)
        const shortRe = /^([+-]?)([\d.]+)([MmBbKk])$/.exec(s);
        if (shortRe) {
            const sign   = shortRe[1] === '-' ? -1 : 1;
            const num    = parseFloat(shortRe[2]) || 0;
            const mult   = { m: 1e6, b: 1e9, k: 1e3 }[shortRe[3].toLowerCase()];
            const delta  = Math.round(sign * num * mult);
            return { delta, newVal: origVal + delta };
        }

        // Absolute number (may include commas)
        const delta = parseFloat(s.replace(/,/g, '').replace(/\./g, '')) || 0;
        return { delta, newVal: origVal + delta };
    },

    _applyAdjFromInput(input) {
        const code    = input.dataset.code;
        const dk      = parseInt(input.dataset.dk);
        const pi      = parseInt(input.dataset.pi);
        const origVal = parseFloat(input.dataset.orig) || 0;
        const adjStr  = input.value.trim();
        const adjKey  = `${code}_${dk}`;

        // Store raw input string (even if blank = clear adj)
        this.adjInputs[adjKey] = adjStr;

        const { delta, newVal } = this._parseAdjInput(adjStr, origVal);

        // Update the adjusted projection row
        if (this.adjustedProjections[pi]) {
            this.adjustedProjections[pi][code] = Math.round(newVal);
            this.adjustedProjections[pi] = this._computeFormulas(this.adjustedProjections[pi]);
        }

        // Update log: replace existing entry for same code+datekey
        this.adjustments = this.adjustments.filter(a => !(a.code === code && a.datekey === dk));
        if (delta !== 0) {
            this.adjustments.push({
                code,
                datekey: dk,
                oldVal:  Math.round(origVal),
                newVal:  Math.round(newVal),
                delta:   Math.round(delta),
                adjStr,
                time:    new Date().toLocaleTimeString('vi-VN')
            });
        }

        // Partial re-render: only update Final cells and formula rows
        this.renderTable();
        this._updateAdjSummary();
        this._renderAdjLog();
        this._refreshStatus();
    },


    /* ═══════════════════════════════════════════════════════════
       ADJUSTMENT SUMMARY & LOG
       ═══════════════════════════════════════════════════════════ */
    _updateAdjSummary() {
        const summaryEl = document.getElementById('consolAdjSummary');
        const countEl   = document.getElementById('adjCount');
        const impactEl  = document.getElementById('adjImpact');

        if (!summaryEl) return;

        if (this.adjustments.length === 0) {
            summaryEl.style.display = 'none';
            return;
        }

        summaryEl.style.display = 'flex';
        countEl.textContent = `${this.adjustments.length} điều chỉnh`;

        // Calculate net impact on revenue (DT01)
        const revAdj = this.adjustments
            .filter(a => a.code === 'DT01')
            .reduce((sum, a) => sum + a.delta, 0);
        if (revAdj !== 0) {
            const sign = revAdj > 0 ? '+' : '';
            impactEl.textContent = `Tác động DT: ${sign}${this._fmt(revAdj)}`;
            impactEl.className = `adj-impact ${revAdj > 0 ? 'positive' : 'negative'}`;
        } else {
            impactEl.textContent = '';
        }
    },

    _renderAdjLog() {
        const panel = document.getElementById('consolLogPanel');
        const list  = document.getElementById('consolLogList');
        const count = document.getElementById('consolLogCount');

        if (!panel || !list) return;

        if (this.adjustments.length === 0) {
            panel.style.display = 'none';
            return;
        }

        panel.style.display = 'block';
        count.textContent = this.adjustments.length;

        // Show latest 20 adjustments (newest first)
        const recent = [...this.adjustments].reverse().slice(0, 20);
        list.innerHTML = recent.map(a => {
            const sign = a.delta > 0 ? '+' : '';
            const cls  = a.delta > 0 ? 'log-positive' : 'log-negative';
            const dk = a.datekey;
            const m = dk % 100;
            const y = Math.floor(dk / 100);
            return `<div class="consol-log-item ${cls}">
                <span class="log-time">${a.time}</span>
                <span class="log-code">${a.code}</span>
                <span class="log-period">T${m}/${y}</span>
                <span class="log-delta">${sign}${this._fmt(a.delta)}</span>
                <span class="log-result">${this._fmt(a.oldVal)} → ${this._fmt(a.newVal)}</span>
            </div>`;
        }).join('');
    },

    /* ═══════════════════════════════════════════════════════════
       SAVE FINAL REPORT — Persist to localStorage
       ═══════════════════════════════════════════════════════════ */
    saveFinalReport() {
        if (!this.adjustedProjections || this.adjustedProjections.length === 0) {
            Utils.toast('Không có dữ liệu để lưu', 'error');
            return;
        }

        const report = {
            id: Date.now(),
            savedAt: new Date().toLocaleString('vi-VN'),
            filter: this.sourceData?.filter || 'ALL',
            method: this.sourceData?.method || '—',
            periods: this.adjustedProjections.length,
            adjustmentCount: this.adjustments.length,
            adjustments: [...this.adjustments],
            projections: JSON.parse(JSON.stringify(this.adjustedProjections)),
            historical: this.sourceData?.historical
                ? JSON.parse(JSON.stringify(this.sourceData.historical))
                : []
        };

        this.savedReports.unshift(report);

        // Keep max 10 reports
        if (this.savedReports.length > 10) {
            this.savedReports = this.savedReports.slice(0, 10);
        }

        try {
            localStorage.setItem('pnl_consol_reports', JSON.stringify(this.savedReports));
        } catch (e) {
            console.warn('[Consolidation] localStorage save failed:', e);
        }

        this._renderSavedReports();
        Utils.toast(`✅ Báo cáo Final đã lưu (${report.adjustmentCount} điều chỉnh)`, 'success');
    },

    _loadSavedReports() {
        try {
            const stored = localStorage.getItem('pnl_consol_reports');
            this.savedReports = stored ? JSON.parse(stored) : [];
        } catch {
            this.savedReports = [];
        }
    },

    _renderSavedReports() {
        const list  = document.getElementById('consolSavedList');
        const count = document.getElementById('savedReportCount');
        if (!list) return;

        count.textContent = this.savedReports.length;

        if (this.savedReports.length === 0) {
            list.innerHTML = '<div class="consol-empty-state">Chưa có báo cáo nào được lưu.</div>';
            return;
        }

        list.innerHTML = this.savedReports.map(r => `
            <div class="saved-report-item" data-id="${r.id}">
                <div class="saved-report-info">
                    <span class="saved-report-time">📅 ${r.savedAt}</span>
                    <span class="saved-report-meta">${r.periods} kỳ · ${r.method} · ${r.adjustmentCount} adj</span>
                    <span class="saved-report-filter">🏪 ${r.filter}</span>
                </div>
                <div class="saved-report-actions">
                    <button class="btn btn-xs btn-outline saved-load" data-id="${r.id}" title="Tải lại">📂 Tải</button>
                    <button class="btn btn-xs btn-outline saved-export" data-id="${r.id}" title="Export">📥</button>
                    <button class="btn btn-xs btn-danger saved-delete" data-id="${r.id}" title="Xóa">🗑</button>
                </div>
            </div>
        `).join('');

        // Bind events for saved reports
        list.querySelectorAll('.saved-load').forEach(btn => {
            btn.addEventListener('click', () => this._loadReport(parseInt(btn.dataset.id)));
        });
        list.querySelectorAll('.saved-export').forEach(btn => {
            btn.addEventListener('click', () => this._exportReport(parseInt(btn.dataset.id)));
        });
        list.querySelectorAll('.saved-delete').forEach(btn => {
            btn.addEventListener('click', () => this._deleteReport(parseInt(btn.dataset.id)));
        });
    },

    _loadReport(id) {
        const report = this.savedReports.find(r => r.id === id);
        if (!report) return;

        this.adjustedProjections = JSON.parse(JSON.stringify(report.projections));
        this.adjustments = [...(report.adjustments || [])];

        // Update status
        const statusText = document.getElementById('consolStatusText');
        if (statusText) statusText.textContent = `📂 Báo cáo đã lưu: ${report.savedAt} · ${report.periods} kỳ · ${report.adjustmentCount} điều chỉnh`;

        this._showDataPanels();
        this.renderTable();
        this._updateAdjSummary();
        this._renderAdjLog();
        Utils.toast('📂 Đã tải báo cáo', 'info');
    },

    _deleteReport(id) {
        this.savedReports = this.savedReports.filter(r => r.id !== id);
        try {
            localStorage.setItem('pnl_consol_reports', JSON.stringify(this.savedReports));
        } catch (e) { /* ignore */ }
        this._renderSavedReports();
        Utils.toast('🗑 Đã xóa báo cáo', 'info');
    },

    /* ═══════════════════════════════════════════════════════════
       EXPORT — Generate CSV download
       ═══════════════════════════════════════════════════════════ */
    exportCSV() {
        if (!this.adjustedProjections || this.adjustedProjections.length === 0) {
            Utils.toast('Không có dữ liệu để export', 'error');
            return;
        }
        this._exportData(this.adjustedProjections);
    },

    _exportReport(id) {
        const report = this.savedReports.find(r => r.id === id);
        if (!report) return;
        this._exportData(report.projections);
    },

    _exportData(projections) {
        const periods = projections.map(r => {
            const dk = parseInt(r.datekey);
            return `T${dk % 100}/${Math.floor(dk / 100)}`;
        });

        // CSV header
        let csv = 'Mã,Chỉ tiêu,' + periods.join(',') + '\n';

        // Each PNL_DATA row
        PNL_DATA.forEach(item => {
            const vals = projections.map(r => Math.round(r[item.code] ?? 0));
            csv += `${item.code},"${item.label}",${vals.join(',')}\n`;
        });

        // If there are adjustments, add log section
        if (this.adjustments.length > 0) {
            csv += '\n\nNhật ký điều chỉnh\n';
            csv += 'Thời gian,Mã,Kỳ,Giá trị cũ,Giá trị mới,Chênh lệch\n';
            this.adjustments.forEach(a => {
                const dk = a.datekey;
                csv += `${a.time},${a.code},T${dk % 100}/${Math.floor(dk / 100)},${a.oldVal},${a.newVal},${a.delta}\n`;
            });
        }

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `PnL_Forecast_Final_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        Utils.toast('📥 Đã export CSV', 'success');
    },

    /* ═══════════════════════════════════════════════════════════
       RESET — Clear all adjustments
       ═══════════════════════════════════════════════════════════ */
    resetAdjustments() {
        if (!this.sourceData) return;

        // Only reset the CURRENT context, not all contexts
        const key = this.currentContextKey;
        delete this.adjContexts[key];

        if (key === 'all' || !this.currentFilter) {
            // Reload aggregate baseline from sourceData
            const rawProj = JSON.parse(JSON.stringify(this.sourceData.projections));
            this.baseProjections     = rawProj;
            this.adjustedProjections = rawProj.map(r => this._computeFormulas({ ...r, datekey: parseInt(r.datekey) }));
            this.adjustments = [];
            this.adjInputs   = {};
            this.renderTable();
            this._updateAdjSummary();
            this._renderAdjLog();
            this._refreshStatus();

        } else {
            // For chain/restaurant: re-fetch fresh baseline from API
            this.adjustments = [];
            this.adjInputs   = {};
            this._fetchAndRender(this.currentFilter);
        }
        Utils.toast('🔄 Đã reset điều chỉnh của ngữ cảnh hiện tại', 'info');
    },


    /* ═══════════════════════════════════════════════════════════
       VIEW MODE & FILTER
       - 'all'        : show current aggregate projections as-is
       - 'chain'      : re-fetch forecast for a specific chain
       - 'restaurant' : re-fetch forecast for a specific restaurant
       ═══════════════════════════════════════════════════════════ */
    setView(view) {
        // 1. Save current context BEFORE changing view
        this._saveCurrentContext();

        this.currentView   = view;
        this.currentFilter = '';

        document.querySelectorAll('.consol-view-btn').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.consol-view-btn[data-view="${view}"]`);
        if (btn) btn.classList.add('active');

        const filterWrap = document.getElementById('consolFilterWrap');
        if (view === 'all') {
            if (filterWrap) filterWrap.style.display = 'none';
            this._restoreAggregateView();
        } else {
            if (filterWrap) filterWrap.style.display = 'flex';
            this._populateFilterOptions();
        }
    },

    // Return to aggregate view — load 'all' context (never wipes other contexts' adj)
    _restoreAggregateView() {
        if (!this.sourceData) return;
        // rawProj = raw API values for Forecast column; freshProj = after formula engine
        const rawProj   = JSON.parse(JSON.stringify(this.sourceData.projections));
        const freshProj = rawProj.map(r => this._computeFormulas({ ...r, datekey: parseInt(r.datekey) }));
        this._loadContext('all', freshProj, rawProj);
        this.renderTable();
        this._updateAdjSummary();
        this._renderAdjLog();
        this._refreshStatus();
    },

    _populateFilterOptions() {
        const select = document.getElementById('consolFilterSelect');
        if (!select || !this.sourceData) return;

        if (this.currentView === 'chain') {
            // Use the chains that were selected when running the forecast
            const chains = this.sourceData.chains || [];
            if (chains.length === 0) {
                select.innerHTML = '<option value="">-- Không có chuỗi nào --</option>';
                Utils.toast('Forecast không có dữ liệu theo chuỗi', 'warning');
                return;
            }
            select.innerHTML = '<option value="">-- Chọn chuỗi --</option>' +
                chains.map(c => `<option value="${c}">${c}</option>`).join('');

        } else if (this.currentView === 'restaurant') {
            // Use restaurants from the forecast selection
            const rests = this.sourceData.restaurants || [];
            if (rests.length === 0) {
                // Fallback: fetch restaurant list from API
                this._fetchRestaurantList(select);
                return;
            }
            select.innerHTML = '<option value="">-- Chọn nhà hàng --</option>' +
                rests.map(r => `<option value="${r}">${r}</option>`).join('');
        }
    },

    // Fallback: fetch restaurant list from /api/actual/restaurants
    async _fetchRestaurantList(select) {
        try {
            select.innerHTML = '<option value="">⏳ Đang tải danh sách...</option>';
            const resp = await fetch(`${API_BASE}/api/actual/restaurants`);
            const json = await resp.json();
            const rests = (json.restaurants || json.data || json || []).map(r =>
                typeof r === 'string' ? r : (r.pc || r.restaurant || r.code || JSON.stringify(r))
            ).filter(Boolean);
            if (rests.length === 0) {
                select.innerHTML = '<option value="">-- Không có dữ liệu --</option>';
                return;
            }
            this.sourceData.restaurants = rests; // cache for next time
            select.innerHTML = '<option value="">-- Chọn nhà hàng --</option>' +
                rests.map(r => `<option value="${r}">${r}</option>`).join('');
        } catch (e) {
            select.innerHTML = '<option value="">-- Lỗi tải danh sách --</option>';
            console.error('[Consolidation] Failed to fetch restaurant list:', e);
        }
    },

    // Called when user changes the filter dropdown
    setFilter(filterValue) {
        // 1. Save current context BEFORE switching filter
        this._saveCurrentContext();

        this.currentFilter = filterValue;
        if (!filterValue) {
            // Back to showing all — but keep adj from 'all' context
            this._restoreAggregateView();
            return;
        }
        // Re-fetch forecast data for the specific entity
        this._fetchAndRender(filterValue);
    },

    // Re-fetch forecast from backend for specific chain or restaurant
    async _fetchAndRender(filterValue) {
        const tbody = document.getElementById('consolTbody');
        const thead = document.getElementById('consolThead');
        if (thead) thead.innerHTML = '<th colspan="10" style="text-align:center;padding:20px;">⏳ Đang tải dữ liệu...</th>';
        if (tbody) tbody.innerHTML = '';

        if (!this.sourceData) return;

        // Build fetch body
        const body = {
            horizon: this.sourceData.projections?.length || 1,
            method:  this.sourceData.method || 'historical',
            params:  {},
        };
        if (this.currentView === 'chain') {
            body.chain = filterValue;
        } else {
            body.pc = filterValue;
        }

        try {
            const resp = await fetch(`${API_BASE}/api/forecast/compute`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body)
            });
            const json = await resp.json();
            if (json.status !== 'ok') throw new Error(json.message || 'API error');

            // rawProj = per-chain/restaurant raw API values (for Forecast column)
            const rawProj   = JSON.parse(JSON.stringify(json.projections));
            const freshProj = rawProj.map(r => this._computeFormulas({ ...r, datekey: parseInt(r.datekey) }));

            // Context key for this chain/restaurant
            const contextKey = this.currentView === 'chain'
                ? `chain_${filterValue}`
                : `rest_${filterValue}`;

            // Load saved adj for this context (or start fresh with API data as baseline)
            this._loadContext(contextKey, freshProj, rawProj);

            this.renderTable();
            this._updateAdjSummary();
            this._renderAdjLog();
            this._refreshStatus();

            const label = this.currentView === 'chain' ? `chuỗi ${filterValue}` : `NH ${filterValue}`;
            const adjCount = this.adjustments.length;
            Utils.toast(
                `✅ Đã tải dữ liệu cho ${label}` + (adjCount > 0 ? ` · ${adjCount} adj đã lưu` : ''),
                'success'
            );

        } catch (e) {
            console.error('[Consolidation] _fetchAndRender failed:', e);
            Utils.toast(`❌ Không thể tải dữ liệu: ${e.message}`, 'error');
            if (tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:30px;color:#f87171;">❌ ${e.message}</td></tr>`;
        }
    },

    /* ═══════════════════════════════════════════════════════════
       BIND EVENTS
       ═══════════════════════════════════════════════════════════ */
    bindEvents() {
        // View mode buttons
        document.querySelectorAll('.consol-view-btn').forEach(btn => {
            btn.addEventListener('click', () => this.setView(btn.dataset.view));
        });

        // Filter dropdown — MUST be bound here (not in setView) to avoid double-binding
        const filterSelect = document.getElementById('consolFilterSelect');
        if (filterSelect) {
            filterSelect.addEventListener('change', () => this.setFilter(filterSelect.value));
        }

        // Save Final
        const saveBtn = document.getElementById('consolSaveFinal');
        if (saveBtn) saveBtn.addEventListener('click', () => this.saveFinalReport());

        // Export
        const exportBtn = document.getElementById('consolExport');
        if (exportBtn) exportBtn.addEventListener('click', () => this.exportCSV());

        // Reset
        const resetBtn = document.getElementById('consolResetAdj');
        if (resetBtn) resetBtn.addEventListener('click', () => {
            if (this.adjustments.length === 0) {
                Utils.toast('Không có điều chỉnh nào để reset', 'info');
                return;
            }
            if (confirm('Xóa tất cả điều chỉnh và khôi phục số liệu gốc?')) {
                this.resetAdjustments();
            }
        });
    },

    /* ═══════════════════════════════════════════════════════════
       HELPERS
       ═══════════════════════════════════════════════════════════ */
    /* ════════════════════════════════════════════════════════════
       FORMULAS — Self-contained, mirrors forecast.js _computeFormulas.
       Kept here so Consolidation has zero coupling to Forecast internals.
       Must be kept in sync if forecast.js changes formulas.
       ═══════════════════════════════════════════════════════════ */
    _computeFormulas(row) {
        const v = code => row[code] || 0;

        // Step 1: Parent subtotals - sum children when parent is empty
        PNL_DATA.forEach(item => {
            if (item.isFormula) return;
            if (!row[item.code] || row[item.code] === 0) {
                let total = 0;
                Object.keys(row).forEach(k => {
                    if (k !== item.code && k !== 'datekey' && k.startsWith(item.code)) {
                        total += row[k] || 0;
                    }
                });
                if (total !== 0) row[item.code] = total;
            }
        });

        // Step 2: Cross-indicator formulas
        row['SD01'] = v('DT01') - v('DT02');                    // Net Revenue
        row['SD02'] = v('SD01') - v('CP01');                    // Gross Profit

        let opex = 0;
        PNL_DATA.forEach(i => { if (i.code.startsWith('CP02')) opex += (row[i.code] || 0); });
        row['SD03'] = v('SD02') - opex;                          // CM

        if (!row['SD09'] || row['SD09'] === 0) {
            row['SD09'] = v('SD04') + v('DT03') - v('CP05')
                        + v('DT04') - v('CP06') - v('CP07') - v('CP08'); // PAT
        }

        // TA: Average Revenue per Guest
        const tc = v('TC');
        row['TA'] = tc > 0 ? Math.round(v('DT01') / tc) : 0;

        return row;
    },

    /* ════════════════════════════════════════════════════════════
       PANELS SHOW/HIDE
       ═══════════════════════════════════════════════════════════ */
    _showDataPanels() {
        ['consolToolbar', 'consolTableWrap'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = '';
        });
    },

    _hideDataPanels() {
        ['consolToolbar', 'consolTableWrap', 'consolAdjSummary', 'consolLogPanel'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    },

    _getLevel(code) {
        if (!code) return 0;
        const len = code.trim().length;
        if (len === 2) return 0;
        if (len === 4) return 1;
        if (len === 6) return 2;
        return 0;
    },

    _fmt(v) {
        if (v === null || v === undefined) return '—';
        const abs = Math.abs(v);
        if (abs >= 1e9) return (v / 1e9).toFixed(2) + 'B';
        if (abs >= 1e6) return (v / 1e6).toFixed(2) + 'M';
        return Math.round(v).toLocaleString('vi-VN');
    },

    destroy() {
        // No chart to destroy in new version
    }
};
