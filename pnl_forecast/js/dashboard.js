/* ═══════════════════════════════════════════════════════════════
   PNL FORECAST — Module 1: PnL Performance Dashboard
   Code-based hierarchy: 4-char=Parent, 6-char=L2, 8-char=L3
   ═══════════════════════════════════════════════════════════════ */

const Dashboard = {
    // ─── Multi-Select State ───
    selectedChains: [],
    selectedRestaurants: [],
    allChainsData: [], // [{ chain, restaurants, count }]

    init() {
        this.renderTable();
        this.initCharts();
        this.bindEvents();
        this.loadChainsForDashboard(); // Load chain data to populate multi-select
    },

    // ─── Load chains data from API ───
    async loadChainsForDashboard() {
        try {
            // Run both in parallel — don't wait for chains before fetching summary
            const [chainsResp, _] = await Promise.all([
                fetch('/api/chains').then(r => r.json()).catch(() => ({ status: 'error' })),
                this._loadDatekeys().then(() => this.refreshData())  // load summary after datekeys
            ]);

            if (chainsResp.status === 'ok' && chainsResp.chains) {
                this.allChainsData = chainsResp.chains;
                this._renderDbChainOptions(chainsResp.chains);
            } else {
                const el = document.getElementById('dbChainOptions');
                if (el) el.innerHTML = '<div class="fc-ms-empty">Không kết nối được DB</div>';
            }
        } catch (e) {
            console.warn('[Dashboard] Could not load chains:', e.message);
            const el = document.getElementById('dbChainOptions');
            if (el) el.innerHTML = '<div class="fc-ms-empty">Không kết nối được DB</div>';
        }
    },


    async _loadDatekeys() {
        try {
            const resp = await fetch('/api/actual/datekeys');
            const data = await resp.json();
            const sel = document.getElementById('dbDatekeySelect');
            if (!sel) return;
            if (data.status === 'ok' && data.datekeys?.length) {
                // Format: 202604 → T04/2026
                sel.innerHTML = '<option value="">-- Kỳ mới nhất --</option>' + data.datekeys.map(dk => {
                    const s = String(dk); // e.g. "202604"
                    const yr = s.slice(0, 4), mo = s.slice(4, 6);
                    return `<option value="${dk}">T${mo}/${yr}</option>`;
                }).join('');
            }
        } catch(e) {
            console.warn('[Dashboard] datekeys load failed:', e.message);
        }
    },

    // ─── Render chain options ───
    _renderDbChainOptions(data) {
        const opts = document.getElementById('dbChainOptions');
        if (!opts) return;
        if (!data.length) { opts.innerHTML = '<div class="fc-ms-empty">Không có dữ liệu</div>'; return; }
        opts.innerHTML = data.map(c => `
            <div class="fc-ms-option ${this.selectedChains.includes(c.chain) ? 'selected' : ''}" data-value="${c.chain}">
                <span class="fc-ms-check">✓</span>
                <span class="fc-ms-label">${c.chain} <em>(${c.count} NH)</em></span>
            </div>`).join('');
        opts.querySelectorAll('.fc-ms-option').forEach(el =>
            el.addEventListener('click', () => this._toggleDbChain(el.dataset.value))
        );
    },

    _toggleDbChain(chain) {
        const idx = this.selectedChains.indexOf(chain);
        if (idx === -1) this.selectedChains.push(chain);
        else this.selectedChains.splice(idx, 1);
        this._updateDbChainUI();
        this._refreshDbRestPool();
    },

    _updateDbChainUI() {
        const tags = document.getElementById('dbChainTags');
        const ph = document.getElementById('dbChainPlaceholder');
        const count = document.getElementById('dbChainCount');
        const opts = document.getElementById('dbChainOptions');
        if (!tags) return;
        if (this.selectedChains.length === 0) {
            tags.innerHTML = ''; ph.style.display = ''; count.classList.add('hidden');
        } else {
            ph.style.display = 'none';
            count.textContent = this.selectedChains.length;
            count.classList.remove('hidden');
            tags.innerHTML = this.selectedChains.map(c =>
                `<span class="fc-tag">${c}<button class="fc-tag-rm" data-chain="${c}">×</button></span>`
            ).join('');
            tags.querySelectorAll('.fc-tag-rm').forEach(btn =>
                btn.addEventListener('click', e => { e.stopPropagation(); this._toggleDbChain(btn.dataset.chain); })
            );
        }
        opts?.querySelectorAll('.fc-ms-option').forEach(el =>
            el.classList.toggle('selected', this.selectedChains.includes(el.dataset.value))
        );
    },

    _refreshDbRestPool() {
        const optsEl = document.getElementById('dbRestOptions');
        if (!optsEl) return;
        this.selectedRestaurants = [];
        this._updateDbRestUI();
        if (this.selectedChains.length === 0) {
            optsEl.innerHTML = '<div class="fc-ms-empty">Chọn chuỗi trước</div>'; return;
        }
        const rests = [];
        this.selectedChains.forEach(chain => {
            const c = this.allChainsData.find(d => d.chain === chain);
            if (c) rests.push(...c.restaurants);
        });
        this._renderDbRestOptions(rests);
    },

    _renderDbRestOptions(rests) {
        const optsEl = document.getElementById('dbRestOptions');
        if (!optsEl || !rests.length) {
            if (optsEl) optsEl.innerHTML = '<div class="fc-ms-empty">Không có nhà hàng</div>'; return;
        }
        optsEl.innerHTML = rests.map(r => `
            <div class="fc-ms-option ${this.selectedRestaurants.includes(r) ? 'selected' : ''}" data-value="${r}">
                <span class="fc-ms-check">✓</span>
                <span class="fc-ms-label">${r}</span>
            </div>`).join('');
        optsEl.querySelectorAll('.fc-ms-option').forEach(el =>
            el.addEventListener('click', () => this._toggleDbRest(el.dataset.value))
        );
    },

    _toggleDbRest(rest) {
        const idx = this.selectedRestaurants.indexOf(rest);
        if (idx === -1) this.selectedRestaurants.push(rest);
        else this.selectedRestaurants.splice(idx, 1);
        this._updateDbRestUI();
    },

    _updateDbRestUI() {
        const tags = document.getElementById('dbRestTags');
        const ph = document.getElementById('dbRestPlaceholder');
        const count = document.getElementById('dbRestCount');
        const optsEl = document.getElementById('dbRestOptions');
        if (!tags) return;
        if (this.selectedRestaurants.length === 0) {
            tags.innerHTML = ''; ph.style.display = ''; count.classList.add('hidden');
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
            tags.querySelectorAll('.fc-tag-rm').forEach(btn =>
                btn.addEventListener('click', e => { e.stopPropagation(); this._toggleDbRest(btn.dataset.rest); })
            );
        }
        optsEl?.querySelectorAll('.fc-ms-option').forEach(el =>
            el.classList.toggle('selected', this.selectedRestaurants.includes(el.dataset.value))
        );
    },

    _toggleDbDropdown(triggerId, dropdownId) {
        const drop = document.getElementById(dropdownId);
        if (!drop) return;
        const isHidden = drop.classList.contains('hidden');
        document.querySelectorAll('.fc-ms-dropdown').forEach(d => d.classList.add('hidden'));
        document.querySelectorAll('.fc-ms-trigger').forEach(t => t.classList.remove('open'));
        if (isHidden) {
            drop.classList.remove('hidden');
            document.getElementById(triggerId)?.classList.add('open');
        }
    },

    _buildFilterDesc() {
        if (this.selectedRestaurants.length > 0) return `${this.selectedRestaurants.length} nhà hàng được chọn`;
        if (this.selectedChains.length > 0) return `Chuỗi: ${this.selectedChains.join(', ')}`;
        return 'Tất cả đơn vị';
    },


    // ─── Determine hierarchy level from code length (2, 4, 6 chars) ───
    getCodeLevel(code) {
        if (!code) return 0;
        const len = code.trim().length;
        if (len === 2) return 0; // Root (e.g. TC)
        if (len === 4) return 1; // Level 1 (e.g. DT01, SD01)
        if (len === 6) return 2; // Level 2 (e.g. CP0201)
        return 0;
    },

    // ─── Check if a parent code has children in data ───
    hasChildren(data, index) {
        const code = data[index].code;
        if (index + 1 < data.length) {
            const next = data[index + 1];
            if (next.isFormula) return false;
            return next.code.startsWith(code) && next.code.length > code.length;
        }
        return false;
    },

    // ─── Check if variance should be inverted (cost/expense items) ───
    isInvertedVariance(item) {
        const code = item.code;
        // Costs, Expenses (CP) and Discount (DT02) have inverted variance
        if (code.startsWith('CP')) return true;
        if (code === 'DT02') return true; 
        return false; // Profits, Margins, and normal Revenue are NOT inverted
    },


    // ─── Render PnL Table ───
    renderTable() {
        const tbody = document.getElementById('pnlTableBody');
        if (!tbody) return;

        tbody.innerHTML = PNL_DATA.map((item, index) => {
            const level = this.getCodeLevel(item.code);
            const isParent = level === 0 && !item.isFormula && this.hasChildren(PNL_DATA, index);
            const isFormula = !!item.isFormula;
            const isStandalone = level === 0 && !item.isFormula && !isParent;

            // Row CSS class
            let rowClass = '';
            if (isFormula) rowClass = 'row-formula';
            else if (isParent) rowClass = 'row-parent';

            // Indent class
            let indentClass = '';
            if (level === 1) indentClass = 'indent-1';
            else if (level === 2) indentClass = 'indent-2';

            // Calculate variances
            const actual = item.actual;
            const forecast = item.forecast;
            const prior = item.prior;
            const variance = Utils.variance(actual, forecast);
            const varPct = Utils.variancePct(actual, forecast);
            const yoy = Utils.yoyPct(actual, prior);

            // Variance color logic
            const invert = this.isInvertedVariance(item);
            const varClass = Utils.varianceClass(variance, invert);
            const varPctClass = Utils.varianceClass(varPct, invert);
            const yoyClass = Utils.varianceClass(yoy, invert);

            // Code display
            const codeDisplay = item.isFormula 
                ? `<span class="code-formula" title="${item.formulaDesc || ''}">${item.code}</span>`
                : `<span class="code-tag code-level-${level}">${item.code}</span>`;

            return `<tr class="${rowClass}">
                <td class="col-code">${codeDisplay}</td>
                <td class="col-item ${indentClass}">${item.label}</td>
                <td>${Utils.currency(actual)}</td>
                <td class="forecast-cell">${Utils.currency(forecast)}</td>
                <td class="${varClass}">${Utils.currency(variance)}</td>
                <td class="${varPctClass}">${Utils.percent(varPct)}</td>
                <td>${Utils.currency(prior)}</td>
                <td class="${yoyClass}">${Utils.percent(yoy)}</td>
            </tr>`;
        }).join('');
    },

    // ─── Initialize Charts ───
    initCharts() {
        // Small delay for smooth loading
        setTimeout(() => {
            this.charts.volumeMargin = ChartConfig.volumeMargin('canvasVolumeMargin');
            this.charts.expense = ChartConfig.expenseBreakdown('canvasExpenseBreakdown');
            this.charts.trend = ChartConfig.trendLine('canvasTrend');
        }, 200);
    },

    // ─── Fetch and Refresh Data ───
    async refreshData() {
        const datekey = document.getElementById('dbDatekeySelect')?.value || '';
        const pcs = this.selectedRestaurants.length > 0
            ? this.selectedRestaurants
            : this.selectedChains.length > 0
                ? this.selectedChains.map(ch => this.allChainsData.find(d => d.chain === ch)?.restaurants || []).flat()
                : [];

        // Update filter description label
        const desc = document.getElementById('dbFilterDesc');
        if (desc) desc.textContent = this._buildFilterDesc();

        Utils.toast('Đang tải dữ liệu...', 'info');

        try {
            // ── Bust server cache so we always get fresh data ──
            await fetch('/api/cache/bust', { method: 'POST' }).catch(() => {});

            let url = `/api/actual/summary`;
            const params = [];
            if (datekey) params.push(`datekey=${datekey}`);
            if (pcs.length > 0) params.push(`pc=${pcs.join(',')}`);
            if (params.length) url += '?' + params.join('&');

            const resp = await fetch(url);
            const json = await resp.json();

            if (json.status === 'ok' && json.data) {
                this.updatePnLData(json.data);
                this.renderTable();
                this.updateKPIs(json.data);
                const period = json.datekey
                    ? `Tháng ${String(json.datekey).slice(4)}/${String(json.datekey).slice(0, 4)}`
                    : 'kỳ mới nhất';
                Utils.toast(`✅ Đã cập nhật số liệu — ${period}`, 'success');
            } else {
                Utils.toast(json.message || 'Không có dữ liệu', 'error');
            }
        } catch (e) {
            console.error('[Dashboard] refreshData failed:', e);
            Utils.toast('Lỗi kết nối server', 'error');
        }
    },



    updatePnLData(serverData) {
        // ── Step 1: Direct mapping from serverData ──
        PNL_DATA.forEach(item => {
            item.actual = serverData[item.code] || 0;
        });

        // ── Step 2: Parent subtotals via code-prefix rule (if no direct value) ──
        PNL_DATA.forEach(item => {
            if (item.isFormula) return;
            // If direct value is 0 and it has kids (2->4 or 4->6), sum them
            if (item.actual === 0) {
                let total = 0;
                Object.keys(serverData).forEach(dbCode => {
                    // Check if dbCode is a child (longer and starts with prefix)
                    if (dbCode !== item.code && dbCode.startsWith(item.code)) {
                        total += serverData[dbCode] || 0;
                    }
                });
                if (total !== 0) item.actual = total;
            }
        });

        // ── Step 3: Compute Cross-Indicator Formulas ──
        const v = code => {
            const row = PNL_DATA.find(i => i.code === code);
            return row ? row.actual : (serverData[code] || 0);
        };

        PNL_DATA.forEach(item => {
            if (!item.isFormula) return;
            switch (item.code) {
                case 'TA': // Average Revenue per Guest = DT01 / TC
                    const tc = v('TC');
                    item.actual = tc > 0 ? Math.round(v('DT01') / tc) : 0;
                    break;
                case 'SD01': // Net Revenue = Revenue - Discount
                    item.actual = v('DT01') - v('DT02');
                    break;
                case 'SD02': // Gross Profit = Net Revenue - COGS
                    item.actual = v('SD01') - v('CP01');
                    break;
                case 'SD03': // CM = Gross Profit - Sum(Operating Expenses)
                    let opex = 0;
                    PNL_DATA.forEach(i => {
                        if (i.code.startsWith('CP02')) opex += i.actual;
                    });
                    item.actual = v('SD02') - opex;
                    break;
                case 'SD09': // PAT = Use DB value or compute
                    if (!serverData['SD09']) {
                        item.actual = v('SD04') + v('DT03') - v('CP05') + v('DT04') - v('CP06') - v('CP07') - v('CP08');
                    }
                    break;
                default:
                    // If no specific logic, keep original mapped value
                    break;
            }
        });
    },



    updateKPIs(data) {
        // DB indicator codes from FC213_FACT_ACT:
        // DT01 = Doanh thu thuần  |  CP01 = Giá vốn
        // SD04 = EBITDA           |  SD11 = Lãi ròng (LNST)
        const revenue = data['DTT'] || data['DT01'] || 0;
        const cogs    = data['CP01'] || 0;
        const ebitda  = data['SD04'] || data['EBITDA'] || 0;
        const lnst    = data['SD11'] || data['LNST'] || 0;

        const animate = (id, val) => {
            const el = document.getElementById(id);
            if (el) Utils.animateValue(el, 0, val, 900);
        };

        animate('kpi-revenue-val', revenue);
        animate('kpi-cogs-val', cogs);
        animate('kpi-ebitda-val', ebitda);
        animate('kpi-netprofit-val', lnst);

        const sub = document.getElementById('kpi-revenue-sub');
        if (sub) sub.textContent = `Thực tế kỳ được chọn`;
        const cogsSub = document.getElementById('kpi-cogs-sub');
        if (cogsSub && revenue > 0) cogsSub.textContent = `${(cogs/revenue*100).toFixed(1)}% / Doanh thu`;
        const ebitdaSub = document.getElementById('kpi-ebitda-sub');
        if (ebitdaSub && revenue > 0) ebitdaSub.textContent = `${(ebitda/revenue*100).toFixed(1)}% Biên EBITDA`;
        const lnstSub = document.getElementById('kpi-netprofit-sub');
        if (lnstSub && revenue > 0) lnstSub.textContent = `${(lnst/revenue*100).toFixed(1)}% Biên lợi nhuận`;
    },


    // ─── Bind Events ───
    bindEvents() {
        // Dashboard chain multi-select
        document.getElementById('dbChainTrigger')?.addEventListener('click', () => {
            this._toggleDbDropdown('dbChainTrigger', 'dbChainDropdown');
        });
        document.getElementById('dbChainSearch')?.addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            this._renderDbChainOptions(this.allChainsData.filter(c => c.chain.toLowerCase().includes(q)));
        });
        document.getElementById('dbChainClearAll')?.addEventListener('click', () => {
            this.selectedChains = [];
            this._updateDbChainUI();
            this._refreshDbRestPool();
        });

        // Dashboard restaurant multi-select
        document.getElementById('dbRestTrigger')?.addEventListener('click', () => {
            this._toggleDbDropdown('dbRestTrigger', 'dbRestDropdown');
        });
        document.getElementById('dbRestSearch')?.addEventListener('input', e => {
            const q = e.target.value.toLowerCase();
            const rests = [];
            this.selectedChains.forEach(chain => {
                const c = this.allChainsData.find(d => d.chain === chain);
                if (c) rests.push(...c.restaurants);
            });
            this._renderDbRestOptions(rests.filter(r => r.toLowerCase().includes(q)));
        });
        document.getElementById('dbRestClearAll')?.addEventListener('click', () => {
            this.selectedRestaurants = [];
            this._updateDbRestUI();
        });

        // Refresh button
        document.getElementById('btnDashRefresh')?.addEventListener('click', () => this.refreshData());

        // Close dropdowns when clicking outside
        document.addEventListener('click', e => {
            if (!e.target.closest('.fc-multiselect')) {
                document.querySelectorAll('.fc-ms-dropdown').forEach(d => d.classList.add('hidden'));
                document.querySelectorAll('.fc-ms-trigger').forEach(t => t.classList.remove('open'));
            }
        });

        document.querySelectorAll('.period-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.refreshData();
            });
        });
    },

    // ─── Destroy (cleanup) ───
    destroy() {
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.charts = {};
    }
};

