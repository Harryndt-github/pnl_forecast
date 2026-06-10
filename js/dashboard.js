/* ═══════════════════════════════════════════════════════════════
   PNL FORECAST — Module 1: PnL Performance Dashboard
   Code-based hierarchy: 4-char=Parent, 6-char=L2, 8-char=L3
   ═══════════════════════════════════════════════════════════════ */

const Dashboard = {
    // ─── Multi-Select State ───
    selectedChains: [],
    selectedRestaurants: [],
    allChainsData: [], // [{ chain, restaurants, count }]
    collapsedGroups: new Set(), // Codes of collapsed parent rows
    charts: {},

    init() {
        this.renderTable();
        this.initCharts();
        this.bindEvents();
        this.loadChainsForDashboard(); // Load chain data to populate multi-select
    },

    // ─── Load chains data from API ───
    async loadChainsForDashboard() {
        // 1. Fetch chains independently and populate dropdown immediately
        fetch('/api/chains')
            .then(r => r.json())
            .then(chainsResp => {
                if (chainsResp.status === 'ok' && chainsResp.chains) {
                    this.allChainsData = chainsResp.chains;
                    this._renderDbChainOptions(chainsResp.chains);
                } else {
                    const el = document.getElementById('dbChainOptions');
                    if (el) el.innerHTML = '<div class="fc-ms-empty">Không nạp được danh sách chuỗi</div>';
                }
            })
            .catch(e => {
                console.warn('[Dashboard] Could not load chains:', e.message);
                const el = document.getElementById('dbChainOptions');
                if (el) el.innerHTML = '<div class="fc-ms-empty">Không nạp được danh sách chuỗi</div>';
            });

        // 2. Load datekeys and refresh data independently
        try {
            await this._loadDatekeys();
            await this.refreshData();
        } catch (e) {
            console.warn('[Dashboard] Summary data refresh failed:', e.message);
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
        opts.innerHTML = data.map(c => {
            const displayName = c.chain_name && c.chain_name !== c.chain ? c.chain_name : c.chain;
            return `
            <div class="fc-ms-option ${this.selectedChains.includes(c.chain) ? 'selected' : ''}" data-value="${c.chain}">
                <span class="fc-ms-check">✓</span>
                <span class="fc-ms-label">${displayName} <em>(${c.count} NH)</em></span>
            </div>`;
        }).join('');
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
            tags.innerHTML = this.selectedChains.map(c => {
                const chainData = this.allChainsData.find(d => d.chain === c);
                const label = (chainData && chainData.chain_name && chainData.chain_name !== c)
                    ? chainData.chain_name : c;
                return `<span class="fc-tag">${label}<button class="fc-tag-rm" data-chain="${c}">×</button></span>`;
            }).join('');
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
        optsEl.innerHTML = rests.map(r => {
            const code   = typeof r === 'string' ? r : r.code;
            const name   = typeof r === 'string' ? '' : (r.name && r.name !== code ? r.name : '');
            const region = typeof r === 'string' ? '' : (r.region || '');
            const label  = name ? `${code} - ${name}${region ? ' <span class="rest-region">('+region+')</span>' : ''}` : code;
            return `
            <div class="fc-ms-option ${this.selectedRestaurants.includes(code) ? 'selected' : ''}" data-value="${code}">
                <span class="fc-ms-check">✓</span>
                <span class="fc-ms-label">${label}</span>
            </div>`;
        }).join('');
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
        if (this.selectedChains.length > 0) {
            const names = this.selectedChains.map(c => {
                const d = this.allChainsData.find(x => x.chain === c);
                return (d && d.chain_name && d.chain_name !== c) ? d.chain_name : c;
            });
            return `Chuỗi: ${names.join(', ')}`;
        }
        return 'Tất cả đơn vị';
    },


    // ── Determine hierarchy level from code length ──
    getCodeLevel(code) {
        if (!code) return 0;
        const len = code.trim().length;
        if (len <= 2)  return 0; // KPI root: TC, TA
        if (len === 4) return 1; // L1: DT01, SD01, CP01
        if (len === 6) return 2; // L2: CP0201, DT0101
        if (len >= 8)  return 3; // L3+: CP010101, CP020201
        return 1;
    },

    // ── Check if a parent code has children in data ──
    hasChildren(data, index) {
        const code = data[index].code;
        for (let i = index + 1; i < data.length; i++) {
            const next = data[i];
            if (next.isSubtotal || next.isFormula) break;
            if (next.code.startsWith(code) && next.code.length > code.length) return true;
            // Stop if next sibling has shorter/same level and doesn't share prefix
            if (!next.code.startsWith(code.slice(0, 2))) break;
        }
        return false;
    },

    // ── Check if variance should be inverted (cost = inverted) ──
    isInvertedVariance(item) {
        const code = item.code;
        if (code.startsWith('CP')) return true;
        if (code === 'DT02') return true;
        return false;
    },


    // ── Find the nearest parent code for a child item ──
    _findParentCode(code, index) {
        // Walk backwards in PNL_DATA to find the closest ancestor that has children
        for (let i = index - 1; i >= 0; i--) {
            const prev = PNL_DATA[i];
            if (prev.isSubtotal || prev.isFormula) continue;
            if (code.startsWith(prev.code) && code.length > prev.code.length) {
                return prev.code;
            }
        }
        return null;
    },

    // ── Check if a row should be hidden (any ancestor is collapsed) ──
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

    // ── Render PnL Table ──
    renderTable() {
        const tbody = document.getElementById('pnlTableBody');
        if (!tbody) return;

        tbody.innerHTML = PNL_DATA.map((item, index) => {
            const level      = this.getCodeLevel(item.code);
            const isFormula  = !!item.isFormula;
            const isSubtotal = !!item.isSubtotal;
            const isParent   = !isFormula && !isSubtotal && this.hasChildren(PNL_DATA, index);
            const parentCode = this._findParentCode(item.code, index);
            const isHidden   = !isFormula && !isSubtotal && this._isRowHidden(item.code, index);
            const isCollapsed = this.collapsedGroups.has(item.code);

            // Row CSS class
            let rowClass = '';
            if (isFormula || isSubtotal) rowClass = 'row-formula';
            else if (level === 0)        rowClass = 'row-kpi';
            else if (isParent)           rowClass = 'row-parent';

            if (isHidden) rowClass += ' row-collapsed-child';

            // Indent class by level
            const indentClass = level > 0 ? `indent-${Math.min(level, 3)}` : '';

            // Toggle arrow for parent rows
            const toggleIcon = isParent
                ? `<span class="collapse-toggle ${isCollapsed ? 'collapsed' : ''}" data-toggle-code="${item.code}" title="${isCollapsed ? 'Mở rộng' : 'Thu gọn'}"></span>`
                : '';

            // Values
            const actual   = item.actual;
            const forecast = item.forecast;
            const prior    = item.prior;
            const variance = Utils.variance(actual, forecast);
            const varPct   = Utils.variancePct(actual, forecast);
            const yoy      = Utils.yoyPct(actual, prior);

            const invert    = this.isInvertedVariance(item);
            const varClass  = Utils.varianceClass(variance, invert);
            const varPctClass = Utils.varianceClass(varPct, invert);
            const yoyClass  = Utils.varianceClass(yoy, invert);

            // Code badge
            const codeBadge = (isFormula || isSubtotal)
                ? `<span class="code-formula" title="${item.formulaDesc || ''}">${item.code}</span>`
                : `<span class="code-tag code-level-${level}">${item.code}</span>`;

            return `<tr class="${rowClass}" ${parentCode ? `data-parent-code="${parentCode}"` : ''} data-row-code="${item.code}">
                <td class="col-code">${codeBadge}</td>
                <td class="col-item ${indentClass}">${toggleIcon}${item.label}</td>
                <td>${Utils.currency(actual)}</td>
                <td class="forecast-cell">${Utils.currency(forecast)}</td>
                <td class="${varClass}">${Utils.currency(variance)}</td>
                <td class="${varPctClass}">${Utils.percent(varPct)}</td>
                <td>${Utils.currency(prior)}</td>
                <td class="${yoyClass}">${Utils.percent(yoy)}</td>
            </tr>`;
        }).join('');

        this._bindCollapseEvents();
    },

    // ── Bind collapse/expand events ──
    _bindCollapseEvents() {
        document.querySelectorAll('#pnlTableBody .collapse-toggle').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const code = el.dataset.toggleCode;
                if (this.collapsedGroups.has(code)) {
                    this.collapsedGroups.delete(code);
                } else {
                    this.collapsedGroups.add(code);
                }
                this.renderTable();
            });
        });
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

        // Build filter params: prefer explicit restaurants → then chain codes → else no filter (all)
        const params = [];
        if (datekey) params.push(`datekey=${datekey}`);

        if (this.selectedRestaurants.length > 0) {
            // Explicit restaurant selection → filter by pc codes
            params.push(`pc=${this.selectedRestaurants.join(',')}`);
        } else if (this.selectedChains.length > 0) {
            // Chain-level filter → send chain prefixes, backend uses LEFT(pc,4) IN (...)
            params.push(`chain=${this.selectedChains.join(',')}`);
        }
        // else: no filter → API returns aggregate of all restaurants

        // Update filter description label
        const desc = document.getElementById('dbFilterDesc');
        if (desc) desc.textContent = this._buildFilterDesc();

        Utils.toast('Đang tải dữ liệu...', 'info');

        try {
            // ── Bust server cache so we always get fresh data ──
            let url = `/api/actual/summary`;
            if (params.length) url += '?' + params.join('&');

            const resp = await fetch(url);
            const json = await resp.json();

            if (json.status === 'ok' && json.data) {
                // ── Fetch saved forecast for comparison ──
                let forecastData = {};
                try {
                    const fcParams = [];
                    if (json.datekey) fcParams.push(`datekey=${json.datekey}`);
                    if (this.selectedRestaurants.length > 0) {
                        fcParams.push(`pc=${this.selectedRestaurants.join(',')}`);
                    } else if (this.selectedChains.length > 0) {
                        fcParams.push(`chain=${this.selectedChains.join(',')}`);
                    }
                    fcParams.push('latest=1');
                    fcParams.push(`_=${Date.now()}`);

                    const fcResp = await fetch(`/api/forecast/reports?${fcParams.join('&')}`, { cache: 'no-store' });
                    const fcJson = await fcResp.json();

                    let fcLoadedDesc = " · ⚠️ Chưa có dữ liệu dự báo";
                    if (fcJson.status === 'ok' && fcJson.reports && fcJson.reports.length > 0) {
                        const report = fcJson.reports[0];
                        const targetDk = json.datekey;
                        // Find projection row matching this datekey
                        const projRow = report.projections.find(p => parseInt(p.datekey) === targetDk);
                        if (projRow) {
                            forecastData = projRow;
                            fcLoadedDesc = ` · 📈 Dự báo: Bản lưu ngày ${report.savedAt}`;
                            console.log(`[Dashboard] Loaded forecast from report #${report.id} (${report.savedAt})`);
                        } else {
                            console.log('[Dashboard] Saved report found but no matching datekey:', targetDk);
                        }
                    } else {
                        Utils.toast('Không tìm thấy bản báo cáo dự báo đã lưu cho bộ lọc này.', 'warning');
                    }
                    if (desc) {
                        desc.textContent = this._buildFilterDesc() + fcLoadedDesc;
                    }
                } catch(e) {
                    console.warn('[Dashboard] Could not load saved forecast:', e.message);
                }

                this.updatePnLData(json.data, json.prior_data || {}, forecastData);
                this.renderTable();
                this.updateKPIs(json.data);
                this.renderVarianceAnalysis(json.data, forecastData);

                const period = json.datekey
                    ? `Tháng ${String(json.datekey).slice(4)}/${String(json.datekey).slice(0, 4)}`
                    : 'kỳ mới nhất';
                const priorDk = json.prior_datekey;
                const priorLabel = priorDk
                    ? ` · Kỳ trước: T${String(priorDk).slice(4)}/${String(priorDk).slice(0, 4)}`
                    : '';
                const fcLabel = Object.keys(forecastData).length > 1 ? ' · 📊 Forecast loaded' : '';
                Utils.toast(`✅ Đã cập nhật số liệu — ${period}${priorLabel}${fcLabel}`, 'success');
            } else {
                Utils.toast(json.message || 'Không có dữ liệu', 'error');
            }
        } catch (e) {
            console.error('[Dashboard] refreshData failed:', e);
            Utils.toast('Lỗi kết nối server', 'error');
        }
    },



    updatePnLData(serverData, priorData = {}, forecastData = {}) {
        const hasForecast = Object.keys(forecastData).length > 1;

        // ── Step 1: Map DB values directly to all PNL_DATA items ──
        PNL_DATA.forEach(item => {
            if (!item.isFormula) {
                item.actual = serverData[item.code] || 0;
                item.prior  = priorData[item.code]  || 0;
                item.forecast = hasForecast ? (forecastData[item.code] || 0) : 0;
            }
        });

        // ── Step 2: For parent rows with 0 value, sum children from DB ──
        PNL_DATA.forEach(item => {
            if (item.isFormula || item.isSubtotal) return;
            if (item.actual === 0) {
                let total = 0;
                Object.keys(serverData).forEach(dbCode => {
                    if (dbCode !== item.code && dbCode.startsWith(item.code) &&
                        !dbCode.endsWith('PT') && !dbCode.endsWith('PMS')) {
                        total += serverData[dbCode] || 0;
                    }
                });
                if (total !== 0) item.actual = total;
            }
            // Same for prior
            if (item.prior === 0 && Object.keys(priorData).length > 0) {
                let priorTotal = 0;
                Object.keys(priorData).forEach(dbCode => {
                    if (dbCode !== item.code && dbCode.startsWith(item.code) &&
                        !dbCode.endsWith('PT') && !dbCode.endsWith('PMS')) {
                        priorTotal += priorData[dbCode] || 0;
                    }
                });
                if (priorTotal !== 0) item.prior = priorTotal;
            }
            // Same for forecast
            if (hasForecast && item.forecast === 0) {
                let fcTotal = 0;
                Object.keys(forecastData).forEach(dbCode => {
                    if (dbCode !== item.code && dbCode !== 'datekey' && dbCode.startsWith(item.code)) {
                        fcTotal += forecastData[dbCode] || 0;
                    }
                });
                if (fcTotal !== 0) item.forecast = fcTotal;
            }
        });

        // ── Step 3: Compute TA client-side (only formula item) ──
        PNL_DATA.forEach(item => {
            if (!item.isFormula) return;
            if (item.code === 'TA') {
                const tc   = serverData['TC'] || 0;
                const dt01 = serverData['DT01'] || 0;
                item.actual = tc > 0 ? Math.round(dt01 / tc) : 0;
                // TA prior
                const tcPrior   = priorData['TC'] || 0;
                const dt01Prior = priorData['DT01'] || 0;
                item.prior = tcPrior > 0 ? Math.round(dt01Prior / tcPrior) : 0;
                // TA forecast
                if (hasForecast) {
                    const tcFc   = forecastData['TC'] || 0;
                    const dt01Fc = forecastData['DT01'] || 0;
                    item.forecast = tcFc > 0 ? Math.round(dt01Fc / tcFc) : 0;
                } else {
                    item.forecast = 0;
                }
            }
        });
    },


    // ═══════════════════════════════════════════════════════════
    // VARIANCE ANALYSIS — Auto-generate insights
    // ═══════════════════════════════════════════════════════════
    renderVarianceAnalysis(actualData, forecastData) {
        const panel = document.getElementById('varianceAnalysisPanel');
        if (!panel) return;

        const hasForecast = forecastData && Object.keys(forecastData).length > 1;
        if (!hasForecast) {
            panel.style.display = 'none';
            return;
        }
        panel.style.display = '';

        const insights = [];
        const attentionPoints = [];

        // Analyze key line items
        const keyItems = [
            { code: 'DT01', label: 'Doanh thu bán hàng', category: 'revenue' },
            { code: 'CP01', label: 'Giá vốn (COGS)', category: 'cost' },
            { code: 'CP0201', label: 'Chi phí nhân sự', category: 'cost' },
            { code: 'CP0202', label: 'Chi phí tiện ích', category: 'cost' },
            { code: 'CP0207', label: 'Chi phí Marketing', category: 'cost' },
            { code: 'CP0209', label: 'Chi phí thuê mặt bằng', category: 'cost' },
            { code: 'SD02', label: 'Lợi nhuận gộp', category: 'profit' },
            { code: 'SD10', label: 'EBITDA', category: 'profit' },
            { code: 'SD09', label: 'Lợi nhuận sau thuế', category: 'profit' },
            { code: 'TC', label: 'Số lượt khách', category: 'volume' },
        ];

        keyItems.forEach(ki => {
            const pnlItem = PNL_DATA.find(p => p.code === ki.code);
            if (!pnlItem) return;

            const actual = pnlItem.actual || 0;
            const forecast = pnlItem.forecast || 0;
            if (forecast === 0) return; // Skip if no forecast

            const variance = actual - forecast;
            const varPct = Math.abs(forecast) > 0 ? (variance / Math.abs(forecast)) * 100 : 0;
            const absVariance = Math.abs(variance);
            const absVarPct = Math.abs(varPct);

            // Determine severity
            let severity = 'normal';
            if (absVarPct > 20 || absVariance > 500000000) severity = 'critical';
            else if (absVarPct > 10 || absVariance > 200000000) severity = 'warning';

            if (severity === 'normal') return; // Skip normal items

            // Generate insight text
            const direction = variance > 0 ? 'cao hơn' : 'thấp hơn';
            const isCost = ki.category === 'cost';
            const isPositive = isCost ? variance < 0 : variance > 0; // For costs, less = good

            let explanation = '';
            let recommendation = '';

            if (ki.code === 'DT01') {
                if (variance < 0) {
                    explanation = `Doanh thu thực tế ${direction} dự báo ${absVarPct.toFixed(1)}%. Có thể do lưu lượng khách giảm, chương trình khuyến mãi chưa hiệu quả, hoặc đối thủ cạnh tranh tăng.`;
                    recommendation = 'Xem xét điều chỉnh chiến lược marketing và chương trình khuyến mãi.';
                } else {
                    explanation = `Doanh thu vượt dự báo ${absVarPct.toFixed(1)}%. Cho thấy nhu cầu thị trường mạnh hơn kỳ vọng.`;
                    recommendation = 'Cân nhắc nâng mục tiêu forecast cho các kỳ tiếp theo.';
                }
            } else if (ki.code === 'CP01') {
                if (variance > 0) {
                    explanation = `Giá vốn vượt dự báo ${absVarPct.toFixed(1)}%. Kiểm tra biến động giá NVL, tỷ lệ hao hụt, hoặc thay đổi menu.`;
                    recommendation = 'Review hợp đồng nhà cung cấp và kiểm soát hao hụt NVL.';
                } else {
                    explanation = `Giá vốn thấp hơn dự báo ${absVarPct.toFixed(1)}%. Có thể do tối ưu mua sắm hoặc giảm giá NVL.`;
                    recommendation = 'Duy trì các biện pháp kiểm soát chi phí hiệu quả.';
                }
            } else if (ki.code === 'CP0201') {
                if (variance > 0) {
                    explanation = `Chi phí nhân sự vượt ${absVarPct.toFixed(1)}% so với dự báo. Kiểm tra tuyển dụng mới, OT bất thường, hoặc tăng lương.`;
                    recommendation = 'Rà soát cơ cấu nhân sự và lịch OT tại các cửa hàng.';
                } else {
                    explanation = `Chi phí nhân sự tiết kiệm ${absVarPct.toFixed(1)}% so với dự báo.`;
                    recommendation = 'Đảm bảo chất lượng dịch vụ không bị ảnh hưởng bởi tiết kiệm nhân sự.';
                }
            } else if (ki.code === 'SD10' || ki.code === 'SD09') {
                const marginActual = actualData['DT01'] ? (actual / actualData['DT01'] * 100).toFixed(1) : '—';
                const marginFc = forecastData['DT01'] ? (forecast / forecastData['DT01'] * 100).toFixed(1) : '—';
                explanation = `${ki.label} ${direction} dự báo ${absVarPct.toFixed(1)}%. Biên thực tế: ${marginActual}% vs dự báo: ${marginFc}%.`;
                recommendation = variance < 0 ? 'Cần review chi tiết các khoản chi phí lớn nhất.' : 'Hiệu quả hoạt động tốt hơn kỳ vọng.';
            } else if (ki.code === 'TC') {
                explanation = `Lượt khách ${direction} dự báo ${absVarPct.toFixed(1)}%. ${variance < 0 ? 'Có thể do thời tiết, sự kiện, hoặc xu hướng thị trường.' : 'Nhu cầu thực tế cao hơn kỳ vọng.'}`;
                recommendation = variance < 0 ? 'Tăng cường hoạt động thu hút khách: ưu đãi, quảng cáo.' : 'Đảm bảo năng lực phục vụ đáp ứng nhu cầu tăng.';
            } else {
                explanation = `${ki.label} ${direction} dự báo ${absVarPct.toFixed(1)}%.`;
                recommendation = isCost && variance > 0 ? 'Kiểm tra chi tiết và tìm cách tối ưu.' : '';
            }

            const severityIcon = severity === 'critical' ? '🔴' : '🟡';
            const severityLabel = severity === 'critical' ? 'Nghiêm trọng' : 'Cần chú ý';

            insights.push({
                code: ki.code,
                label: ki.label,
                severity,
                severityIcon,
                severityLabel,
                actual,
                forecast,
                variance,
                varPct,
                isPositive,
                explanation,
                recommendation
            });

            // Top attention points
            if (severity === 'critical') {
                attentionPoints.push(`⚠️ ${ki.label}: lệch ${varPct > 0 ? '+' : ''}${varPct.toFixed(1)}% (${Utils.currency(variance)})`);
            }
        });

        // Cost ratio analysis
        const revActual = actualData['DT01'] || 0;
        const revFc = forecastData['DT01'] || 0;
        if (revActual > 0 && revFc > 0) {
            const cogsRatioActual = ((actualData['CP01'] || 0) / revActual * 100).toFixed(1);
            const cogsRatioFc = ((forecastData['CP01'] || 0) / revFc * 100).toFixed(1);
            const colRatioActual = ((actualData['CP0201'] || 0) / revActual * 100).toFixed(1);
            const colRatioFc = ((forecastData['CP0201'] || 0) / revFc * 100).toFixed(1);

            if (Math.abs(cogsRatioActual - cogsRatioFc) > 2) {
                attentionPoints.push(`📊 Tỷ lệ COGS/DT: Thực tế ${cogsRatioActual}% vs Dự báo ${cogsRatioFc}%`);
            }
            if (Math.abs(colRatioActual - colRatioFc) > 2) {
                attentionPoints.push(`📊 Tỷ lệ COL/DT: Thực tế ${colRatioActual}% vs Dự báo ${colRatioFc}%`);
            }
        }

        // Sort by severity (critical first) then by absVarPct
        insights.sort((a, b) => {
            if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
            return Math.abs(b.varPct) - Math.abs(a.varPct);
        });

        // Render
        const cardsHtml = insights.length === 0
            ? `<div class="va-empty">✅ Tất cả chỉ tiêu đều trong ngưỡng bình thường so với dự báo.</div>`
            : insights.map(i => `
                <div class="va-card va-${i.severity}">
                    <div class="va-card-header">
                        <span class="va-severity">${i.severityIcon} ${i.severityLabel}</span>
                        <span class="va-code">${i.code}</span>
                    </div>
                    <div class="va-card-title">${i.label}</div>
                    <div class="va-card-metrics">
                        <div class="va-metric">
                            <span class="va-metric-label">Thực tế</span>
                            <span class="va-metric-value">${Utils.currency(i.actual)}</span>
                        </div>
                        <div class="va-metric">
                            <span class="va-metric-label">Dự báo</span>
                            <span class="va-metric-value">${Utils.currency(i.forecast)}</span>
                        </div>
                        <div class="va-metric">
                            <span class="va-metric-label">Chênh lệch</span>
                            <span class="va-metric-value ${i.isPositive ? 'val-positive' : 'val-negative'}">
                                ${i.varPct > 0 ? '+' : ''}${i.varPct.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                    <div class="va-explanation">${i.explanation}</div>
                    ${i.recommendation ? `<div class="va-recommendation">💡 ${i.recommendation}</div>` : ''}
                </div>
            `).join('');

        const attentionHtml = attentionPoints.length > 0 ? `
            <div class="va-attention-box">
                <div class="va-attention-title">📋 Điểm chú ý cho người đọc báo cáo</div>
                <ul class="va-attention-list">
                    ${attentionPoints.map(p => `<li>${p}</li>`).join('')}
                </ul>
            </div>
        ` : '';

        const summaryCount = insights.filter(i => i.severity === 'critical').length;
        const warningCount = insights.filter(i => i.severity === 'warning').length;

        panel.innerHTML = `
            <div class="va-header">
                <div class="va-header-left">
                    <h3 class="va-title">🔍 Phân Tích Chênh Lệch Actual vs Forecast</h3>
                    <span class="va-subtitle">
                        ${summaryCount > 0 ? `<span class="va-badge va-badge-critical">${summaryCount} nghiêm trọng</span>` : ''}
                        ${warningCount > 0 ? `<span class="va-badge va-badge-warning">${warningCount} cần chú ý</span>` : ''}
                        ${summaryCount === 0 && warningCount === 0 ? '<span class="va-badge va-badge-ok">Tất cả bình thường</span>' : ''}
                    </span>
                </div>
            </div>
            ${attentionHtml}
            <div class="va-cards-grid">
                ${cardsHtml}
            </div>
        `;
    },



    updateKPIs(data) {
        // SD10 = EBITDA | SD11 = Net Income | SD04 = Lãi/Lỗ NH sau khấu hao
        const revenue = data['DT01'] || 0;
        const cogs    = data['CP01'] || 0;
        const ebitda  = data['SD10'] || 0;
        const lnst    = data['SD11'] || data['SD09'] || 0;

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
            // Filter: search by code or name
            const filtered = rests.filter(r => {
                const code = typeof r === 'string' ? r : r.code;
                const name = typeof r === 'string' ? '' : (r.name || '');
                return code.toLowerCase().includes(q) || name.toLowerCase().includes(q);
            });
            this._renderDbRestOptions(filtered);
        });
        document.getElementById('dbRestClearAll')?.addEventListener('click', () => {
            this.selectedRestaurants = [];
            this._updateDbRestUI();
        });

        // Refresh button
        document.getElementById('btnDashRefresh')?.addEventListener('click', () => this.refreshData());

        // Export PDF button
        document.getElementById('btnExportPnLPDF')?.addEventListener('click', () => this.exportPnLToPDF());

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

    // ═══════════════════════════════════════════════════════════
    // EXPORT PnL TO PDF
    // ═══════════════════════════════════════════════════════════
    async exportPnLToPDF() {
        // Detect jsPDF library (UMD exposes window.jspdf)
        const jspdfNs = window.jspdf || window.jsPDF;
        if (!jspdfNs) {
            Utils.toast('Thư viện PDF chưa sẵn sàng. Vui lòng thử lại.', 'error');
            return;
        }
        const jsPDFConstructor = jspdfNs.jsPDF || jspdfNs;

        Utils.toast('Đang tạo PDF...', 'info');
        const doc = new jsPDFConstructor({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        let y = 15;

        // ── Vietnamese font helper ──
        const safeText = (t) => t ? t.replace(/[^\x00-\x7F]/g, c => {
            const map = {'ă':'a','â':'a','đ':'d','ê':'e','ô':'o','ơ':'o','ư':'u',
                'Ă':'A','Â':'A','Đ':'D','Ê':'E','Ô':'O','Ơ':'O','Ư':'U',
                'á':'a','à':'a','ả':'a','ã':'a','ạ':'a','ắ':'a','ằ':'a','ẳ':'a','ẵ':'a','ặ':'a',
                'ấ':'a','ầ':'a','ẩ':'a','ẫ':'a','ậ':'a','é':'e','è':'e','ẻ':'e','ẽ':'e','ẹ':'e',
                'ế':'e','ề':'e','ể':'e','ễ':'e','ệ':'e','í':'i','ì':'i','ỉ':'i','ĩ':'i','ị':'i',
                'ó':'o','ò':'o','ỏ':'o','õ':'o','ọ':'o','ố':'o','ồ':'o','ổ':'o','ỗ':'o','ộ':'o',
                'ớ':'o','ờ':'o','ở':'o','ỡ':'o','ợ':'o','ú':'u','ù':'u','ủ':'u','ũ':'u','ụ':'u',
                'ứ':'u','ừ':'u','ử':'u','ữ':'u','ự':'u','ý':'y','ỳ':'y','ỷ':'y','ỹ':'y','ỵ':'y',
                'Á':'A','À':'A','Ả':'A','Ã':'A','Ạ':'A','Ắ':'A','Ằ':'A','Ẳ':'A','Ẵ':'A','Ặ':'A',
                'Ấ':'A','Ầ':'A','Ẩ':'A','Ẫ':'A','Ậ':'A','É':'E','È':'E','Ẻ':'E','Ẽ':'E','Ẹ':'E',
                'Ế':'E','Ề':'E','Ể':'E','Ễ':'E','Ệ':'E','Ó':'O','Ò':'O','Ỏ':'O','Õ':'O','Ọ':'O',
                'Ố':'O','Ồ':'O','Ổ':'O','Ỗ':'O','Ộ':'O','Ớ':'O','Ờ':'O','Ở':'O','Ỡ':'O','Ợ':'O',
                'Ú':'U','Ù':'U','Ủ':'U','Ũ':'U','Ụ':'U','Ứ':'U','Ừ':'U','Ử':'U','Ữ':'U','Ự':'U'};
            return map[c] || c;
        }) : '';

        const fmtNum = (v) => v != null ? Math.round(v).toLocaleString('en-US') : '-';
        const fmtPct = (v) => v != null ? (v > 0 ? '+' : '') + v.toFixed(1) + '%' : '-';

        // ── Load formula configs ──
        let formulaConfigs = {};
        try {
            const r = await fetch('/api/forecast/formulas');
            const j = await r.json();
            if (j.status === 'ok') formulaConfigs = j.formulas || {};
        } catch(e) {}

        const methodLabels = {
            'historical': 'Historical Growth', 'fixed': 'Fixed Value',
            'anchor': 'Base Anchor', 'percent_revenue': '% / Doanh thu',
            'rolling4w': '4 Tuan gan nhat'
        };

        // ── HEADER ──
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageW, 28, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(16); doc.setFont('helvetica', 'bold');
        doc.text('BAO CAO LAI & LO (P&L) — PnL Forecast System', 14, 12);
        doc.setFontSize(9); doc.setFont('helvetica', 'normal');
        const filterDesc = safeText(this._buildFilterDesc());
        const dk = document.getElementById('dbDatekeySelect')?.value;
        const periodStr = dk ? `T${String(dk).slice(4)}/${String(dk).slice(0,4)}` : 'Ky moi nhat';
        doc.text(`Bo loc: ${filterDesc}  |  Ky: ${periodStr}  |  Xuat: ${new Date().toLocaleString('vi-VN')}`, 14, 19);
        doc.setDrawColor(59, 130, 246); doc.setLineWidth(0.8);
        doc.line(0, 28, pageW, 28);
        y = 34;

        // ── PnL TABLE ──
        const tableRows = [];
        PNL_DATA.forEach(item => {
            const level = this.getCodeLevel(item.code);
            const isFormula = !!item.isFormula;
            const isSubtotal = !!item.isSubtotal;
            const indent = (isFormula || isSubtotal) ? '' : '  '.repeat(level);
            const label = indent + safeText(item.label);
            const actual = item.actual || 0;
            const forecast = item.forecast || 0;
            const variance = actual - forecast;
            const varPct = forecast !== 0 ? (variance / Math.abs(forecast)) * 100 : 0;
            const prior = item.prior || 0;
            const yoy = prior !== 0 ? ((actual - prior) / Math.abs(prior)) * 100 : 0;

            tableRows.push({
                code: item.code, label, actual: fmtNum(actual), forecast: fmtNum(forecast),
                variance: fmtNum(variance), varPct: fmtPct(varPct),
                prior: fmtNum(prior), yoy: fmtPct(yoy),
                _isFormula: isFormula || isSubtotal, _varPctRaw: varPct
            });
        });

        doc.autoTable({
            startY: y,
            head: [['Ma', safeText('Chi tieu'), safeText('Thuc te'), safeText('Du bao'),
                    safeText('Chenh lech'), 'CL %', safeText('Ky truoc'), 'YoY %']],
            body: tableRows.map(r => [r.code, r.label, r.actual, r.forecast,
                r.variance, r.varPct, r.prior, r.yoy]),
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 2, font: 'helvetica', textColor: [30, 41, 59] },
            headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 7.5 },
            columnStyles: {
                0: { cellWidth: 18, fontStyle: 'bold', textColor: [59, 130, 246] },
                1: { cellWidth: 55 },
                2: { halign: 'right', cellWidth: 28 }, 3: { halign: 'right', cellWidth: 28 },
                4: { halign: 'right', cellWidth: 28 }, 5: { halign: 'right', cellWidth: 20 },
                6: { halign: 'right', cellWidth: 28 }, 7: { halign: 'right', cellWidth: 20 }
            },
            didParseCell: (data) => {
                if (data.section === 'body') {
                    const row = tableRows[data.row.index];
                    if (row._isFormula) {
                        data.cell.styles.fontStyle = 'bold';
                        data.cell.styles.fillColor = [241, 245, 249];
                    }
                    if (data.column.index === 4 || data.column.index === 5) {
                        const vp = row._varPctRaw;
                        if (Math.abs(vp) > 10) data.cell.styles.textColor = vp > 0 ? [16, 185, 129] : [239, 68, 68];
                    }
                }
            },
            margin: { left: 10, right: 10 }
        });

        y = doc.lastAutoTable.finalY + 8;

        // ── PAGE 2: FORMULA EXPLANATION ──
        doc.addPage('landscape');
        y = 15;
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageW, 22, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(13); doc.setFont('helvetica', 'bold');
        doc.text('GIAI THICH CONG THUC FORECAST', 14, 14);
        doc.setDrawColor(59, 130, 246); doc.line(0, 22, pageW, 22);
        y = 28;

        const formulaRows = [];
        const configuredItems = FORECAST_ITEMS.filter(i => {
            const pnl = PNL_DATA.find(p => p.code === i.code);
            return !(pnl && (pnl.isSubtotal || pnl.isFormula));
        });

        configuredItems.forEach(item => {
            const cfg = formulaConfigs[item.code];
            let method = '-', detail = 'Chua cau hinh';
            if (cfg) {
                method = methodLabels[cfg.method] || cfg.method;
                if (cfg.method === 'historical') {
                    detail = `Tang truong ${cfg.growth_rate || 5}%, lookback ${cfg.lookback || 3} ky`;
                } else if (cfg.method === 'fixed') {
                    detail = `Gia tri co dinh: ${fmtNum(cfg.fixed_value)}`;
                } else if (cfg.method === 'anchor') {
                    detail = `He so x${cfg.multiplier || 1.05}, buffer ${fmtNum(cfg.buffer || 0)}`;
                } else if (cfg.method === 'percent_revenue') {
                    detail = `Ty le / DT, tang truong DT ${cfg.revenue_growth || 5}%`;
                } else if (cfg.method === 'rolling4w') {
                    detail = `TB 4 tuan, dieu chinh ${cfg.rolling4w_adjustment || 0}%`;
                }
            } else if (item.configured && item.method) {
                method = methodLabels[item.method] || item.method;
                detail = 'Cau hinh trong session';
            }
            formulaRows.push([item.code, safeText(item.name), method, detail]);
        });

        doc.autoTable({
            startY: y,
            head: [['Ma', safeText('Chi tieu'), safeText('Phuong phap'), safeText('Chi tiet cong thuc')]],
            body: formulaRows,
            theme: 'grid',
            styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [30, 41, 59] },
            headStyles: { fillColor: [99, 102, 241], textColor: [255, 255, 255], fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 22, fontStyle: 'bold', textColor: [99, 102, 241] },
                1: { cellWidth: 60 }, 2: { cellWidth: 40 }, 3: { cellWidth: 'auto' }
            },
            margin: { left: 10, right: 10 }
        });

        // ── PAGE 3: VARIANCE ANALYSIS ──
        doc.addPage('landscape');
        y = 15;
        doc.setFillColor(15, 23, 42);
        doc.rect(0, 0, pageW, 22, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(13); doc.setFont('helvetica', 'bold');
        doc.text('PHAN TICH CHENH LECH — ROOT CAUSE ANALYSIS', 14, 14);
        doc.setDrawColor(239, 68, 68); doc.line(0, 22, pageW, 22);
        y = 28;

        const keyItems = [
            { code: 'DT01', label: 'Doanh thu ban hang', cat: 'revenue' },
            { code: 'CP01', label: 'Gia von (COGS)', cat: 'cost' },
            { code: 'CP0201', label: 'Chi phi nhan su', cat: 'cost' },
            { code: 'CP0202', label: 'Chi phi tien ich', cat: 'cost' },
            { code: 'CP0207', label: 'Chi phi Marketing', cat: 'cost' },
            { code: 'CP0209', label: 'Chi phi thue mat bang', cat: 'cost' },
            { code: 'SD02', label: 'Loi nhuan gop', cat: 'profit' },
            { code: 'SD10', label: 'EBITDA', cat: 'profit' },
            { code: 'SD09', label: 'Loi nhuan sau thue', cat: 'profit' },
            { code: 'TC', label: 'So luot khach', cat: 'volume' },
        ];

        const vaRows = [];
        keyItems.forEach(ki => {
            const pnl = PNL_DATA.find(p => p.code === ki.code);
            if (!pnl) return;
            const a = pnl.actual || 0, f = pnl.forecast || 0;
            if (f === 0) return;
            const v = a - f, vp = (v / Math.abs(f)) * 100;
            const absVp = Math.abs(vp), absV = Math.abs(v);
            let severity = 'Binh thuong';
            if (absVp > 20 || absV > 500000000) severity = 'NGHIEM TRONG';
            else if (absVp > 10 || absV > 200000000) severity = 'Can chu y';

            let cause = '';
            if (ki.code === 'DT01') cause = v < 0 ? 'Luong khach giam, KM chua hieu qua' : 'Nhu cau tang manh';
            else if (ki.code === 'CP01') cause = v > 0 ? 'Gia NVL tang, hao hut cao' : 'Toi uu mua sam';
            else if (ki.code === 'CP0201') cause = v > 0 ? 'Tuyen dung/OT bat thuong' : 'Tiet kiem nhan su';
            else if (ki.code === 'SD10' || ki.code === 'SD09') cause = v < 0 ? 'Chi phi vuot du bao' : 'Hieu qua tot hon ky vong';
            else if (ki.code === 'TC') cause = v < 0 ? 'Thoi tiet/su kien/thi truong' : 'Nhu cau thuc te cao';
            else cause = v > 0 && ki.cat === 'cost' ? 'Can kiem tra chi tiet' : '';

            vaRows.push([ki.code, ki.label, fmtNum(a), fmtNum(f), fmtNum(v),
                fmtPct(vp), severity, cause]);
        });

        doc.autoTable({
            startY: y,
            head: [['Ma', safeText('Chi tieu'), safeText('Thuc te'), safeText('Du bao'),
                    safeText('Chenh lech'), '%', safeText('Muc do'), safeText('Nguyen nhan / Khuyen nghi')]],
            body: vaRows,
            theme: 'grid',
            styles: { fontSize: 7.5, cellPadding: 2.5, textColor: [30, 41, 59] },
            headStyles: { fillColor: [239, 68, 68], textColor: [255, 255, 255], fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 16, fontStyle: 'bold' }, 1: { cellWidth: 42 },
                2: { halign: 'right', cellWidth: 26 }, 3: { halign: 'right', cellWidth: 26 },
                4: { halign: 'right', cellWidth: 26 }, 5: { halign: 'right', cellWidth: 18 },
                6: { cellWidth: 26 }, 7: { cellWidth: 'auto' }
            },
            didParseCell: (data) => {
                if (data.section === 'body' && data.column.index === 6) {
                    const val = data.cell.raw;
                    if (val === 'NGHIEM TRONG') {
                        data.cell.styles.textColor = [239, 68, 68];
                        data.cell.styles.fontStyle = 'bold';
                    } else if (val === 'Can chu y') {
                        data.cell.styles.textColor = [245, 158, 11];
                        data.cell.styles.fontStyle = 'bold';
                    }
                }
            },
            margin: { left: 10, right: 10 }
        });

        // ── Footer on all pages ──
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(7); doc.setTextColor(148, 163, 184);
            doc.text(`PnL Forecast System — Trang ${i}/${totalPages}`, 14, pageH - 6);
            doc.text('Generated by PnL Forecast v1.0', pageW - 60, pageH - 6);
        }

        // ── Save ──
        const filename = `PnL_Report_${periodStr.replace('/', '-')}_${new Date().toISOString().slice(0,10)}.pdf`;
        doc.save(filename);
        Utils.toast(`PDF da xuat: ${filename}`, 'success');
    },

    // ─── Destroy (cleanup) ───
    destroy() {
        Object.values(this.charts).forEach(chart => {
            if (chart) chart.destroy();
        });
        this.charts = {};
    }
};
