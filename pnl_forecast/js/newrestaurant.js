/* ═══════════════════════════════════════════════════════════════
   PNL FORECAST — New Restaurant Registration & Data Import
   Manages new PC codes, CSV/XLSX import, and PnL consolidation
   ═══════════════════════════════════════════════════════════════ */

const NewRestaurant = {
    restaurants: [],       // Registered new restaurants
    importedData: {},      // { pc: { datekey: { lineItem: value } } }
    currentImportRows: [], // Temp preview rows

    init() {
        this.loadFromStorage();
        this.bindEvents();
        this.renderRegisteredList();
        this.updateImportTargetDropdown();
    },

    // ═══════════════════════════════════════════════════════════
    // REGISTRATION
    // ═══════════════════════════════════════════════════════════

    registerRestaurant() {
        const pcCode = document.getElementById('nrPcCode')?.value?.trim().toUpperCase();
        const name = document.getElementById('nrName')?.value?.trim();
        const region = document.getElementById('nrRegion')?.value;
        const openDate = document.getElementById('nrOpenDate')?.value;
        const notes = document.getElementById('nrNotes')?.value?.trim();

        // Validation
        if (!pcCode || pcCode.length < 4) {
            alert('Vui lòng nhập mã nhà hàng (PC) ít nhất 4 ký tự.');
            return;
        }

        if (this.restaurants.find(r => r.pc === pcCode)) {
            alert(`Mã nhà hàng ${pcCode} đã được khai báo.`);
            return;
        }

        const chain = pcCode.substring(0, 4);

        const restaurant = {
            pc: pcCode,
            chain: chain,
            name: name || pcCode,
            region: region,
            openDate: openDate,
            notes: notes,
            createdAt: new Date().toISOString(),
            importedPeriods: []
        };

        this.restaurants.push(restaurant);
        this.saveToStorage();
        this.renderRegisteredList();
        this.updateImportTargetDropdown();
        this.clearForm();

        // Show success
        this.showToast(`✅ Đã khai báo nhà hàng ${pcCode} (chuỗi ${chain})`);
    },

    clearForm() {
        ['nrPcCode', 'nrName', 'nrNotes'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        document.getElementById('nrChainCode').value = '';
        document.getElementById('nrRegion').selectedIndex = 0;
        document.getElementById('nrOpenDate').value = '';
    },

    removeRestaurant(pc) {
        if (!confirm(`Xóa nhà hàng ${pc} và toàn bộ dữ liệu import?`)) return;
        this.restaurants = this.restaurants.filter(r => r.pc !== pc);
        delete this.importedData[pc];
        this.saveToStorage();
        this.renderRegisteredList();
        this.updateImportTargetDropdown();
    },

    // ═══════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════

    renderRegisteredList() {
        const container = document.getElementById('nrListBody');
        if (!container) return;

        if (this.restaurants.length === 0) {
            container.innerHTML = '<div class="nr-empty">Chưa có nhà hàng nào được khai báo</div>';
            return;
        }

        container.innerHTML = this.restaurants.map(r => {
            const periodCount = r.importedPeriods?.length || 0;
            const regionLabel = { north: '🔵 Bắc', central: '🟡 Trung', south: '🔴 Nam' }[r.region] || '—';

            return `<div class="nr-item">
                <div class="nr-item-main">
                    <div class="nr-item-code">${r.pc}</div>
                    <div class="nr-item-name">${r.name}</div>
                    <div class="nr-item-meta">
                        <span class="nr-meta-tag">Chuỗi: ${r.chain}</span>
                        <span class="nr-meta-tag">${regionLabel}</span>
                        <span class="nr-meta-tag">${periodCount} kỳ imported</span>
                    </div>
                </div>
                <button class="btn-icon nr-remove-btn" onclick="NewRestaurant.removeRestaurant('${r.pc}')" title="Xóa">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
                </button>
            </div>`;
        }).join('');
    },

    updateImportTargetDropdown() {
        const sel = document.getElementById('nrImportTarget');
        if (!sel) return;

        sel.innerHTML = '<option value="">— Chọn NH đã khai báo —</option>' +
            this.restaurants.map(r =>
                `<option value="${r.pc}">${r.pc} — ${r.name}</option>`
            ).join('');
    },

    // ═══════════════════════════════════════════════════════════
    // FILE IMPORT (CSV)
    // ═══════════════════════════════════════════════════════════

    handleFile(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            this.parseCSV(text);
        };
        reader.readAsText(file);
    },

    parseCSV(text) {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) {
            alert('File không có đủ dữ liệu (cần ít nhất header + 1 dòng).');
            return;
        }

        // Detect separator
        const sep = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
        const headers = lines[0].split(sep).map(h => h.trim().replace(/"/g, ''));

        // Find code and value columns
        let codeIdx = headers.findIndex(h => /^(code|line.?item|ma|mã)/i.test(h));
        let valueIdx = headers.findIndex(h => /^(value|amount|gia.?tri|giá)/i.test(h));

        // Fallback: first 2 columns
        if (codeIdx === -1) codeIdx = 0;
        if (valueIdx === -1) valueIdx = 1;

        const rows = [];
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(sep).map(c => c.trim().replace(/"/g, ''));
            if (cols.length < 2) continue;

            const code = cols[codeIdx]?.toUpperCase();
            const rawValue = cols[valueIdx]?.replace(/[,\s]/g, '');
            const value = parseFloat(rawValue);

            if (!code || isNaN(value)) continue;

            // Match against known line items
            const knownItem = FORECAST_ITEMS.find(fi =>
                fi.code.toUpperCase() === code
            );

            rows.push({
                code: code,
                name: knownItem ? knownItem.name : code,
                value: value,
                matched: !!knownItem
            });
        }

        this.currentImportRows = rows;
        this.renderImportPreview(rows);
    },

    renderImportPreview(rows) {
        const preview = document.getElementById('nrImportPreview');
        const tbody = document.getElementById('nrPreviewBody');
        const countEl = document.getElementById('nrRowCount');

        if (!preview || !tbody) return;

        preview.classList.remove('hidden');
        countEl.textContent = `${rows.length} dòng`;

        tbody.innerHTML = rows.map(r => {
            const statusTag = r.matched
                ? '<span class="nr-status-ok">✅ Khớp</span>'
                : '<span class="nr-status-warn">⚠️ Mới</span>';

            return `<tr>
                <td><code>${r.code}</code></td>
                <td>${r.name}</td>
                <td style="text-align:right;font-weight:600">${Utils.currency(r.value)}</td>
                <td>${statusTag}</td>
            </tr>`;
        }).join('');
    },

    confirmImport() {
        const pc = document.getElementById('nrImportTarget')?.value;
        const periodVal = document.getElementById('nrImportPeriod')?.value;

        if (!pc) { alert('Vui lòng chọn nhà hàng.'); return; }
        if (!periodVal) { alert('Vui lòng chọn kỳ dữ liệu.'); return; }
        if (this.currentImportRows.length === 0) { alert('Chưa có dữ liệu import.'); return; }

        // Parse period: "2026-04" -> 202604
        const [year, month] = periodVal.split('-');
        const datekey = parseInt(year) * 100 + parseInt(month);

        // Save import data
        if (!this.importedData[pc]) this.importedData[pc] = {};
        this.importedData[pc][datekey] = {};

        this.currentImportRows.forEach(row => {
            this.importedData[pc][datekey][row.code] = row.value;
        });

        // Update restaurant periods
        const rest = this.restaurants.find(r => r.pc === pc);
        if (rest && !rest.importedPeriods.includes(datekey)) {
            rest.importedPeriods.push(datekey);
        }

        this.saveToStorage();
        this.renderRegisteredList();
        this.renderConsolidatedReport(datekey);

        // Update consolidated period dropdown
        this.updateConsolPeriodDropdown();

        // Clear preview
        this.currentImportRows = [];
        document.getElementById('nrImportPreview')?.classList.add('hidden');

        this.showToast(`✅ Import ${this.currentImportRows.length || 'thành công'} dòng cho ${pc} kỳ T${month}/${year}`);
    },

    clearImport() {
        this.currentImportRows = [];
        document.getElementById('nrImportPreview')?.classList.add('hidden');
        document.getElementById('nrPreviewBody').innerHTML = '';
    },

    // ═══════════════════════════════════════════════════════════
    // CONSOLIDATED REPORT
    // ═══════════════════════════════════════════════════════════

    updateConsolPeriodDropdown() {
        const sel = document.getElementById('nrConsolPeriod');
        if (!sel) return;

        const allPeriods = new Set();
        Object.values(this.importedData).forEach(pcData => {
            Object.keys(pcData).forEach(dk => allPeriods.add(parseInt(dk)));
        });

        const sorted = [...allPeriods].sort((a, b) => b - a);
        sel.innerHTML = '<option value="">Chọn kỳ</option>' +
            sorted.map(dk => {
                const m = dk % 100;
                const y = Math.floor(dk / 100);
                return `<option value="${dk}">Tháng ${m}/${y}</option>`;
            }).join('');
    },

    async renderConsolidatedReport(datekey) {
        const tbody = document.getElementById('nrConsolBody');
        if (!tbody || !datekey) return;

        // Collect imported data for this period
        const importTotals = {};
        Object.entries(this.importedData).forEach(([pc, periods]) => {
            const periodData = periods[datekey];
            if (periodData) {
                Object.entries(periodData).forEach(([code, val]) => {
                    importTotals[code] = (importTotals[code] || 0) + val;
                });
            }
        });

        // Try to get DB data from API
        let dbData = {};
        try {
            const resp = await fetch(`/api/actual/summary?datekey=${datekey}`);
            const json = await resp.json();
            if (json.status === 'ok' && json.data) {
                dbData = json.data;
            }
        } catch (e) {
            console.warn('[NR] Could not fetch DB data:', e.message);
            dbData = {};
        }

        // Build consolidated rows
        const allCodes = new Set([...Object.keys(dbData), ...Object.keys(importTotals)]);
        const rows = [];

        // Order by FORECAST_ITEMS first
        const orderedCodes = [];
        FORECAST_ITEMS.forEach(fi => {
            if (allCodes.has(fi.code)) {
                orderedCodes.push(fi.code);
                allCodes.delete(fi.code);
            }
        });
        // Add remaining codes
        orderedCodes.push(...[...allCodes].sort());

        orderedCodes.forEach(code => {
            const knownItem = FORECAST_ITEMS.find(fi => fi.code === code);
            const name = knownItem ? knownItem.name : code;
            const dbVal = dbData[code] || 0;
            const importVal = importTotals[code] || 0;
            const total = dbVal + importVal;
            const isParent = knownItem?.isParent;

            const rowClass = isParent ? 'row-parent' : '';
            const codeDisplay = code.toLowerCase() === 'datekey' || code.toLowerCase() === 'tc' ? null : code;
            if (!codeDisplay) return;

            rows.push(`<tr class="${rowClass}">
                <td><code>${code}</code></td>
                <td>${name}</td>
                <td style="text-align:right">${Utils.currency(Math.round(dbVal))}</td>
                <td style="text-align:right;color:#06B6D4;font-weight:600">${importVal ? Utils.currency(Math.round(importVal)) : '—'}</td>
                <td style="text-align:right;font-weight:700">${Utils.currency(Math.round(total))}</td>
            </tr>`);
        });

        tbody.innerHTML = rows.join('');
    },

    // ═══════════════════════════════════════════════════════════
    // PERSISTENCE (localStorage)
    // ═══════════════════════════════════════════════════════════

    saveToStorage() {
        try {
            localStorage.setItem('nr_restaurants', JSON.stringify(this.restaurants));
            localStorage.setItem('nr_imported_data', JSON.stringify(this.importedData));
        } catch (e) {
            console.warn('[NR] Storage error:', e);
        }
    },

    loadFromStorage() {
        try {
            const r = localStorage.getItem('nr_restaurants');
            const d = localStorage.getItem('nr_imported_data');
            if (r) this.restaurants = JSON.parse(r);
            if (d) this.importedData = JSON.parse(d);
        } catch (e) {
            console.warn('[NR] Could not load from storage:', e);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════

    bindEvents() {
        // Auto-detect chain from PC code
        const pcInput = document.getElementById('nrPcCode');
        if (pcInput) {
            pcInput.addEventListener('input', () => {
                const val = pcInput.value.trim().toUpperCase();
                const chainEl = document.getElementById('nrChainCode');
                if (chainEl) {
                    chainEl.value = val.length >= 4 ? val.substring(0, 4) : '';
                }
            });
        }

        // Register button
        document.getElementById('btnRegisterNR')?.addEventListener('click', () => this.registerRestaurant());

        // Upload zone click
        const uploadZone = document.getElementById('nrUploadZone');
        const fileInput = document.getElementById('nrFileInput');
        if (uploadZone && fileInput) {
            uploadZone.addEventListener('click', () => fileInput.click());

            uploadZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadZone.classList.add('drag-over');
            });

            uploadZone.addEventListener('dragleave', () => {
                uploadZone.classList.remove('drag-over');
            });

            uploadZone.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadZone.classList.remove('drag-over');
                if (e.dataTransfer.files.length > 0) {
                    this.handleFile(e.dataTransfer.files[0]);
                }
            });

            fileInput.addEventListener('change', () => {
                if (fileInput.files.length > 0) {
                    this.handleFile(fileInput.files[0]);
                }
            });
        }

        // Confirm import
        document.getElementById('btnConfirmImport')?.addEventListener('click', () => this.confirmImport());

        // Clear import
        document.getElementById('btnClearImport')?.addEventListener('click', () => this.clearImport());

        // Consolidated period change
        document.getElementById('nrConsolPeriod')?.addEventListener('change', (e) => {
            if (e.target.value) {
                this.renderConsolidatedReport(parseInt(e.target.value));
            }
        });

        // Sync DB button
        document.getElementById('btnSyncDB')?.addEventListener('click', () => {
            const periodVal = document.getElementById('nrConsolPeriod')?.value;
            if (periodVal) {
                this.showToast('⏳ Đang tải dữ liệu từ Database...');
                this.renderConsolidatedReport(parseInt(periodVal)).then(() => {
                    this.showToast('✅ Đã cập nhật dữ liệu mới nhất từ DB');
                });
            } else {
                alert('Vui lòng chọn kỳ báo cáo trước.');
            }
        });

        // Export button
        document.getElementById('btnExportConsol')?.addEventListener('click', () => this.exportCSV());
    },

    exportCSV() {
        const table = document.getElementById('nrConsolTable');
        if (!table) return;

        let csv = '';
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            const cols = row.querySelectorAll('th, td');
            const line = [...cols].map(c => `"${c.textContent.trim()}"`).join(',');
            csv += line + '\n';
        });

        const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `pnl_consolidated_${Date.now()}.csv`;
        link.click();
    },

    showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'nr-toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};
