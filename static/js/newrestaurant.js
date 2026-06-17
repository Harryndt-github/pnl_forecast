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

        if (file.name.match(/\.xls(x)?$/i)) {
            if (typeof XLSX !== 'undefined') {
                reader.onload = (e) => this.parseExcel(e.target.result);
                reader.readAsArrayBuffer(file);
            } else {
                alert('Trình duyệt chưa tải xong thư viện XLSX. Vui lòng F5 lại trang.');
            }
        } else {
            reader.onload = (e) => this.parseCSV(e.target.result);
            reader.readAsText(file);
        }
    },

    parseExcel(data) {
        try {
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const json = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }); 
            this.processGrid(json);
        } catch (e) {
            console.error(e);
            alert('Lỗi khi đọc file Excel.');
        }
    },

    parseCSV(text) {
        const lines = text.split('\n').filter(l => l.trim());
        if (lines.length < 2) {
            alert('File không có đủ dữ liệu (cần ít nhất header + 1 dòng).');
            return;
        }
        const sep = lines[0].includes('\t') ? '\t' : (lines[0].includes(';') ? ';' : ',');
        const grid = lines.map(line => line.split(sep).map(h => h.trim().replace(/"/g, '')));
        this.processGrid(grid);
    },

    processGrid(grid) {
        if (!grid || grid.length < 2) return;
        const headers = grid[0].map(h => String(h).trim());

        let codeIdx = headers.findIndex(h => /^(code|line.?item|ma|mã)/i.test(h));
        
        let periodCols = [];
        headers.forEach((h, idx) => {
            const hStr = h.replace(/[^0-9]/g, '');
            if (hStr.length === 6) {
                const year = parseInt(hStr.substring(0, 4));
                const month = parseInt(hStr.substring(4, 6));
                if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) {
                    periodCols.push({ datekey: year * 100 + month, idx: idx });
                }
            } else if (String(h).match(/20[0-9]{2}0[1-9]|20[0-9]{2}1[0-2]/)) {
                periodCols.push({ datekey: parseInt(String(h).match(/(20[0-9]{2}0[1-9]|20[0-9]{2}1[0-2])/)[0]), idx: idx });
            }
        });

        let valueIdx = -1;
        if (periodCols.length === 0) {
            valueIdx = headers.findIndex(h => /^(value|amount|gia.?tri|giá)/i.test(h));
            if (codeIdx === -1) codeIdx = 0;
            if (valueIdx === -1) valueIdx = 1;
        } else {
            if (codeIdx === -1) codeIdx = 0;
        }

        const rows = [];
        for (let i = 1; i < grid.length; i++) {
            const cols = grid[i];
            if (!cols || cols.length < 2) continue;

            const code = String(cols[codeIdx] || '').toUpperCase().trim();
            if (!code || code === '') continue;
            
            const knownItem = FORECAST_ITEMS.find(fi => fi.code.toUpperCase() === code);
            const name = knownItem ? knownItem.name : code;
            
            if (periodCols.length > 0) {
                periodCols.forEach(p => {
                    const rawValue = String(cols[p.idx] || '').replace(/[,\s]/g, '');
                    if (!rawValue || rawValue === '') return;
                    const value = parseFloat(rawValue);
                    if (!isNaN(value)) {
                        rows.push({ code: code, name: name, value: value, datekey: p.datekey, matched: !!knownItem });
                    }
                });
            } else {
                const rawValue = String(cols[valueIdx] || '').replace(/[,\s]/g, '');
                if (!rawValue || rawValue === '') continue;
                const value = parseFloat(rawValue);
                if (!isNaN(value)) {
                    rows.push({ code: code, name: name, value: value, datekey: null, matched: !!knownItem });
                }
            }
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
        countEl.textContent = `${rows.length} record(s)`;

        // Limit preview to 100 rows to prevent lag
        const displayRows = rows.slice(0, 100);

        tbody.innerHTML = displayRows.map(r => {
            const statusTag = r.matched ? '<span class="nr-status-ok">✅ Khớp</span>' : '<span class="nr-status-warn">⚠️ Mới</span>';
            const dkLabel = r.datekey ? `T${r.datekey % 100}/${Math.floor(r.datekey/100)}` : 'Khoá từ UI';

            return `<tr>
                <td><code>${r.code}</code></td>
                <td>${r.name}</td>
                <td><span class="badge ${r.datekey ? 'badge-primary' : 'badge-neutral'}">${dkLabel}</span></td>
                <td style="text-align:right;font-weight:600">${Utils.currency(r.value)}</td>
                <td>${statusTag}</td>
            </tr>`;
        }).join('');
        
        if (rows.length > 100) {
            tbody.innerHTML += `<tr><td colspan="5" style="text-align:center;color:#666">... còn ${rows.length - 100} dòng nữa</td></tr>`;
        }
    },

    confirmImport() {
        const pc = document.getElementById('nrImportTarget')?.value;
        const periodVal = document.getElementById('nrImportPeriod')?.value;

        if (!pc) { alert('Vui lòng chọn nhà hàng.'); return; }
        if (this.currentImportRows.length === 0) { alert('Chưa có dữ liệu import.'); return; }

        let fallbackDk = null;
        if (periodVal) {
            const [year, month] = periodVal.split('-');
            fallbackDk = parseInt(year) * 100 + parseInt(month);
        }

        if (!this.importedData[pc]) this.importedData[pc] = {};
        
        let importedDks = new Set();
        let skippedCount = 0;

        this.currentImportRows.forEach(row => {
            const rowDk = row.datekey || fallbackDk;
            if (!rowDk) {
                skippedCount++;
                return;
            }
            if (!this.importedData[pc][rowDk]) {
                this.importedData[pc][rowDk] = {};
            }
            this.importedData[pc][rowDk][row.code] = row.value;
            importedDks.add(rowDk);
            
            const rest = this.restaurants.find(r => r.pc === pc);
            if (rest && !rest.importedPeriods.includes(rowDk)) {
                rest.importedPeriods.push(rowDk);
            }
        });
        
        if (skippedCount > 0 && importedDks.size === 0) {
            alert('Lỗi: File tải lên dạng Cột Data (1 kỳ) nhưng bạn CHƯA chọn "Kỳ dữ liệu" ở giao diện! Hãy chọn phần Tùy chọn kỳ dữ liệu và Import lại.');
            return;
        }

        this.saveToStorage();
        this.renderRegisteredList();
        
        // Render the latest imported period
        const latestDk = Math.max(...Array.from(importedDks));
        this.renderConsolidatedReport(latestDk);
        this.updateConsolPeriodDropdown();

        this.currentImportRows = [];
        document.getElementById('nrImportPreview')?.classList.add('hidden');

        this.showToast(`✅ Import thành công ${importedDks.size} kỳ dữ liệu cho ${pc}`);
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
