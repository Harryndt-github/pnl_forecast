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
    adjInputs: {},              // Raw adj data: { 'DT01_202504': { pct: 5, amount: 0, reason: '' } }
    adjustments: [],            // [{ code, datekey, oldVal, newVal, delta, adjPct, adjAmount, reason, time }]
    adjContexts: {},            // Per-context snapshots: { 'all': {...}, 'chain_10GG': {...}, ... }
    currentContextKey: 'all',   // Key of the active context
    savedReports: [],           // Persisted final reports
    filterOptionsData: [],      // Data for custom dropdown: [{ value, label }]
    collapsedGroups: new Set(), // Codes of collapsed parent rows
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

        // ── Header row: Mã | Chỉ tiêu | [Forecast | Adj% | AdjAmt | Lý do | Final] per period ──
        thead.innerHTML = `
            <th class="col-code">Mã</th>
            <th class="col-item">Chỉ tiêu</th>
            ${periods.map(p => `
                <th class="col-forecast-hdr">🔮 ${p.label}</th>
                <th class="col-adj-hdr col-adj-pct">△ Adj %</th>
                <th class="col-adj-hdr col-adj-amt">△ Adj (VNĐ)</th>
                <th class="col-adj-hdr col-adj-reason">📝 Lý do</th>
                <th class="col-final-hdr">✅ Final</th>
            `).join('')}
        `;

        // ── Body rows ──
        const rows = PNL_DATA.map((item, index) => {
            const isFormula  = !!item.isFormula;
            const isSubtotal = !!item.isSubtotal;
            const level      = this._getLevel(item.code);
            const isParent   = !isFormula && !isSubtotal && this._hasChildren(PNL_DATA, index);
            const parentCode = this._findParentCode(item.code, index);
            const isHidden   = !isFormula && !isSubtotal && this._isRowHidden(item.code, index);
            const isCollapsed = this.collapsedGroups.has(item.code);

            let rowClass = isFormula ? 'row-formula' : (isSubtotal ? 'row-formula' : (isParent ? 'row-parent' : (level === 0 ? 'row-kpi' : '')));
            if (isHidden) rowClass += ' row-collapsed-child';
            const indent  = level === 3 ? 'indent-3' : (level === 2 ? 'indent-2' : (level === 1 ? 'indent-1' : ''));

            // Toggle arrow for parent rows
            const toggleIcon = isParent
                ? `<span class="collapse-toggle ${isCollapsed ? 'collapsed' : ''}" data-toggle-code="${item.code}" title="${isCollapsed ? 'Mở rộng' : 'Thu gọn'}"></span>`
                : '';

            const cells = periods.map((p, pi) => {
                // Original forecast value — uses context-specific baseline (NOT aggregate)
                const origRow  = this.baseProjections ? this.baseProjections[pi] : null;
                const origVal  = origRow ? (origRow[item.code] ?? 0) : 0;

                // Final value after adjustment (may use _computeFormulas result)
                const finalRow = this.adjustedProjections[pi];
                const finalVal = finalRow ? (finalRow[item.code] ?? 0) : 0;

                const adjKey  = `${item.code}_${p.dk}`;
                const adjData = this.adjInputs[adjKey] || {};
                const adjPct  = adjData.pct    !== undefined ? adjData.pct    : '';
                const adjAmt  = adjData.amount !== undefined ? adjData.amount : '';
                const adjReason = adjData.reason || '';

                // Delta between final and original
                const delta  = Math.round(finalVal - origVal);
                const hasAdj = delta !== 0;
                const deltaHtml = hasAdj
                    ? `<span class="adj-delta-hint ${delta > 0 ? 'delta-pos' : 'delta-neg'}">${delta > 0 ? '+' : ''}${this._fmt(delta)}</span>`
                    : '';

                if (item.isSubtotal || isFormula) {
                    // Subtotal/Formula rows: read-only
                    return `
                        <td class="consol-cell cell-forecast">${this._fmt(origVal)}</td>
                        <td class="consol-cell adj-cell-formula" title="Tự động tính">—</td>
                        <td class="consol-cell adj-cell-formula">—</td>
                        <td class="consol-cell adj-cell-formula">—</td>
                        <td class="consol-cell final-cell ${hasAdj ? 'cell-has-adj' : ''}">${this._fmt(finalVal)}</td>
                    `;
                } else {
                    return `
                        <td class="consol-cell cell-forecast">${this._fmt(origVal)}</td>
                        <td class="consol-cell adj-cell adj-cell-pct">
                            <input class="adj-col-input adj-pct-input"
                                   type="number" step="0.1" min="-100" max="200"
                                   placeholder="+5 / -3"
                                   value="${adjPct}"
                                   data-code="${item.code}" data-dk="${p.dk}"
                                   data-pi="${pi}" data-orig="${origVal}"
                                   data-field="pct"
                                   title="Điều chỉnh theo %">
                            <span class="adj-pct-label">%</span>
                        </td>
                        <td class="consol-cell adj-cell adj-cell-amt">
                            <input class="adj-col-input adj-amt-input"
                                   type="text"
                                   placeholder="±1,000,000"
                                   value="${adjAmt !== '' ? adjAmt.toLocaleString('vi-VN') : ''}"
                                   data-code="${item.code}" data-dk="${p.dk}"
                                   data-pi="${pi}" data-orig="${origVal}"
                                   data-field="amount"
                                   title="Điều chỉnh số tuyệt đối (VNĐ)">
                            ${deltaHtml}
                        </td>
                        <td class="consol-cell adj-cell adj-cell-reason">
                            <input class="adj-reason-input"
                                   type="text"
                                   placeholder="Lý do..."
                                   value="${adjReason}"
                                   data-code="${item.code}" data-dk="${p.dk}"
                                   data-field="reason"
                                   title="Lý do điều chỉnh">
                        </td>
                        <td class="consol-cell final-cell ${hasAdj ? 'cell-has-adj' : ''}">${this._fmt(finalVal)}</td>
                    `;
                }
            }).join('');

            return `<tr class="${rowClass}" ${parentCode ? `data-parent-code="${parentCode}"` : ''} data-row-code="${item.code}">
                <td class="col-code"><span class="code-tag code-level-${level}">${item.code}</span></td>
                <td class="col-item ${indent}">${toggleIcon}${item.label}</td>
                ${cells}
            </tr>`;
        }).join('');

        tbody.innerHTML = rows;
        this._bindCellEvents();
        this._bindCollapseEvents();
    },

    /* ═══════════════════════════════════════════════════════════
       CELL EVENTS — Adj column input handlers
       % input: adjust by percentage of original
       Amount input: adjust by absolute VNĐ amount
       Reason input: store reason note
       ═══════════════════════════════════════════════════════════ */
    _bindCellEvents() {
        // % and Amount inputs
        document.querySelectorAll('#consolTbody .adj-col-input').forEach(input => {
            input.addEventListener('blur', () => this._applyAdjFromInput(input));
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
                if (e.key === 'Escape') { input.value = ''; input.blur(); }
            });
        });
        // Reason inputs — save on blur/Enter without re-rendering table
        document.querySelectorAll('#consolTbody .adj-reason-input').forEach(input => {
            input.addEventListener('blur',    () => this._saveReason(input));
            input.addEventListener('keydown', e => {
                if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
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

    _saveReason(input) {
        const code   = input.dataset.code;
        const dk     = parseInt(input.dataset.dk);
        const adjKey = `${code}_${dk}`;
        if (!this.adjInputs[adjKey]) this.adjInputs[adjKey] = {};
        this.adjInputs[adjKey].reason = input.value.trim();
        // Update in adjustment log
        const adj = this.adjustments.find(a => a.code === code && a.datekey === dk);
        if (adj) adj.reason = input.value.trim();
    },

    _applyAdjFromInput(input) {
        const code    = input.dataset.code;
        const dk      = parseInt(input.dataset.dk);
        const pi      = parseInt(input.dataset.pi);
        const origVal = parseFloat(input.dataset.orig) || 0;
        const field   = input.dataset.field; // 'pct' or 'amount'
        const adjKey  = `${code}_${dk}`;

        if (!this.adjInputs[adjKey]) this.adjInputs[adjKey] = {};

        // Parse and store the field value
        let rawVal = input.value.trim().replace(/,/g, '');
        if (field === 'pct') {
            const pct = parseFloat(rawVal) || 0;
            this.adjInputs[adjKey].pct = pct !== 0 ? pct : '';
        } else {
            const amt = parseFloat(rawVal) || 0;
            this.adjInputs[adjKey].amount = amt !== 0 ? amt : '';
        }

        // Compute combined delta: pct takes priority, amount adds on top
        const adjData = this.adjInputs[adjKey];
        const pct    = adjData.pct    ? parseFloat(adjData.pct)    : 0;
        const amount = adjData.amount ? parseFloat(adjData.amount) : 0;
        const pctDelta = Math.round(origVal * pct / 100);
        const delta    = pctDelta + Math.round(amount);
        const newVal   = origVal + delta;

        // Update the adjusted projection row
        if (this.adjustedProjections[pi]) {
            this.adjustedProjections[pi][code] = Math.round(newVal);
            this.adjustedProjections[pi] = this._computeFormulas(this.adjustedProjections[pi]);
        }

        // Update adjustment log
        this.adjustments = this.adjustments.filter(a => !(a.code === code && a.datekey === dk));
        if (delta !== 0) {
            this.adjustments.push({
                code,
                datekey: dk,
                oldVal:  Math.round(origVal),
                newVal:  Math.round(newVal),
                delta:   Math.round(delta),
                adjPct:  pct,
                adjAmount: amount,
                reason:  adjData.reason || '',
                time:    new Date().toLocaleTimeString('vi-VN')
            });
        }

        // Partial re-render
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
            const adjDesc = [
                a.adjPct    ? `${a.adjPct > 0 ? '+' : ''}${a.adjPct}%`     : null,
                a.adjAmount ? `${a.adjAmount > 0 ? '+' : ''}${this._fmt(a.adjAmount)}` : null,
            ].filter(Boolean).join(' + ') || a.adjStr || '—';
            return `<div class="consol-log-item ${cls}">
                <span class="log-time">${a.time}</span>
                <span class="log-code">${a.code}</span>
                <span class="log-period">T${m}/${y}</span>
                <span class="log-adj">${adjDesc}</span>
                <span class="log-delta">${sign}${this._fmt(a.delta)}</span>
                <span class="log-result">${this._fmt(a.oldVal)} → ${this._fmt(a.newVal)}</span>
                ${a.reason ? `<span class="log-reason" title="Lý do">📝 ${a.reason}</span>` : ''}
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

        const restaurantProjections = JSON.parse(JSON.stringify(this.sourceData?.restaurant_projections || {}));
        if (this.currentView === 'restaurant' && this.currentFilter) {
            restaurantProjections[this.currentFilter] = JSON.parse(JSON.stringify(this.adjustedProjections));
        }
        if (Object.keys(restaurantProjections).length === 0) {
            Utils.toast('Report nay chua co du lieu forecast theo tung nha hang. Hay hard refresh va chay lai Forecast.', 'error');
            return;
        }
        const reconciliation = this.sourceData?.reconciliation || null;
        if (reconciliation && reconciliation.ok === false) {
            Utils.toast(`Canh bao: ${reconciliation.fail_count} chi tieu lech qua nguong Excel benchmark. Report van duoc luu de Dashboard dung forecast bottom-up.`, 'warning');
        }

        const report = {
            id: Date.now(),
            savedAt: new Date().toLocaleString('vi-VN'),
            filter: this.sourceData?.filter || 'ALL',
            method: this.sourceData?.method || '—',
            model: this.sourceData?.model || 'bottom_up_store',
            ref_period: this.sourceData?.ref_period || 'last4w',
            periods: this.adjustedProjections.length,
            adjustmentCount: this.adjustments.length,
            adjustments: [...this.adjustments],
            projections: JSON.parse(JSON.stringify(this.adjustedProjections)),
            historical: this.sourceData?.historical
                ? JSON.parse(JSON.stringify(this.sourceData.historical))
                : [],
            restaurant_projections: restaurantProjections,
            reconciliation: reconciliation,
            calibration_scope: this.sourceData?.calibration_scope || null,
            chains: [...(this.sourceData?.chains || [])],
            restaurants: [...(this.sourceData?.restaurants || [])]
        };

        // Save to localStorage (backward compat)
        this.savedReports.unshift(report);
        if (this.savedReports.length > 10) {
            this.savedReports = this.savedReports.slice(0, 10);
        }
        try {
            localStorage.setItem('pnl_consol_reports', JSON.stringify(this.savedReports));
        } catch (e) {
            console.warn('[Consolidation] localStorage save failed:', e);
        }

        // Also save to server for Dashboard comparison
        fetch(`${API_BASE}/api/forecast/reports`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(report)
        }).then(r => r.json()).then(json => {
            if (json.status === 'ok') {
                console.log('[Consolidation] Report saved to server:', json.report_id);
            }
        }).catch(e => {
            console.warn('[Consolidation] Server save failed (localStorage OK):', e.message);
        });

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
                    <button class="btn btn-xs btn-outline saved-view" data-id="${r.id}" title="Xem nhanh báo cáo">👁 Xem</button>
                    <button class="btn btn-xs btn-outline saved-load" data-id="${r.id}" title="Tải lại vào lưới để cấu hình tiếp">📂 Tải</button>
                    <button class="btn btn-xs btn-outline saved-export" data-id="${r.id}" title="Export ra CSV">📥</button>
                    <button class="btn btn-xs btn-danger saved-delete" data-id="${r.id}" title="Xóa">🗑</button>
                </div>
            </div>
        `).join('');

        // Bind events for saved reports
        list.querySelectorAll('.saved-view').forEach(btn => {
            btn.addEventListener('click', () => this._viewReport(parseInt(btn.dataset.id)));
        });
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

    async _deleteReport(id) {
        if (!confirm('Xoa bao cao nay khoi Consolidation va Dashboard?')) return;

        this.savedReports = this.savedReports.filter(r => r.id !== id);
        try {
            localStorage.setItem('pnl_consol_reports', JSON.stringify(this.savedReports));
        } catch (e) { /* ignore */ }

        try {
            const resp = await fetch(`${API_BASE}/api/forecast/reports/${id}`, {
                method: 'DELETE'
            });
            const json = await resp.json();
            if (json.status !== 'ok') {
                throw new Error(json.message || 'Server delete failed');
            }
        } catch (e) {
            console.warn('[Consolidation] Server delete failed:', e.message);
            Utils.toast('Da xoa tren trinh duyet, nhung chua xoa duoc ban tren server.', 'warning');
        }

        this._renderSavedReports();
        Utils.toast('🗑 Đã xóa báo cáo', 'info');
    },

    _viewReport(id) {
        const report = this.savedReports.find(r => r.id === id);
        if (!report) return;

        const periods = report.projections.map(r => {
            const dk = parseInt(r.datekey);
            return `T${dk % 100}/${Math.floor(dk / 100)}`;
        });

        // Thead
        let theadHtml = `<tr>
            <th style="padding:12px 16px; background:#1e293b; color:#cbd5e1; border-bottom:2px solid #334155; text-align:left;">Mã</th>
            <th style="padding:12px 16px; background:#1e293b; color:#cbd5e1; border-bottom:2px solid #334155; text-align:left;">Chỉ tiêu</th>`;
        periods.forEach(p => {
            theadHtml += `<th style="padding:12px 16px; background:#1e293b; color:#cbd5e1; border-bottom:2px solid #334155; text-align:right;">${p}</th>`;
        });
        theadHtml += `</tr>`;
        document.getElementById('viewReportThead').innerHTML = theadHtml;

        // Tbody
        let tbodyHtml = '';
        PNL_DATA.forEach(item => {
            const isHeader = [0,1].includes(item.level); // highlight top levels
            const bStyle = isHeader ? 'font-weight:700; color:#f8fafc;' : 'color:#cbd5e1;';
            const bgHover = isHeader ? 'background:#1e293b;' : '';
            
            let rowHtml = `<tr style="${bgHover}">
                <td style="padding:10px 16px; border-bottom:1px solid #334155; font-family:monospace; ${bStyle}"><strong>${item.code}</strong></td>
                <td style="padding:10px 16px; border-bottom:1px solid #334155; ${bStyle}">${item.label}</td>`;
            
            report.projections.forEach(r => {
                const val = r[item.code] ?? 0;
                rowHtml += `<td style="padding:10px 16px; border-bottom:1px solid #334155; text-align:right; font-family:monospace; ${bStyle}">${Utils.currency(val)}</td>`;
            });
            rowHtml += `</tr>`;
            tbodyHtml += rowHtml;
        });
        
        document.getElementById('viewReportTbody').innerHTML = tbodyHtml;
        document.getElementById('viewReportTitle').innerText = `Kết quả Báo cáo Final`;
        document.getElementById('viewReportSubtitle').innerText = `${report.filter} · ${report.periods} kỳ · Lưu lúc: ${report.savedAt} · (${report.adjustmentCount} điều chỉnh tay)`;
        document.getElementById('viewReportModal').style.display = 'flex';
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
        PNL_DATA.forEach(item => {
            const vals = projections.map(r => Math.round(r[item.code] ?? 0));
            csv += `${item.code},"${item.label}",${vals.join(',')}\n`;
        });
        if (this.adjustments.length > 0) {
            csv += '\n\nNhật ký điều chỉnh\n';
            csv += 'Thời gian,Mã,Kỳ,Adj%,Adj Số tiền,Giá trị cũ,Giá trị mới,Chênh lệch,Lý do\n';
            this.adjustments.forEach(a => {
                const dk = a.datekey;
                csv += `${a.time},${a.code},T${dk % 100}/${Math.floor(dk / 100)},` +
                       `${a.adjPct || ''},${a.adjAmount || ''},${a.oldVal},${a.newVal},${a.delta},"${a.reason || ''}"\n`;
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

        // Reset placeholder and search
        const ph = document.getElementById('consolFilterPlaceholder');
        if (ph) ph.textContent = '-- Chọn --';
        const search = document.getElementById('consolFilterSearch');
        if (search) search.value = '';

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
        const optionsContainer = document.getElementById('consolFilterOptions');
        const placeholder      = document.getElementById('consolFilterPlaceholder');
        const searchInput      = document.getElementById('consolFilterSearch');
        if (!optionsContainer || !this.sourceData) return;

        placeholder.textContent = '⏳ Đang tải...';
        optionsContainer.innerHTML = '<div class="fc-ms-empty">⏳ Đang tải...</div>';
        this.filterOptionsData = [];
        if (searchInput) searchInput.value = '';

        if (this.currentView === 'chain') {
            // ── Load chains from /api/chains ──
            fetch(`${API_BASE}/api/chains`)
                .then(r => r.json())
                .then(json => {
                    const chains = json.chains || json.data || [];
                    if (chains.length === 0) {
                        placeholder.textContent = '-- Không có chuỗi nào --';
                        optionsContainer.innerHTML = '<div class="fc-ms-empty">Không có dữ liệu</div>';
                        return;
                    }
                    this.filterOptionsData = chains.map(c => {
                        const name  = c.chain_name || c.chain;
                        const label = name !== c.chain ? `${name} (${c.chain})` : c.chain;
                        return { value: c.chain, label: label };
                    });
                    placeholder.textContent = '-- Chọn chuỗi --';
                    this._renderFilterOptions(this.filterOptionsData);
                })
                .catch(() => {
                    placeholder.textContent = '-- Lỗi tải danh sách --';
                    optionsContainer.innerHTML = '<div class="fc-ms-empty">Lỗi kết nối</div>';
                });

        } else if (this.currentView === 'restaurant') {
            const rests = this.sourceData.restaurants || [];
            if (rests.length === 0) {
                this._fetchRestaurantList();
                return;
            }
            // Handle both old (string) and new (object) restaurant formats
            this.filterOptionsData = rests.map(r => {
                if (typeof r === 'string') return { value: r, label: r };
                const name  = r.name && r.name !== r.code ? `${r.name} (${r.code})` : r.code;
                const chain = r.chain_name ? ` [${r.chain_name}]` : '';
                return { value: r.code, label: name + chain };
            });
            placeholder.textContent = '-- Chọn nhà hàng --';
            this._renderFilterOptions(this.filterOptionsData);
        }
    },

    // Fallback: fetch restaurant list from /api/actual/restaurants (ACTIVE only)
    async _fetchRestaurantList() {
        const optionsContainer = document.getElementById('consolFilterOptions');
        const placeholder      = document.getElementById('consolFilterPlaceholder');
        try {
            placeholder.textContent = '⏳ Đang tải...';
            const resp = await fetch(`${API_BASE}/api/actual/restaurants`);
            const json = await resp.json();
            const rawList = json.restaurants || json.data || json || [];
            // Handle enriched objects { code, name, chain_name, region }
            const rests = rawList.map(r => {
                if (typeof r === 'string') return { code: r, name: r, chain_name: '' };
                return { code: r.code || r.pc || r, name: r.name || r.code || r, chain_name: r.chain_name || '' };
            }).filter(r => r.code);

            if (rests.length === 0) {
                placeholder.textContent = '-- Không có dữ liệu --';
                optionsContainer.innerHTML = '<div class="fc-ms-empty">Không có dữ liệu (Active)</div>';
                return;
            }
            this.sourceData.restaurants = rests; // cache for next time
            this.filterOptionsData = rests.map(r => {
                const name  = r.name && r.name !== r.code ? `${r.name} (${r.code})` : r.code;
                const chain = r.chain_name ? ` [${r.chain_name}]` : '';
                return { value: r.code, label: name + chain };
            });
            placeholder.textContent = `-- Chọn nhà hàng (${rests.length} Active) --`;
            this._renderFilterOptions(this.filterOptionsData);
        } catch (e) {
            console.error('[Consolidation] Failed to fetch restaurant list:', e);
            placeholder.textContent = '-- Lỗi tải danh sách --';
            optionsContainer.innerHTML = '<div class="fc-ms-empty">Lỗi kết nối</div>';
        }
    },

    _renderFilterOptions(items) {
        const container = document.getElementById('consolFilterOptions');
        if (!container) return;
        
        if (items.length === 0) {
            container.innerHTML = '<div class="fc-ms-empty">Không tìm thấy</div>';
            return;
        }

        container.innerHTML = items.map(item => `
            <div class="consol-opt-item" data-value="${item.value}">
                ${item.label}
            </div>
        `).join('');

        // Bind click event for each option
        container.querySelectorAll('.consol-opt-item').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = el.dataset.value;
                const lbl = el.textContent.trim();
                
                document.getElementById('consolFilterPlaceholder').textContent = lbl;
                document.getElementById('consolFilterDropdown').classList.add('hidden');
                
                // Set the filter and re-render data
                this.setFilter(val);
            });
        });
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

        // Build fetch body (V2 model)
        const body = {
            horizon: this.sourceData.projections?.length || 1,
            ref_period: this.sourceData.ref_period || 'last4w',
        };
        if (this.currentView === 'chain') {
            body.chain = filterValue;
        } else {
            body.pc = filterValue;
        }

        try {
            const resp = await fetch(`${API_BASE}/api/forecast/compute-v2`, {
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

        // Custom Dropdown Filter Events
        const filterTrigger  = document.getElementById('consolFilterTrigger');
        const filterDropdown = document.getElementById('consolFilterDropdown');
        const filterSearch   = document.getElementById('consolFilterSearch');

        if (filterTrigger) {
            filterTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                filterDropdown.classList.toggle('hidden');
                if (!filterDropdown.classList.contains('hidden')) {
                    filterSearch.focus();
                }
            });
        }

        if (filterSearch) {
            filterSearch.addEventListener('input', (e) => {
                const q = e.target.value.toLowerCase();
                const filtered = (this.filterOptionsData || []).filter(o => 
                    o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
                );
                this._renderFilterOptions(filtered);
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (filterDropdown && !filterDropdown.classList.contains('hidden') && !e.target.closest('#consolFilterPicker')) {
                filterDropdown.classList.add('hidden');
            }
        });

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
       COLLAPSE / EXPAND HELPERS
       ═══════════════════════════════════════════════════════════ */
    _hasChildren(data, index) {
        const code = data[index].code;
        for (let i = index + 1; i < data.length; i++) {
            const next = data[i];
            if (next.isSubtotal || next.isFormula) break;
            if (next.code.startsWith(code) && next.code.length > code.length) return true;
            if (!next.code.startsWith(code.slice(0, 2))) break;
        }
        return false;
    },

    _findParentCode(code, index) {
        for (let i = index - 1; i >= 0; i--) {
            const prev = PNL_DATA[i];
            if (prev.isSubtotal || prev.isFormula) continue;
            if (code.startsWith(prev.code) && code.length > prev.code.length) {
                return prev.code;
            }
        }
        return null;
    },

    _isRowHidden(code, index) {
        for (let i = index - 1; i >= 0; i--) {
            const prev = PNL_DATA[i];
            if (prev.isSubtotal || prev.isFormula) continue;
            if (code.startsWith(prev.code) && code.length > prev.code.length) {
                if (this.collapsedGroups.has(prev.code)) return true;
            }
        }
        return false;
    },

    _bindCollapseEvents() {
        document.querySelectorAll('#consolTbody .collapse-toggle').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = el.dataset.toggleCode;
                if (this.collapsedGroups.has(code)) {
                    this.collapsedGroups.delete(code);
                } else {
                    this.collapsedGroups.add(code);
                }
                this.renderTable();
                this._updateAdjSummary();
            });
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
        if (len <= 2) return 0;
        if (len === 4) return 1;
        if (len === 6) return 2;
        if (len >= 8) return 3;
        return 1;
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
