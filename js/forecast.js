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
    collapsedLineItems: new Set(), // Collapsed parent codes in sidebar
    isAdmin: false, // Set true after /api/auth/me check

    async init() {
        this.populatePeriodDropdowns();
        this.bindEvents();
        this.loadChains();

        // Check admin role
        try {
            const res = await fetch('/api/auth/me');
            if (res.ok) {
                const data = await res.json();
                this.isAdmin = data.user?.role === 'admin';
            }
        } catch(e) {}

        // Load persisted formulas from server, then render
        await this.loadFormulasFromServer();
        this.renderLineItems();
        this.selectItem(FORECAST_ITEMS[0]);

        // Show/hide admin save button
        const saveBtn = document.getElementById('btnSaveFormulas');
        if (saveBtn) saveBtn.style.display = this.isAdmin ? '' : 'none';
    },

    async loadFormulasFromServer() {
        try {
            const resp = await fetch(`${API_BASE}/api/forecast/formulas`);
            const json = await resp.json();
            if (json.status === 'ok' && json.formulas) {
                const formulas = json.formulas;
                FORECAST_ITEMS.forEach(item => {
                    const cfg = formulas[item.code];
                    if (cfg) {
                        item.configured = true;
                        item.method = cfg.method || item.method;
                        if (cfg.growth_rate !== undefined) item.growth_rate = cfg.growth_rate;
                        if (cfg.lookback !== undefined) item.lookback = cfg.lookback;
                        if (cfg.fixed_value !== undefined) item.base = cfg.fixed_value;
                        if (cfg.multiplier !== undefined) item.multiplier = cfg.multiplier;
                        if (cfg.buffer !== undefined) item.buffer = cfg.buffer;
                        if (cfg.anchor_period !== undefined) item.anchor_period = cfg.anchor_period;
                        if (cfg.base_period !== undefined) item.base_period = cfg.base_period;
                        if (cfg.revenue_growth !== undefined) item.revenue_growth = cfg.revenue_growth;
                        if (cfg.rolling4w_adjustment !== undefined) item.rolling4w_adjustment = cfg.rolling4w_adjustment;
                        if (cfg.variable_percent !== undefined) item.variable_percent = cfg.variable_percent;
                    }
                });
                const info = json.updated_at ? ` (cập nhật: ${json.updated_at} bởi ${json.updated_by})` : '';
                console.log(`[Forecast] Loaded ${Object.keys(formulas).length} formula configs from server${info}`);
            }
        } catch(e) {
            console.warn('[Forecast] Could not load formulas from server:', e.message);
        }
    },

    async saveAllFormulas() {
        if (!this.isAdmin) {
            Utils.toast('Chỉ admin mới có quyền lưu công thức', 'error');
            return;
        }
        const formulas = {};
        FORECAST_ITEMS.forEach(item => {
            if (item.configured && item.method) {
                const cfg = { method: item.method };
                if (item.method === 'historical') {
                    cfg.growth_rate = item.growth_rate || 5;
                    cfg.lookback = item.lookback || 3;
                } else if (item.method === 'fixed') {
                    cfg.fixed_value = item.base || 0;
                } else if (item.method === 'fixed_variable') {
                    cfg.fixed_value = item.base || 0;
                    cfg.variable_percent = item.variable_percent || 0;
                } else if (item.method === 'anchor') {
                    cfg.multiplier = item.multiplier || 1.05;
                    cfg.buffer = item.buffer || 0;
                    cfg.anchor_period = item.anchor_period || null;
                } else if (item.method === 'percent_revenue') {
                    cfg.base_period = item.base_period || null;
                    cfg.revenue_growth = item.revenue_growth || 5;
                } else if (item.method === 'rolling4w') {
                    cfg.rolling4w_adjustment = item.rolling4w_adjustment || 0;
                }
                formulas[item.code] = cfg;
            }
        });

        try {
            const resp = await fetch(`${API_BASE}/api/forecast/formulas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ formulas })
            });
            const json = await resp.json();
            if (json.status === 'ok') {
                Utils.toast(`💾 ${json.message}`, 'success');
            } else {
                Utils.toast(json.message || 'Lỗi lưu công thức', 'error');
            }
        } catch(e) {
            Utils.toast('Lỗi kết nối server', 'error');
        }
    },

    populatePeriodDropdowns() {
        const percentRevSel = document.getElementById('percentRevPeriod');
        const anchorSel = document.getElementById('anchorPeriod');
        
        let optsHtml = `
            <option value="avg_3">Bình quân 3 tháng gần nhất</option>
            <option value="avg_6">Bình quân 6 tháng gần nhất</option>
            <option disabled>──────────</option>
        `;
        
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            let m = now.getMonth() - i;
            let y = now.getFullYear();
            while (m < 0) {
                m += 12;
                y -= 1;
            }
            const dk = y * 100 + (m + 1);
            optsHtml += `<option value="${dk}">Tháng ${m + 1}/${y}</option>`;
        }

        if (percentRevSel) percentRevSel.innerHTML = optsHtml;
        if (anchorSel) anchorSel.innerHTML = optsHtml;
    },

    // ═══════════════════════════════════════════════════════════
    // LINE ITEMS SIDEBAR
    // ═══════════════════════════════════════════════════════════

    // Section header definitions — group PNL_DATA items visually
    _SECTION_HEADERS: {
        'TC':     { before: '📊 KPI Vận hành',              cls: 'fc-section-kpi' },
        'DT01':   { before: '💰 A. Doanh thu',              cls: 'fc-section-revenue' },
        'DT02':   { before: null },
        'SD01':   { before: null },
        'CP01':   { before: '📦 B. Giá vốn (COGS)',         cls: 'fc-section-cogs' },
        'SD02':   { before: null },
        'CP0201': { before: '⚙️ C. Chi phí vận hành',       cls: 'fc-section-opex' },
        'CP03':   { before: '🏗️ D–E. Chi phí phân bổ',     cls: 'fc-section-alloc' },
        'SD04':   { before: null },
        'CP09':   { before: '📉 F. Khấu hao & D&A TĐ',     cls: 'fc-section-da' },
        'SD05':   { before: null },
        'DT03':   { before: '🏦 G–K. Tài chính & Khác',    cls: 'fc-section-finance' },
        'SD07':   { before: null },
        'SD08':   { before: null },
        'CP08':   { before: null },
        'SD09':   { before: '🏁 Tổng kết',                  cls: 'fc-section-summary' },
        'SD10':   { before: null },
        'SD11':   { before: null },
    },

    renderLineItems(filter = '') {
        const list = document.getElementById('lineItemsList');
        if (!list) return;

        const lf = filter.toLowerCase();
        const filtered = FORECAST_ITEMS.filter(item =>
            !lf ||
            item.name.toLowerCase().includes(lf) ||
            item.code.toLowerCase().includes(lf)
        );

        const parts = [];
        const emittedSections = new Set();

        filtered.forEach((item, idx) => {
            const pnlDef = PNL_DATA.find(p => p.code === item.code);
            const isSubtotal = pnlDef && (pnlDef.isSubtotal || pnlDef.isFormula);

            // Section header before this item?
            const sec = this._SECTION_HEADERS[item.code];
            if (sec && sec.before && !emittedSections.has(sec.before)) {
                emittedSections.add(sec.before);
                parts.push(`<div class="fc-section-header ${sec.cls || ''}">${sec.before}</div>`);
            }

            const isActive = this.selectedItem && this.selectedItem.code === item.code;

            // Check if this item is a parent (has children in the filtered list)
            const isParent = !isSubtotal && filtered.some((other, j) =>
                j !== idx && !other.code.startsWith('SD') &&
                other.code.startsWith(item.code) && other.code.length > item.code.length
            );

            // Check if this item is hidden (any ancestor is collapsed)
            const isHidden = !isSubtotal && this._isLineItemHidden(item.code, filtered);
            const isCollapsed = this.collapsedLineItems.has(item.code);

            // Badge
            let tag;
            if (isSubtotal) {
                tag = '<span class="line-item-tag tag-auto">Auto</span>';
            } else if (item.configured) {
                tag = '<span class="line-item-tag tag-configured">Set</span>';
            } else {
                tag = '<span class="line-item-tag tag-pending">Pending</span>';
            }

            // Indent
            const len = item.code.trim().length;
            let indentClass = '';
            if (len === 4) indentClass = 'fc-indent-1';
            else if (len === 6) indentClass = 'fc-indent-2';
            else if (len >= 8) indentClass = 'fc-indent-3';

            // Toggle arrow for parent items
            const toggleHtml = isParent
                ? `<span class="fc-collapse-toggle ${isCollapsed ? 'collapsed' : ''}" data-toggle-code="${item.code}"></span>`
                : '';

            // Subtotal rows: slightly different style
            const subtotalAttr = isSubtotal ? 'data-subtotal="1"' : '';
            const hiddenStyle = isHidden ? 'style="display:none"' : '';

            parts.push(`<button class="line-item-btn ${isActive ? 'active' : ''} ${indentClass} ${isSubtotal ? 'line-item-subtotal' : ''}" data-code="${item.code}" ${subtotalAttr} ${hiddenStyle}>
                <div style="display:flex;align-items:center;gap:4px;">
                    ${toggleHtml}
                    <div>
                        <div style="font-weight:${isSubtotal ? '700' : '600'};color:${isSubtotal ? 'var(--accent-cyan)' : 'var(--text-primary)'}">${item.name}</div>
                        <div style="font-size:0.7rem;color:var(--text-muted);margin-top:2px">${item.code}</div>
                    </div>
                </div>
                ${tag}
            </button>`);
        });

        list.innerHTML = parts.join('');

        // Bind click on line item buttons
        list.querySelectorAll('.line-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                // If click was on the toggle, don't select the item
                if (e.target.closest('.fc-collapse-toggle')) return;
                const item = FORECAST_ITEMS.find(i => i.code === btn.dataset.code);
                if (item) this.selectItem(item);
            });
        });

        // Bind click on collapse toggles
        list.querySelectorAll('.fc-collapse-toggle').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = el.dataset.toggleCode;
                if (this.collapsedLineItems.has(code)) {
                    this.collapsedLineItems.delete(code);
                } else {
                    this.collapsedLineItems.add(code);
                }
                this.renderLineItems(document.getElementById('lineSearch')?.value || '');
            });
        });
    },

    _isLineItemHidden(code, items) {
        // Check if any ancestor code is collapsed
        for (const other of items) {
            if (code.startsWith(other.code) && code.length > other.code.length) {
                if (this.collapsedLineItems.has(other.code)) return true;
            }
        }
        return false;
    },

    selectItem(item) {
        this.selectedItem = item;

        const title = document.getElementById('formulaTitle');
        const tag   = document.getElementById('formulaTag');
        if (title) title.textContent = item.name;
        if (tag)   tag.textContent   = item.code;

        // Look up PNL_DATA definition to check if subtotal/formula
        const pnlDef    = PNL_DATA.find(p => p.code === item.code);
        const isSubtotal = pnlDef && (pnlDef.isSubtotal || pnlDef.isFormula);

        const formulaConfig  = document.getElementById('formulaConfig');
        const formulaActions = document.querySelector('.formula-actions');
        const formulaDisplay = document.getElementById('formulaDisplay');

        if (isSubtotal) {
            // Show read-only info for DB-derived rows
            if (formulaConfig)  formulaConfig.style.display  = 'none';
            if (formulaActions) formulaActions.style.display = 'none';
            if (formulaDisplay) {
                formulaDisplay.style.display = 'block';
                formulaDisplay.innerHTML = `<div class="formula-visual" style="flex-direction:column;gap:10px;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <span style="font-size:1.6rem;">🔁</span>
                        <div>
                            <div style="font-weight:700;color:var(--accent-cyan);font-size:0.95rem;">Chỉ tiêu tổng hợp — lấy từ Database</div>
                            <div style="font-size:0.8rem;color:var(--text-muted);margin-top:4px;">
                                ${item.code} được tính sẵn trên hệ thống. Giá trị Forecast sẽ được lấy từ kết quả tính toán của DB sau khi chạy Forecast.
                            </div>
                        </div>
                    </div>
                    ${pnlDef.formulaDesc ? `<div style="background:rgba(6,182,212,0.08);border:1px solid rgba(6,182,212,0.2);border-radius:8px;padding:10px 14px;font-size:0.82rem;color:var(--accent-cyan);">
                        <strong>Công thức:</strong> ${pnlDef.formulaDesc}
                    </div>` : ''}
                </div>`;
            }
        } else {
            // Show standard config form
            if (formulaConfig)  formulaConfig.style.display  = '';
            if (formulaActions) formulaActions.style.display = '';
            if (formulaDisplay) formulaDisplay.style.display = '';
            if (item.configured && item.method) {
                this.setMethod(item.method);
                // Load values into UI inputs
                if (item.method === 'historical') {
                    const growthRateInput = document.getElementById('growthRate');
                    const growthRateValue = document.getElementById('growthRateValue');
                    if (growthRateInput) {
                        growthRateInput.value = item.growth_rate !== undefined ? item.growth_rate : 5;
                        if (growthRateValue) growthRateValue.textContent = growthRateInput.value + '%';
                    }
                    const lookbackInput = document.getElementById('lookbackPeriods');
                    if (lookbackInput) {
                        lookbackInput.value = item.lookback !== undefined ? item.lookback : 3;
                    }
                } else if (item.method === 'fixed') {
                    const fixedInput = document.getElementById('fixedAmount');
                    if (fixedInput) {
                        fixedInput.value = Utils.number(item.base !== undefined ? item.base : 100000);
                    }
                } else if (item.method === 'fixed_variable') {
                    const fvFixedAmountInput = document.getElementById('fvFixedAmount');
                    if (fvFixedAmountInput) {
                        fvFixedAmountInput.value = Utils.number(item.base !== undefined ? item.base : 50000000);
                    }
                    const fvVariablePercentInput = document.getElementById('fvVariablePercent');
                    const fvVariablePercentValue = document.getElementById('fvVariablePercentValue');
                    if (fvVariablePercentInput) {
                        fvVariablePercentInput.value = item.variable_percent !== undefined ? item.variable_percent : 3.5;
                        if (fvVariablePercentValue) fvVariablePercentValue.textContent = fvVariablePercentInput.value + '%';
                    }
                } else if (item.method === 'anchor') {
                    const multiplierInput = document.getElementById('anchorMultiplier');
                    const multiplierValue = document.getElementById('anchorMultiplierValue');
                    if (multiplierInput) {
                        multiplierInput.value = item.multiplier !== undefined ? item.multiplier : 1.05;
                        if (multiplierValue) multiplierValue.textContent = '×' + parseFloat(multiplierInput.value).toFixed(2);
                    }
                    const bufferInput = document.getElementById('anchorBuffer');
                    if (bufferInput) {
                        bufferInput.value = item.buffer !== undefined ? item.buffer : 0;
                    }
                    const anchorPeriodInput = document.getElementById('anchorPeriod');
                    if (anchorPeriodInput && item.anchor_period !== undefined) {
                        anchorPeriodInput.value = item.anchor_period;
                    }
                } else if (item.method === 'percent_revenue') {
                    const basePeriodInput = document.getElementById('percentRevPeriod');
                    if (basePeriodInput && item.base_period !== undefined) {
                        basePeriodInput.value = item.base_period;
                    }
                    const revGrowthRateInput = document.getElementById('revGrowthRate');
                    const revGrowthRateValue = document.getElementById('revGrowthRateValue');
                    if (revGrowthRateInput) {
                        revGrowthRateInput.value = item.revenue_growth !== undefined ? item.revenue_growth : 5;
                        if (revGrowthRateValue) revGrowthRateValue.textContent = revGrowthRateInput.value + '%';
                    }
                } else if (item.method === 'rolling4w') {
                    const rolling4wAdjInput = document.getElementById('rolling4wAdj');
                    const rolling4wAdjValue = document.getElementById('rolling4wAdjValue');
                    if (rolling4wAdjInput) {
                        rolling4wAdjInput.value = item.rolling4w_adjustment !== undefined ? item.rolling4w_adjustment : 0;
                        const sign = rolling4wAdjInput.value >= 0 ? '+' : '';
                        if (rolling4wAdjValue) rolling4wAdjValue.textContent = sign + parseFloat(rolling4wAdjInput.value).toFixed(1) + '%';
                    }
                }
            }
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
        opts.innerHTML = data.map(c => {
            // chain_name from BR column, fallback to chain code
            const displayName = c.chain_name && c.chain_name !== c.chain ? c.chain_name : c.chain;
            const isSelected  = this.selectedChains.includes(c.chain);
            return `
            <div class="fc-ms-option ${isSelected ? 'selected' : ''}"
                 data-value="${c.chain}">
                <span class="fc-ms-check">✓</span>
                <span class="fc-ms-label">${displayName} <em>(${c.count} NH)</em></span>
            </div>`;
        }).join('');
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
            // Show chain_name in tag if available
            tags.innerHTML = this.selectedChains.map(c => {
                const chainData = this.chainsData.find(d => d.chain === c);
                const label = (chainData && chainData.chain_name && chainData.chain_name !== c)
                    ? chainData.chain_name : c;
                return `<span class="fc-tag">${label}<button class="fc-tag-rm" data-chain="${c}">×</button></span>`;
            }).join('');
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
        // Each restaurant is now an object { code, name, region }
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
            // Support both old string format and new object format
            const code     = typeof r === 'string' ? r : r.code;
            const name     = typeof r === 'string' ? '' : (r.name && r.name !== code ? r.name : '');
            const region   = typeof r === 'string' ? '' : (r.region || '');
            const label    = name ? `${code} - ${name}${region ? ' <span class="rest-region">('+region+')</span>' : ''}` : code;
            const isLocked   = (typeof LockManager !== 'undefined') && (LockManager.getState(code) === 'LOCKED');
            const isSelected = this.selectedRestaurants.includes(code);
            const lockBadge  = isLocked ? '<span style="font-size:0.68rem;color:#f87171;margin-left:4px">🔒 Locked</span>' : '';
            return `
            <div class="fc-ms-option ${isSelected ? 'selected' : ''} ${isLocked ? 'option-locked' : ''}"
                 data-value="${code}" data-locked="${isLocked}">
                <span class="fc-ms-check">${isSelected ? '✓' : ''}</span>
                <span class="fc-ms-label">${label}${lockBadge}</span>
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
        document.getElementById('paramsRolling4w').classList.toggle('hidden', method !== 'rolling4w');
        document.getElementById('paramsFixedVariable').classList.toggle('hidden', method !== 'fixed_variable');

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
        } else if (this.currentMethod === 'rolling4w') {
            const adj = parseFloat(document.getElementById('rolling4wAdj')?.value || 0) / 100;
            const adjSign = adj >= 0 ? '+' : '';
            const result = base * (1 + adj);
            const today = new Date();
            const d28 = new Date(today); d28.setDate(today.getDate() - 28);
            const fmtDate = d => d.toLocaleDateString('vi-VN', {day:'2-digit', month:'2-digit'});
            html = `<div class="formula-visual" style="flex-wrap:wrap;gap:8px;">
                <span class="formula-el formula-base" style="background:rgba(99,102,241,0.15);">
                    📅 ${fmtDate(d28)} → ${fmtDate(today)} (28 ngày)
                </span>
                <span class="formula-op">×</span>
                <span class="formula-el formula-rate">(30.44 / 28)</span>
                <span class="formula-op">${adj !== 0 ? (adj >= 0 ? '×(1'+adjSign+(adj*100).toFixed(1)+'%)' : '×(1'+adjSign+(adj*100).toFixed(1)+'%)') : ''}</span>
                <span class="formula-op">=</span>
                <span class="formula-el formula-result">${Utils.currency(Math.round(result))} / tháng</span>
            </div>`;
        } else if (this.currentMethod === 'fixed_variable') {
            const fixed = Utils.parseCurrency(document.getElementById('fvFixedAmount')?.value || '50,000,000');
            const varPercent = parseFloat(document.getElementById('fvVariablePercent')?.value || 3.5);
            const numStores = this.selectedRestaurants.length > 0 ? this.selectedRestaurants.length : (this.selectedChains.length > 0 ? 9 : 1);
            const totalFixed = fixed * numStores;
            const dtt = 2847500000; // Mock DTT for display
            const varAmount = dtt * varPercent / 100;
            const result = totalFixed + varAmount;
            
            html = `<div class="formula-visual" style="flex-wrap:wrap;gap:8px;">
                <span class="formula-el formula-base" title="Định phí mỗi NH × Số nhà hàng">Fix: (${Utils.currency(fixed)} × ${numStores} NH)</span>
                <span class="formula-op">+</span>
                <span class="formula-el formula-rate" title="Biến phí % × Doanh thu thuần dự kiến">Var: (DTT × ${varPercent}%)</span>
                <span class="formula-op">=</span>
                <span class="formula-el formula-result">${Utils.currency(Math.round(result))} (minh họa)</span>
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

        // ── Build V2 body for API ──
        // Determine reference period from UI (ref month or 'last4w')
        const refPeriodEl = document.getElementById('fcRefPeriod');
        const refPeriod = refPeriodEl ? refPeriodEl.value : 'last4w';

        // Load holiday overrides if admin has set them
        const holidayOverrides = (typeof VN_HOLIDAYS !== 'undefined')
            ? VN_HOLIDAYS._adminOverrides || {}
            : {};

        // Check if user wants to include current month
        const includeCurrentEl = document.getElementById('fcIncludeCurrentMonth');
        const includeCurrentMonth = includeCurrentEl ? includeCurrentEl.checked : true;

        const body = {
            horizon:                this.currentHorizon,
            ref_period:             refPeriod,
            holiday_overrides:      holidayOverrides,
            include_current_month:  includeCurrentMonth
        };
        if (this.selectedRestaurants.length > 0) {
            body.pc = this.selectedRestaurants.join(',');
        } else if (this.selectedChains.length > 0) {
            body.chain = this.selectedChains.join(',');
        }

        let result = null;

        try {
            const resp = await fetch(`${API_BASE}/api/forecast/compute-v2`, {
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
        const modelInfo = result.model === 'v2' ? 'V2 (Top-down PnL)' : this.currentMethod;
        statusEl.className = 'forecast-status status-success';
        statusText.textContent = `✅ Forecast hoàn tất — ${result.projections?.length || 0} kỳ | Model: ${modelInfo} | Filter: ${filterDesc}`;
        if (btn) btn.disabled = false;

        // Store V2 debug info for display
        if (result.debug) this._v2Debug = result.debug;
        if (result.ratios) this._v2Ratios = result.ratios;
        if (result.factors) this._v2Factors = result.factors;

        this.computeResult = result;
        // Enrich for Consolidation tab
        this.computeResult.filter = filterDesc;
        this.computeResult.method = this.currentMethod;
        this.computeResult.model = result.model || 'bottom_up_store';
        this.computeResult.ref_period = refPeriod;
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
            params.anchor_period = periodSel ? (isNaN(periodSel.value) ? periodSel.value : parseInt(periodSel.value)) : null;
            params.multiplier = parseFloat(document.getElementById('anchorMultiplier')?.value || 1.05);
            params.buffer = Utils.parseCurrency(document.getElementById('anchorBuffer')?.value || '0');
        } else if (this.currentMethod === 'percent_revenue') {
            const periodSel = document.getElementById('percentRevPeriod');
            params.base_period = periodSel ? (isNaN(periodSel.value) ? periodSel.value : parseInt(periodSel.value)) : null;
            params.revenue_growth = parseFloat(document.getElementById('revGrowthRate')?.value || 5);
        } else if (this.currentMethod === 'rolling4w') {
            params.rolling4w_adjustment = parseFloat(document.getElementById('rolling4wAdj')?.value || 0);
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
        if (len <= 2) return 0;
        if (len === 4) return 1;
        if (len === 6) return 2;
        if (len >= 8) return 3;
        return 1;
    },

    _isFormulaRow(code) {
        const item = PNL_DATA.find(i => i.code === code);
        return item ? (!!item.isFormula || !!item.isSubtotal) : false;
    },

    _isInvertedVariance(code) {
        if (code.startsWith('CP')) return true;
        if (code === 'DT02') return true;
        return false;
    },

    _computeFormulas(row) {
        // Step 1: Parent subtotals — if a non-subtotal code has no direct value, sum children
        PNL_DATA.forEach(item => {
            if (item.isFormula || item.isSubtotal) return;
            if (!row[item.code] || row[item.code] === 0) {
                let total = 0;
                Object.keys(row).forEach(k => {
                    if (k !== item.code && k !== 'datekey' &&
                        k.startsWith(item.code) &&
                        !k.endsWith('PT') && !k.endsWith('PMS')) {
                        total += row[k] || 0;
                    }
                });
                if (total !== 0) row[item.code] = total;
            }
        });

        // Step 2: TA = DT01 / TC (only client-side formula)
        const tcVal = row['TC'] || 0;
        row['TA'] = tcVal > 0 ? Math.round((row['DT01'] || 0) / tcVal) : 0;

        // SD rows: all come from DB directly — do NOT overwrite
        // SD01, SD02, SD03, SD04, SD05, SD07, SD08, SD09, SD10, SD11
        // are stored in the database and returned by the API.

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
            const level      = this._getCodeLevel(item.code);
            const isFormula  = !!item.isFormula;
            const isSubtotal = !!item.isSubtotal;
            const invert     = this._isInvertedVariance(item.code);

            // Row CSS class (mirrors Dashboard styling)
            let rowClass = '';
            if (isFormula || isSubtotal) rowClass = 'row-formula';
            else if (level === 0) rowClass = 'row-kpi';

            // Indent class
            const indentClass = level > 0 ? `indent-${Math.min(level, 3)}` : '';

            // Code display
            const codeBadge = (isFormula || isSubtotal)
                ? `<span class="code-formula" title="${item.formulaDesc || ''}">${item.code}</span>`
                : `<span class="code-tag code-level-${level}">${item.code}</span>`;

            // Forecast value cells for each projection period
            const fcCells = projPeriods.map((p, pi) => {
                const projRow = projections[pi];
                const val = projRow ? (projRow[item.code] ?? 0) : 0;
                return `<td class="forecast-cell">${Utils.currency(val)}</td>`;
            }).join('');

            return `<tr class="${rowClass}">
                <td class="col-code">${codeBadge}</td>
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
        this.bindSlider('rolling4wAdj', 'rolling4wAdjValue', v => {
            const sign = v >= 0 ? '+' : '';
            return `${sign}${v.toFixed(1)}%`;
        });

        // Rolling 4W — preset buttons
        document.querySelectorAll('.adj-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = parseFloat(btn.dataset.adj);
                const slider = document.getElementById('rolling4wAdj');
                const label  = document.getElementById('rolling4wAdjValue');
                if (slider) {
                    slider.value = val;
                    if (label) label.textContent = (val >= 0 ? '+' : '') + val.toFixed(1) + '%';
                    this.updateFormulaDisplay();
                }
                // Highlight active preset
                document.querySelectorAll('.adj-preset-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
            });
        });

        // Rolling 4W — show date range on init
        const dateRangeEl = document.getElementById('rolling4wDateRange');
        if (dateRangeEl) {
            const today = new Date();
            const d28   = new Date(today); d28.setDate(today.getDate() - 28);
            const fmt   = d => d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
            dateRangeEl.innerHTML = `<span>📅 Khoảng dữ liệu: <strong>${fmt(d28)}</strong> → <strong>${fmt(today)}</strong></span>`;
        }

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

        // Fixed + Variable
        const fvFixedAmount = document.getElementById('fvFixedAmount');
        if (fvFixedAmount) {
            fvFixedAmount.addEventListener('input', Utils.debounce(() => this.updateFormulaDisplay(), 300));
        }
        this.bindSlider('fvVariablePercent', 'fvVariablePercentValue', v => v.toFixed(1) + '%');

        // ── Chain Multi-Select Trigger ──
        document.getElementById('fcChainTrigger')?.addEventListener('click', () => {
            this._toggleDropdown('fcChainTrigger', 'fcChainDropdown');
        });

        // ── Chain Search Filter ──
        document.getElementById('fcChainSearch')?.addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const filtered = this.chainsData.filter(c =>
                c.chain.toLowerCase().includes(q) ||
                (c.chain_name || '').toLowerCase().includes(q)
            );
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
            // Filter by code or store name
            const filtered = allRests.filter(r => {
                const code = typeof r === 'string' ? r : r.code;
                const name = typeof r === 'string' ? '' : (r.name || '');
                return code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
            });
            this._renderRestOptions(filtered);
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
                    // Save method-specific params onto the item
                    const params = this.getMethodParams();
                    if (this.currentMethod === 'historical') {
                        this.selectedItem.growth_rate = params.growth_rate;
                        this.selectedItem.lookback = params.lookback;
                    } else if (this.currentMethod === 'fixed') {
                        const fixedVal = Utils.parseCurrency(document.getElementById('fixedAmount')?.value || '0');
                        this.selectedItem.base = fixedVal;
                    } else if (this.currentMethod === 'fixed_variable') {
                        const fixedVal = Utils.parseCurrency(document.getElementById('fvFixedAmount')?.value || '0');
                        const varPercent = parseFloat(document.getElementById('fvVariablePercent')?.value || '0');
                        this.selectedItem.base = fixedVal;
                        this.selectedItem.variable_percent = varPercent;
                    } else if (this.currentMethod === 'anchor') {
                        this.selectedItem.multiplier = params.multiplier;
                        this.selectedItem.buffer = params.buffer;
                        this.selectedItem.anchor_period = params.anchor_period;
                    } else if (this.currentMethod === 'percent_revenue') {
                        this.selectedItem.base_period = params.base_period;
                        this.selectedItem.revenue_growth = params.revenue_growth;
                    } else if (this.currentMethod === 'rolling4w') {
                        this.selectedItem.rolling4w_adjustment = params.rolling4w_adjustment;
                    }
                    this.renderLineItems(document.getElementById('forecastSearch')?.value || '');
                }
            });
        }

        // Save all formulas to server (admin only)
        const saveFormulasBtn = document.getElementById('btnSaveFormulas');
        if (saveFormulasBtn) {
            saveFormulasBtn.addEventListener('click', () => this.saveAllFormulas());
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
