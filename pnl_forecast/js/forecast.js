/* ═══════════════════════════════════════════════════════════════
   PNL FORECAST — Module 2: Forecast Builder (API-Connected)
   Connects to /api/chains, /api/actual/trend, /api/forecast/compute
   ═══════════════════════════════════════════════════════════════ */

const API_BASE = window.location.origin;

const Forecast = {
    chart: null,
    selectedItem: null,
    currentMethod: 'historical',
    currentHorizon: 1,
    chainsData: [],
    computeResult: null,

    // ─── Init ───
    init() {
        this.renderLineItems();
        this.bindEvents();
        this.selectItem(FORECAST_ITEMS[0]);
        this.loadChains();
    },

    // ═══════════════════════════════════════════════════════════
    // LINE ITEMS SIDEBAR
    // ═══════════════════════════════════════════════════════════

    renderLineItems(filter = '') {
        const list = document.getElementById('lineItemsList');
        if (!list) return;

        const filtered = FORECAST_ITEMS.filter(item =>
            item.name.toLowerCase().includes(filter.toLowerCase()) ||
            item.code.toLowerCase().includes(filter.toLowerCase())
        );

        list.innerHTML = filtered.map(item => {
            const isActive = this.selectedItem && this.selectedItem.code === item.code;
            const tag = item.configured
                ? '<span class="line-item-tag tag-configured">Set</span>'
                : '<span class="line-item-tag tag-pending">Pending</span>';

            // Indentation logic (matches Dashboard)
            const len = item.code.trim().length;
            let indentClass = '';
            if (len === 4) indentClass = 'fc-indent-1';
            else if (len === 6) indentClass = 'fc-indent-2';

            return `<button class="line-item-btn ${isActive ? 'active' : ''} ${indentClass}" data-code="${item.code}">
                <div>
                    <div style="font-weight:600;color:var(--text-primary)">${item.name}</div>
                    <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px">${item.code}</div>
                </div>
                ${tag}
            </button>`;
        }).join('');

        list.querySelectorAll('.line-item-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = FORECAST_ITEMS.find(i => i.code === btn.dataset.code);
                if (item) this.selectItem(item);
            });
        });
    },

    selectItem(item) {
        this.selectedItem = item;

        const title = document.getElementById('formulaTitle');
        const tag = document.getElementById('formulaTag');
        if (title) title.textContent = item.name;
        if (tag) tag.textContent = item.code;

        if (item.configured && item.method) {
            this.setMethod(item.method);
        }

        document.querySelectorAll('.line-item-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.code === item.code);
        });

        this.updateFormulaDisplay();
        this.updateResultsForItem();
    },

    // ═══════════════════════════════════════════════════════════
    // CHAIN / RESTAURANT FILTER
    // ═══════════════════════════════════════════════════════════

    async loadChains() {
        try {
            const resp = await fetch(`${API_BASE}/api/chains`);
            const json = await resp.json();
            if (json.status === 'ok') {
                this.chainsData = json.chains;
                this.populateChainDropdown();
            } else {
                throw new Error(json.message || 'API status not ok');
            }
        } catch (e) {
            console.warn('[Forecast] Could not load chains:', e.message);
            this.chainsData = [];
            this.populateChainDropdown();
        }
    },

    selectedChains: [],      // ['10GG', '30SM', ...]
    selectedRestaurants: [], // ['10GG4101', ...]

    // ─── Multi-Select: Chains ───
    populateChainDropdown() {
        const opts = document.getElementById('fcChainOptions');
        if (!opts) return;
        if (this.chainsData.length === 0) {
            opts.innerHTML = '<div class="fc-ms-empty">Không có dữ liệu</div>'; return;
        }
        this._renderChainOptions(this.chainsData);
    },

    _renderChainOptions(data) {
        const opts = document.getElementById('fcChainOptions');
        if (!opts) return;
        opts.innerHTML = data.map(c => `
            <div class="fc-ms-option ${this.selectedChains.includes(c.chain) ? 'selected' : ''}"
                 data-value="${c.chain}">
                <span class="fc-ms-check">✓</span>
                <span class="fc-ms-label">${c.chain} <em>(${c.count} NH)</em></span>
            </div>`).join('');
        opts.querySelectorAll('.fc-ms-option').forEach(el => {
            el.addEventListener('click', () => this._toggleChain(el.dataset.value));
        });
    },

    _toggleChain(chain) {
        const idx = this.selectedChains.indexOf(chain);
        if (idx === -1) this.selectedChains.push(chain);
        else this.selectedChains.splice(idx, 1);
        this._updateChainUI();
        this._refreshRestaurantPool();
    },

    _selectAllChains() {
        // Get currently visible chains (filtered by search)
        const optsEl = document.getElementById('fcChainOptions');
        const visibleChains = [];
        optsEl?.querySelectorAll('.fc-ms-option').forEach(el => {
            if (el.dataset.value) visibleChains.push(el.dataset.value);
        });

        // Toggle: if all visible are selected → deselect all, else select all
        const allSelected = visibleChains.every(c => this.selectedChains.includes(c));
        if (allSelected) {
            // Deselect visible chains
            this.selectedChains = this.selectedChains.filter(c => !visibleChains.includes(c));
        } else {
            // Add all visible chains that aren't already selected
            visibleChains.forEach(c => {
                if (!this.selectedChains.includes(c)) this.selectedChains.push(c);
            });
        }
        this._updateChainUI();
        this._refreshRestaurantPool();
    },

    _updateChainUI() {
        const tags = document.getElementById('fcChainTags');
        const ph = document.getElementById('fcChainPlaceholder');
        const count = document.getElementById('fcChainCount');
        const opts = document.getElementById('fcChainOptions');
        if (!tags) return;

        if (this.selectedChains.length === 0) {
            tags.innerHTML = '';
            ph.style.display = '';
            count.classList.add('hidden');
        } else {
            ph.style.display = 'none';
            count.textContent = this.selectedChains.length;
            count.classList.remove('hidden');
            tags.innerHTML = this.selectedChains.map(c =>
                `<span class="fc-tag">${c}<button class="fc-tag-rm" data-chain="${c}">×</button></span>`
            ).join('');
            tags.querySelectorAll('.fc-tag-rm').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); this._toggleChain(btn.dataset.chain); });
            });
        }
        // Update option check state
        opts?.querySelectorAll('.fc-ms-option').forEach(el => {
            el.classList.toggle('selected', this.selectedChains.includes(el.dataset.value));
        });
    },

    // ─── Multi-Select: Restaurants ───
    _refreshRestaurantPool() {
        const optsEl = document.getElementById('fcRestOptions');
        if (!optsEl) return;

        // Clear restaurant selection when chains change
        this.selectedRestaurants = [];
        this._updateRestUI();

        if (this.selectedChains.length === 0) {
            optsEl.innerHTML = '<div class="fc-ms-empty">Chọn chuỗi trước</div>';
            return;
        }

        // Collect all restaurants from selected chains
        const allRests = [];
        this.selectedChains.forEach(chain => {
            const c = this.chainsData.find(d => d.chain === chain);
            if (c) allRests.push(...c.restaurants);
        });
        this._renderRestOptions(allRests);
    },

    _renderRestOptions(rests) {
        const optsEl = document.getElementById('fcRestOptions');
        if (!optsEl || !rests.length) {
            if (optsEl) optsEl.innerHTML = '<div class="fc-ms-empty">Không có nhà hàng</div>';
            return;
        }
        optsEl.innerHTML = rests.map(r => {
            const isLocked  = (typeof LockManager !== 'undefined') && (LockManager.getState(r) === 'LOCKED');
            const isSelected = this.selectedRestaurants.includes(r);
            const lockBadge  = isLocked ? '<span style="font-size:0.68rem;color:#f87171;margin-left:4px">🔒 Locked</span>' : '';
            return `
            <div class="fc-ms-option ${isSelected ? 'selected' : ''} ${isLocked ? 'option-locked' : ''}"
                 data-value="${r}" data-locked="${isLocked}">
                <span class="fc-ms-check">${isSelected ? '✓' : ''}</span>
                <span class="fc-ms-label">${r}${lockBadge}</span>
            </div>`;
        }).join('');
        optsEl.querySelectorAll('.fc-ms-option').forEach(el => {
            el.addEventListener('click', () => {
                if (el.dataset.locked === 'true') {
                    if (typeof Utils !== 'undefined') Utils.toast(`🔒 Nhà hàng ${el.dataset.value} đang bị khóa — không thể chọn`, 'warning');
                    return;
                }
                this._toggleRest(el.dataset.value);
            });
        });
    },

    _toggleRest(rest) {
        const idx = this.selectedRestaurants.indexOf(rest);
        if (idx === -1) this.selectedRestaurants.push(rest);
        else this.selectedRestaurants.splice(idx, 1);
        this._updateRestUI();
    },

    _selectAllRestaurants() {
        // Get currently visible, non-locked restaurants
        const optsEl = document.getElementById('fcRestOptions');
        const visibleRests = [];
        optsEl?.querySelectorAll('.fc-ms-option').forEach(el => {
            if (el.dataset.value && el.dataset.locked !== 'true') {
                visibleRests.push(el.dataset.value);
            }
        });

        // Toggle: if all visible selected → deselect, else select all
        const allSelected = visibleRests.every(r => this.selectedRestaurants.includes(r));
        if (allSelected) {
            this.selectedRestaurants = this.selectedRestaurants.filter(r => !visibleRests.includes(r));
        } else {
            visibleRests.forEach(r => {
                if (!this.selectedRestaurants.includes(r)) this.selectedRestaurants.push(r);
            });
        }
        this._updateRestUI();
    },

    _updateRestUI() {
        const tags = document.getElementById('fcRestTags');
        const ph = document.getElementById('fcRestPlaceholder');
        const count = document.getElementById('fcRestCount');
        const optsEl = document.getElementById('fcRestOptions');
        if (!tags) return;

        if (this.selectedRestaurants.length === 0) {
            tags.innerHTML = '';
            ph.style.display = '';
            count.classList.add('hidden');
        } else {
            ph.style.display = 'none';
            count.textContent = this.selectedRestaurants.length;
            count.classList.remove('hidden');
            const maxShow = 3;
            const shown = this.selectedRestaurants.slice(0, maxShow);
            const more = this.selectedRestaurants.length - maxShow;
            tags.innerHTML = shown.map(r =>
                `<span class="fc-tag">${r}<button class="fc-tag-rm" data-rest="${r}">×</button></span>`
            ).join('') + (more > 0 ? `<span class="fc-tag fc-tag-more">+${more}</span>` : '');
            tags.querySelectorAll('.fc-tag-rm').forEach(btn => {
                btn.addEventListener('click', (e) => { e.stopPropagation(); this._toggleRest(btn.dataset.rest); });
            });
        }
        // Update option check state
        optsEl?.querySelectorAll('.fc-ms-option').forEach(el => {
            el.classList.toggle('selected', this.selectedRestaurants.includes(el.dataset.value));
        });
    },

    // ─── Toggle Dropdown ───
    _toggleDropdown(triggerId, dropdownId) {
        const drop = document.getElementById(dropdownId);
        if (!drop) return;
        const isHidden = drop.classList.contains('hidden');
        // Close all others first
        document.querySelectorAll('.fc-ms-dropdown').forEach(d => d.classList.add('hidden'));
        document.querySelectorAll('.fc-ms-trigger').forEach(t => t.classList.remove('open'));
        if (isHidden) {
            drop.classList.remove('hidden');
            document.getElementById(triggerId)?.classList.add('open');
        }
    },


    // ═══════════════════════════════════════════════════════════
    // FORECAST METHOD CONTROLS
    // ═══════════════════════════════════════════════════════════

    setMethod(method) {
        this.currentMethod = method;

        document.querySelectorAll('.method-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.method === method);
        });

        document.getElementById('paramsHistorical').classList.toggle('hidden', method !== 'historical');
        document.getElementById('paramsFixed').classList.toggle('hidden', method !== 'fixed');
        document.getElementById('paramsAnchor').classList.toggle('hidden', method !== 'anchor');
        document.getElementById('paramsPercentRev').classList.toggle('hidden', method !== 'percent_revenue');

        this.updateFormulaDisplay();
    },

    updateFormulaDisplay() {
        const display = document.getElementById('formulaDisplay');
        if (!display || !this.selectedItem) return;

        const base = this.selectedItem.base;
        let html = '';

        if (this.currentMethod === 'historical') {
            const rate = parseFloat(document.getElementById('growthRate')?.value || 5) / 100;
            const lookback = parseInt(document.getElementById('lookbackPeriods')?.value || 3);
            const result = base * (1 + rate);
            html = `<div class="formula-visual">
                <span class="formula-el formula-base">AVG(${lookback} kỳ): ${Utils.currency(base)}</span>
                <span class="formula-op">×</span>
                <span class="formula-el formula-rate">${(1 + rate).toFixed(3)}</span>
                <span class="formula-op">=</span>
                <span class="formula-el formula-result">${Utils.currency(Math.round(result))}</span>
            </div>`;
        } else if (this.currentMethod === 'fixed') {
            const fixed = Utils.parseCurrency(document.getElementById('fixedAmount')?.value || '100000');
            html = `<div class="formula-visual">
                <span class="formula-el formula-base">Cố định</span>
                <span class="formula-op">=</span>
                <span class="formula-el formula-result">${Utils.currency(fixed)}</span>
            </div>`;
        } else if (this.currentMethod === 'anchor') {
            const mult = parseFloat(document.getElementById('anchorMultiplier')?.value || 1.05);
            const buffer = Utils.parseCurrency(document.getElementById('anchorBuffer')?.value || '0');
            const result = base * mult + buffer;
            html = `<div class="formula-visual">
                <span class="formula-el formula-base">Mỏ neo: ${Utils.currency(base)}</span>
                <span class="formula-op">×</span>
                <span class="formula-el formula-rate">×${mult.toFixed(2)}</span>
                <span class="formula-op">+</span>
                <span class="formula-el formula-buffer">${Utils.currency(buffer)}</span>
                <span class="formula-op">=</span>
                <span class="formula-el formula-result">${Utils.currency(Math.round(result))}</span>
            </div>`;
        } else if (this.currentMethod === 'percent_revenue') {
            const dtt = 2847500; // Mock DTT
            const ratio = base / dtt;
            const revGrowth = parseFloat(document.getElementById('revGrowthRate')?.value || 5) / 100;
            const projRev = dtt * (1 + revGrowth);
            const result = projRev * ratio;
            html = `<div class="formula-visual">
                <span class="formula-el formula-base">Tỷ lệ: ${(ratio * 100).toFixed(2)}%</span>
                <span class="formula-op">×</span>
                <span class="formula-el formula-rate">DTT dự báo: ${Utils.currency(Math.round(projRev))}</span>
                <span class="formula-op">=</span>
                <span class="formula-el formula-result">${Utils.currency(Math.round(result))}</span>
            </div>`;
        }

        display.innerHTML = html;
    },

    // ═══════════════════════════════════════════════════════════
    // RUN FORECAST (API CALL)
    // ═══════════════════════════════════════════════════════════

    async runForecast() {
        const statusEl  = document.getElementById('forecastStatus');
        const statusText = document.getElementById('forecastStatusText');
        const btn       = document.getElementById('btnRunForecast');

        // ── Guard: must pick at least a restaurant or chain ──
        if (this.selectedRestaurants.length === 0 && this.selectedChains.length === 0) {
            statusEl.classList.remove('hidden');
            statusEl.className = 'forecast-status status-error';
            statusText.textContent = '⚠️ Vui lòng chọn ít nhất một chuỗi hoặc nhà hàng trước khi chạy Forecast.';
            return;
        }

        // ── Guard: reject if any selected restaurant is LOCKED ──
        if (typeof LockManager !== 'undefined' && this.selectedRestaurants.length > 0) {
            const lockedOnes = this.selectedRestaurants.filter(pc => LockManager.getState(pc) === 'LOCKED');
            if (lockedOnes.length > 0) {
                statusEl.classList.remove('hidden');
                statusEl.className = 'forecast-status status-error';
                const un = lockedOnes.map(pc => {
                    const s = LockManager.schedules[pc];
                    const ul = s?.unlockTime ? `(Mở lúc: ${LockManager._fmt(s.unlockTime)})` : '(Chưa có lịch mở)';
                    return `${pc} ${ul}`;
                }).join(', ');
                statusText.textContent = `🔒 Không thể chạy Forecast — Nhà hàng đang bị khóa: ${un}. Vui lòng kiểm tra Lock Manager.`;
                return;
            }
        }

        // ── Show loading ──
        statusEl.classList.remove('hidden');
        statusEl.className = 'forecast-status status-loading';
        statusText.textContent = '⏳ Đang tính toán Forecast...';
        if (btn) btn.disabled = true;

        // ── Build filter description (truncated for readability) ──
        let filterDesc;
        if (this.selectedRestaurants.length > 0) {
            const count = this.selectedRestaurants.length;
            const preview = this.selectedRestaurants.slice(0, 3).join(', ');
            filterDesc = count > 3 ? `${preview}... (${count} NH)` : `${preview} (${count} NH)`;
        } else {
            const count = this.selectedChains.length;
            const preview = this.selectedChains.slice(0, 5).join(', ');
            filterDesc = count > 5 ? `${preview}... (${count} chuỗi)` : `${preview} (${count} chuỗi)`;
        }

        const methodParams = this.getMethodParams();

        // ── Build per-item method configs ──
        const itemConfigs = {};
        FORECAST_ITEMS.forEach(item => {
            const cfg = {
                method: item.method || this.currentMethod || 'historical'
            };
            // Copy relevant params based on item's method
            if (cfg.method === 'historical') {
                cfg.growth_rate = methodParams.growth_rate || 5;
                cfg.lookback = methodParams.lookback || 3;
            } else if (cfg.method === 'fixed') {
                cfg.fixed_value = item.base || 0;
            } else if (cfg.method === 'anchor') {
                cfg.multiplier = methodParams.multiplier || 1.05;
                cfg.buffer = methodParams.buffer || 0;
                cfg.anchor_period = methodParams.anchor_period || null;
            } else if (cfg.method === 'percent_revenue') {
                cfg.base_period = methodParams.base_period || null;
                cfg.revenue_growth = methodParams.revenue_growth || 5;
            }
            itemConfigs[item.code] = cfg;
        });

        // ── Build body for API ──
        const body = {
            horizon:      this.currentHorizon,
            method:       this.currentMethod,
            params:       methodParams,
            item_configs: itemConfigs
        };
        if (this.selectedRestaurants.length > 0) {
            body.pc = this.selectedRestaurants.join(',');
        } else if (this.selectedChains.length > 0) {
            body.chain = this.selectedChains.join(',');
        }

        let result = null;

        try {
            const resp = await fetch(`${API_BASE}/api/forecast/compute`, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify(body)
            });
            const json = await resp.json();
            if (json.status === 'ok') {
                result = json;
            } else {
                throw new Error(json.message || 'API error');
            }
        } catch (e) {
            console.warn('[Forecast] API unavailable, using mock data:', e.message);
            result = this._buildMockResult();
        }

        // ── Update status ──
        statusEl.className = 'forecast-status status-success';
        statusText.textContent = `✅ Forecast hoàn tất — ${result.projections?.length || 0} kỳ | Filter: ${filterDesc}`;
        if (btn) btn.disabled = false;

        this.computeResult = result;
        // Enrich for Consolidation tab
        this.computeResult.filter = filterDesc;
        this.computeResult.method = this.currentMethod;
        this.computeResult.chains = [...(this.selectedChains || [])];
        this.computeResult.restaurants = [...(this.selectedRestaurants || [])];

        // ── Update P&L table filter label ──
        const fcDesc = document.getElementById('fcPnlFilterDesc');
        if (fcDesc) fcDesc.textContent = `${filterDesc} · ${result.projections?.length || 0} kỳ · Phương pháp: ${this.currentMethod}`;

        // ── Render inline P&L forecast table ──
        this.renderResults(result);

        // ── Open full P&L table in a new tab ──
        this._openResultsTab(result, filterDesc);
    },

    // ─── Build isolated mock result (no shared state) ───
    _buildMockResult() {
        const now = new Date();
        const histData = [];
        const histPeriods = [];
        for (let i = 5; i >= 0; i--) {
            let m = now.getMonth() + 1 - i;
            let y = now.getFullYear();
            while (m <= 0) { m += 12; y--; }
            const dk = y * 100 + m;
            histPeriods.push(dk);
            const row = { datekey: dk };
            FORECAST_ITEMS.forEach(item => {
                row[item.code] = Math.round((item.base || 0) * (0.9 + Math.random() * 0.2));
            });
            histData.push(row);
        }

        const projections = [];
        for (let i = 1; i <= this.currentHorizon; i++) {
            let m = (now.getMonth() + 1) + i;
            let y = now.getFullYear();
            while (m > 12) { m -= 12; y++; }
            const dk = y * 100 + m;
            const row = { datekey: dk };
            const rate = parseFloat(document.getElementById('growthRate')?.value || 5) / 100;
            FORECAST_ITEMS.forEach(item => {
                row[item.code] = Math.round((item.base || 0) * Math.pow(1 + rate, i));
            });
            projections.push(row);
        }

        const prevFC = {};
        FORECAST_ITEMS.forEach(item => {
            prevFC[item.code] = Math.round((item.base || 0) * (0.95 + Math.random() * 0.1));
        });

        return {
            status:             'ok',
            method:             this.currentMethod,
            horizon:            this.currentHorizon,
            filter:             'MOCK',
            historical_periods: histPeriods,
            line_items:         FORECAST_ITEMS.map(i => i.code),
            historical:         histData,
            projections:        projections,
            previous_forecast:  prevFC
        };
    },

    // ─── Open a new browser tab with the full P&L forecast table ───
    _openResultsTab(data, filterDesc) {
        const now       = new Date();
        const genTime   = now.toLocaleString('vi-VN');
        const horizon   = data.projections?.length || 0;
        const method    = data.method || this.currentMethod;

        // ── Column headers (historical + projection) ──
        // Apply formula computation to all period rows
        const histData = (data.historical || []).map(r => this._computeFormulas({...r, datekey: parseInt(r.datekey)}));
        const projData = (data.projections || []).map(r => this._computeFormulas({...r, datekey: parseInt(r.datekey)}));

        const histPeriods = histData.map(r => {
            const m = r.datekey % 100;
            const y = Math.floor(r.datekey / 100);
            return { dk: r.datekey, label: `T${m}/${y}`, type: 'actual' };
        });
        const projPeriods = projData.map(r => {
            const m = r.datekey % 100;
            const y = Math.floor(r.datekey / 100);
            return { dk: r.datekey, label: `T${m}/${y} 🔮`, type: 'forecast' };
        });
        const allPeriods = [...histPeriods, ...projPeriods];

        // ── Build table rows from PNL_DATA order ──
        const fmt = v => {
            if (v === null || v === undefined) return '—';
            if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
            if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
            if (Math.abs(v) >= 1e3) return Math.round(v).toLocaleString('vi-VN');
            return Math.round(v).toLocaleString('vi-VN');
        };

        const isBold = code => ['TC','SD01','SD02','SD03','SD04','SD09','SD10'].includes(code);
        const isCost = code => code.startsWith('CP') || code === 'DT02';

        // Lookup helper (uses formula-computed data)
        const getPeriodVal = (dk, code, type) => {
            const dkInt = parseInt(dk);
            if (type === 'actual') {
                const row = histData.find(r => r.datekey === dkInt);
                return row ? (row[code] ?? null) : null;
            } else {
                const row = projData.find(r => r.datekey === dkInt);
                return row ? (row[code] ?? null) : null;
            }
        };

        const colHeaders = allPeriods.map(p =>
            `<th class="${p.type === 'forecast' ? 'col-fc' : 'col-actual'}">${p.label}</th>`
        ).join('');

        const tableRows = FORECAST_ITEMS.map(item => {
            const bold  = isBold(item.code);
            const cost  = isCost(item.code);
            const level = item.code.length === 6 ? 2 : item.code.length === 4 ? 1 : 0;
            const indent = level === 2 ? 'style="padding-left:2.5rem;font-size:0.88rem"'
                         : level === 1 ? 'style="padding-left:1.3rem"' : '';
            const rowClass = bold ? 'row-bold' : cost ? 'row-cost' : '';

            const cells = allPeriods.map(p => {
                const val = getPeriodVal(p.dk, item.code, p.type);
                const cls = p.type === 'forecast' ? 'col-fc' : '';
                return `<td class="${cls}">${val !== null ? fmt(val) : '—'}</td>`;
            }).join('');

            return `<tr class="${rowClass}">
                <td class="col-item" ${indent}>${item.name} <small class="code-chip">${item.code}</small></td>
                ${cells}
            </tr>`;
        }).join('');

        // ── Variance summary row (last actual vs first forecast) ──
        const lastActual = histData.length > 0 ? histData[histData.length - 1] : null;
        const firstFC    = projData.length > 0 ? projData[0] : null;
        let varianceRows = '';
        if (lastActual && firstFC) {
            varianceRows = FORECAST_ITEMS.map(item => {
                const a = lastActual[item.code] || 0;
                const f = firstFC[item.code] || 0;
                const pct = a ? ((f - a) / Math.abs(a) * 100).toFixed(1) : '—';
                const sign = pct !== '—' ? (parseFloat(pct) >= 0 ? '+' : '') : '';
                const color = pct !== '—' ? (parseFloat(pct) >= 0 ? '#10b981' : '#ef4444') : '#94a3b8';
                return `<tr>
                    <td>${item.name} (${item.code})</td>
                    <td>${fmt(a)}</td>
                    <td>${fmt(f)}</td>
                    <td style="color:${color};font-weight:600">${pct !== '—' ? sign + pct + '%' : '—'}</td>
                </tr>`;
            }).join('');
        }

        const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Forecast Report — ${filterDesc}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: #0f172a; color: #e2e8f0; line-height: 1.5; }
  .page-wrap { max-width: 1400px; margin: 0 auto; padding: 2rem; }
  .page-header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:2rem; border-bottom:1px solid #1e293b; padding-bottom:1.5rem; }
  .page-header h1 { font-size:1.6rem; font-weight:700; background: linear-gradient(135deg,#38bdf8,#818cf8); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
  .page-header .meta { font-size:0.8rem; color:#64748b; margin-top:0.4rem; display:flex; flex-direction:column; gap:0.2rem; }
  .badge { display:inline-block; padding:0.2rem 0.7rem; border-radius:99px; font-size:0.72rem; font-weight:600; }
  .badge-method { background:#1e3a5f; color:#38bdf8; }
  .badge-filter { background:#1e2d1f; color:#4ade80; }
  .badge-mock   { background:#2d1b00; color:#f59e0b; }
  .section-title { font-size:1rem; font-weight:600; color:#94a3b8; letter-spacing:.06em; text-transform:uppercase; margin-bottom:1rem; margin-top:2rem; }
  .table-wrap { overflow-x:auto; border-radius:12px; border:1px solid #1e293b; }
  table { width:100%; border-collapse:collapse; font-size:0.83rem; }
  thead tr { background:#151e2f; }
  thead th { padding:0.75rem 1rem; text-align:right; color:#64748b; font-weight:500; white-space:nowrap; border-bottom:1px solid #1e293b; }
  thead th:first-child { text-align:left; min-width:200px; }
  tbody tr { border-bottom:1px solid #111827; transition:background 0.15s; }
  tbody tr:hover { background:#0f172a; }
  tbody td { padding:0.55rem 1rem; text-align:right; color:#cbd5e1; white-space:nowrap; }
  tbody td:first-child { text-align:left; color:#e2e8f0; }
  .row-bold td { font-weight:700 !important; color:#f1f5f9 !important; background:#131f34 !important; border-top:1px solid #1e3a5f; border-bottom:1px solid #1e3a5f; }
  .row-cost td { color:#94a3b8; }
  .col-fc { color:#67e8f9 !important; }
  .col-actual { }
  .col-item { }
  .code-chip { font-size:0.65rem; color:#475569; margin-left:0.4rem; font-family:monospace; background:#1e293b; padding:0.1rem 0.4rem; border-radius:4px; }
  .var-table table thead th { text-align:left; }
  .var-table table tbody td { text-align:left; }
  .footer { margin-top:3rem; text-align:center; font-size:0.75rem; color:#334155; }
  @media print { body { background:#fff; color:#000; } .page-header h1 { -webkit-text-fill-color:#1e293b; } }
</style>
</head>
<body>
<div class="page-wrap">
  <div class="page-header">
    <div>
      <h1>📊 Forecast P&L Report</h1>
      <div class="meta">
        <span>🏪 Filter: <strong>${filterDesc}</strong></span>
        <span>📅 Tạo lúc: ${genTime}</span>
        <span>🔮 Kỳ dự báo: ${horizon} tháng</span>
      </div>
    </div>
    <div style="display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:flex-end">
      <span class="badge badge-method">Phương pháp: ${method}</span>
      <span class="badge ${data.filter === 'MOCK' ? 'badge-mock' : 'badge-filter'}">${data.filter === 'MOCK' ? '⚠️ MOCK DATA' : '✅ Live DB'}</span>
    </div>
  </div>

  <p class="section-title">Bảng P&L Dự Báo — Tất cả chỉ tiêu</p>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Chỉ tiêu</th>
          ${colHeaders}
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>

  ${varianceRows ? `
  <p class="section-title" style="margin-top:2.5rem">Phân tích Chênh lệch — Thực tế kỳ cuối vs Dự báo kỳ 1</p>
  <div class="table-wrap var-table">
    <table>
      <thead><tr><th>Chỉ tiêu</th><th>Thực tế</th><th>FC kỳ 1</th><th>Chênh lệch</th></tr></thead>
      <tbody>${varianceRows}</tbody>
    </table>
  </div>` : ''}

  <div class="footer">PnL Forecast · Forecast Builder · Generated ${genTime}</div>
</div>
<script>window.addEventListener('beforeprint', () => document.title = 'Forecast_${filterDesc.replace(/[^a-zA-Z0-9]/g,'_')}');<\/script>
</body></html>`;

        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        window.open(url, '_blank');

        // Revoke after 60s to free memory
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    },


    getMethodParams() {
        const params = {};

        if (this.currentMethod === 'historical') {
            params.growth_rate = parseFloat(document.getElementById('growthRate')?.value || 5);
            params.lookback = parseInt(document.getElementById('lookbackPeriods')?.value || 3);
        } else if (this.currentMethod === 'fixed') {
            params.fixed_values = {};
            FORECAST_ITEMS.forEach(item => {
                params.fixed_values[item.code] = Utils.parseCurrency(document.getElementById('fixedAmount')?.value || '100000');
            });
        } else if (this.currentMethod === 'anchor') {
            const periodSel = document.getElementById('anchorPeriod');
            params.anchor_period = periodSel ? parseInt(periodSel.value) : null;
            params.multiplier = parseFloat(document.getElementById('anchorMultiplier')?.value || 1.05);
            params.buffer = Utils.parseCurrency(document.getElementById('anchorBuffer')?.value || '0');
        } else if (this.currentMethod === 'percent_revenue') {
            const periodSel = document.getElementById('percentRevPeriod');
            params.base_period = periodSel ? parseInt(periodSel.value) : null;
            params.revenue_growth = parseFloat(document.getElementById('revGrowthRate')?.value || 5);
        }

        return params;
    },


    // ═══════════════════════════════════════════════════════════
    // RENDER RESULTS — Full P&L Forecast Table (Dashboard format)
    // ═══════════════════════════════════════════════════════════

    renderResults(data) {
        if (!data) return;
        this.renderPnLForecastTable(data);
    },

    updateResultsForItem() {
        if (this.computeResult) {
            this.renderResults(this.computeResult);
        }
    },

    // ─── Hierarchy helpers (mirror Dashboard logic) ───
    _getCodeLevel(code) {
        if (!code) return 0;
        const len = code.trim().length;
        if (len === 2) return 0;
        if (len === 4) return 1;
        if (len === 6) return 2;
        return 0;
    },

    _isFormulaRow(code) {
        const item = PNL_DATA.find(i => i.code === code);
        return item ? !!item.isFormula : false;
    },

    _isInvertedVariance(code) {
        if (code.startsWith('CP')) return true;
        if (code === 'DT02') return true;
        return false;
    },

    // ─── Compute formula rows for a single projection period (mirrors Dashboard) ───
    _computeFormulas(row) {
        const v = code => row[code] || 0;

        // Step 1: Parent subtotals — if a PNL_DATA code has no direct value, sum children
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

        // Step 2: Cross-indicator formulas (same as Dashboard.applyServerData)
        // SD01: Net Revenue = DT01 - DT02
        row['SD01'] = v('DT01') - v('DT02');

        // SD02: Gross Profit = Net Revenue - COGS
        row['SD02'] = v('SD01') - v('CP01');

        // SD03: CM = Gross Profit - SUM(CP02xx)
        let opex = 0;
        PNL_DATA.forEach(i => {
            if (i.code.startsWith('CP02')) opex += (row[i.code] || 0);
        });
        row['SD03'] = v('SD02') - opex;

        // SD04: UC (may come from DB or need calculation)
        // Keep DB value if exists, otherwise it stays as-is

        // SD09: Profit after tax
        if (!row['SD09'] || row['SD09'] === 0) {
            row['SD09'] = v('SD04') + v('DT03') - v('CP05') + v('DT04') - v('CP06') - v('CP07') - v('CP08');
        }

        // TA: Average Revenue per Guest = DT01 / TC
        const tcVal = v('TC');
        row['TA'] = tcVal > 0 ? Math.round(v('DT01') / tcVal) : 0;

        return row;
    },

    // ─── Render the full P&L Forecast table inline ───
    renderPnLForecastTable(data) {
        const container = document.getElementById('forecastPnlTableBody');
        if (!container) return;

        // Debug: log the API response structure
        console.log('[Forecast P&L] API response:', {
            projections_count: data.projections?.length,
            line_items: data.line_items?.slice(0, 10),
            sample_proj: data.projections?.[0],
            historical_count: data.historical?.length,
        });

        // Normalize projections datekeys to numbers + compute formulas
        const projections = (data.projections || []).map(r => {
            const normalized = { ...r, datekey: parseInt(r.datekey) };
            return this._computeFormulas(normalized);
        });

        // Build projection period columns
        const projPeriods = projections.map(r => {
            const m = r.datekey % 100;
            const y = Math.floor(r.datekey / 100);
            return { dk: r.datekey, label: `T${m}/${y}` };
        });

        // Update column headers dynamically
        const thead = document.getElementById('forecastPnlThead');
        if (thead) {
            thead.innerHTML = `
                <th class="col-code">Mã</th>
                <th class="col-item">Chỉ tiêu</th>
                ${projPeriods.map(p => `<th class="col-forecast">🔮 ${p.label}</th>`).join('')}
            `;
        }

        // Get last actual period for variance calculation
        const lastHist = data.historical?.length > 0
            ? data.historical[data.historical.length - 1] : null;

        // Build rows using PNL_DATA order (same as Dashboard)
        const rows = PNL_DATA.map((item, index) => {
            const level     = this._getCodeLevel(item.code);
            const isFormula = this._isFormulaRow(item.code);
            const invert    = this._isInvertedVariance(item.code);

            // Row CSS class (mirrors Dashboard styling)
            let rowClass = '';
            if (isFormula) rowClass = 'row-formula';
            else if (level === 0) rowClass = 'row-parent';

            // Indent class
            let indentClass = '';
            if (level === 1) indentClass = 'indent-1';
            else if (level === 2) indentClass = 'indent-2';

            // Code display
            const codeDisplay = isFormula
                ? `<span class="code-formula" title="${item.formulaDesc || ''}">${item.code}</span>`
                : `<span class="code-tag code-level-${level}">${item.code}</span>`;

            // Forecast value cells for each projection period
            const fcCells = projPeriods.map((p, pi) => {
                const projRow = projections[pi];
                const val = projRow ? (projRow[item.code] ?? 0) : 0;
                return `<td class="forecast-cell">${Utils.currency(val)}</td>`;
            }).join('');

            return `<tr class="${rowClass}">
                <td class="col-code">${codeDisplay}</td>
                <td class="col-item ${indentClass}">${item.label}</td>
                ${fcCells}
            </tr>`;
        }).join('');

        container.innerHTML = rows;

        // Debug: Check if any values were found
        if (projections.length > 0) {
            const sample = projections[0];
            const pnlCodes = PNL_DATA.map(i => i.code);
            const matchedCodes = pnlCodes.filter(c => sample[c] !== undefined && sample[c] !== 0);
            const apiCodes = Object.keys(sample).filter(k => k !== 'datekey');
            console.log('[Forecast P&L] Code matching:', {
                pnl_codes: pnlCodes,
                api_codes: apiCodes,
                matched: matchedCodes,
                unmatched_api: apiCodes.filter(c => !pnlCodes.includes(c)),
                unmatched_pnl: pnlCodes.filter(c => !apiCodes.includes(c))
            });
        }
    },

    formatVariance(actual, base) {
        if (!base || base === 0) return '—';
        const pct = ((actual - base) / Math.abs(base)) * 100;
        const cls = pct >= 0 ? 'val-positive' : 'val-negative';
        const sign = pct >= 0 ? '+' : '';
        return `<span class="${cls}">${sign}${pct.toFixed(1)}%</span>`;
    },

    // ═══════════════════════════════════════════════════════════
    // EVENT BINDING
    // ═══════════════════════════════════════════════════════════

    bindEvents() {
        // Search
        const search = document.getElementById('forecastSearch');
        if (search) {
            search.addEventListener('input', Utils.debounce(() => {
                this.renderLineItems(search.value);
            }, 200));
        }

        // Method selector
        document.querySelectorAll('.method-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.setMethod(btn.dataset.method);
            });
        });

        // Growth type toggle
        document.querySelectorAll('[data-growth]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-growth]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.updateFormulaDisplay();
            });
        });

        // Sliders
        this.bindSlider('growthRate', 'growthRateValue', v => v.toFixed(1) + '%');
        this.bindSlider('anchorMultiplier', 'anchorMultiplierValue', v => '×' + v.toFixed(2));
        this.bindSlider('revGrowthRate', 'revGrowthRateValue', v => v.toFixed(1) + '%');

        // Fixed amount
        const fixedAmount = document.getElementById('fixedAmount');
        if (fixedAmount) {
            fixedAmount.addEventListener('input', Utils.debounce(() => this.updateFormulaDisplay(), 300));
        }

        // Anchor buffer
        const anchorBuffer = document.getElementById('anchorBuffer');
        if (anchorBuffer) {
            anchorBuffer.addEventListener('input', Utils.debounce(() => this.updateFormulaDisplay(), 300));
        }

        // ── Chain Multi-Select Trigger ──
        document.getElementById('fcChainTrigger')?.addEventListener('click', () => {
            this._toggleDropdown('fcChainTrigger', 'fcChainDropdown');
        });

        // ── Chain Search Filter ──
        document.getElementById('fcChainSearch')?.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const filtered = this.chainsData.filter(c => c.chain.toLowerCase().includes(q));
            this._renderChainOptions(filtered);
        });

        // ── Chain Clear All ──
        document.getElementById('fcChainClearAll')?.addEventListener('click', () => {
            this.selectedChains = [];
            this._updateChainUI();
            this._refreshRestaurantPool();
        });

        // ── Chain Select All ──
        document.getElementById('fcChainSelectAll')?.addEventListener('click', () => {
            this._selectAllChains();
        });

        // ── Restaurant Multi-Select Trigger ──
        document.getElementById('fcRestTrigger')?.addEventListener('click', () => {
            this._toggleDropdown('fcRestTrigger', 'fcRestDropdown');
        });

        // ── Restaurant Search Filter ──
        document.getElementById('fcRestSearch')?.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const allRests = [];
            this.selectedChains.forEach(chain => {
                const c = this.chainsData.find(d => d.chain === chain);
                if (c) allRests.push(...c.restaurants);
            });
            this._renderRestOptions(allRests.filter(r => r.toLowerCase().includes(q)));
        });

        // ── Restaurant Clear All ──
        document.getElementById('fcRestClearAll')?.addEventListener('click', () => {
            this.selectedRestaurants = [];
            this._updateRestUI();
        });

        // ── Restaurant Select All ──
        document.getElementById('fcRestSelectAll')?.addEventListener('click', () => {
            this._selectAllRestaurants();
        });

        // ── Close dropdowns when clicking outside ──
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.fc-multiselect')) {
                document.querySelectorAll('.fc-ms-dropdown').forEach(d => d.classList.add('hidden'));
                document.querySelectorAll('.fc-ms-trigger').forEach(t => t.classList.remove('open'));
            }
        });

        // Horizon selector
        document.querySelectorAll('.horizon-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.horizon-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentHorizon = parseInt(btn.dataset.horizon);
            });
        });

        // Run Forecast button
        const runBtn = document.getElementById('btnRunForecast');
        if (runBtn) {
            runBtn.addEventListener('click', () => this.runForecast());
        }

        // Apply formula
        const applyBtn = document.getElementById('applyFormula');
        if (applyBtn) {
            applyBtn.addEventListener('click', () => {
                if (this.selectedItem) {
                    this.selectedItem.configured = true;
                    this.selectedItem.method = this.currentMethod;
                    this.renderLineItems(document.getElementById('forecastSearch')?.value || '');
                }
            });
        }

        // Reset formula
        const resetBtn = document.getElementById('resetFormula');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (this.selectedItem) {
                    this.selectedItem.configured = false;
                    this.selectedItem.method = null;
                    this.setMethod('historical');
                    this.renderLineItems(document.getElementById('forecastSearch')?.value || '');
                }
            });
        }
    },

    bindSlider(sliderId, displayId, formatter) {
        const slider = document.getElementById(sliderId);
        const display = document.getElementById(displayId);
        if (slider && display) {
            slider.addEventListener('input', () => {
                display.textContent = formatter(parseFloat(slider.value));
                this.updateFormulaDisplay();
            });
        }
    }
};
