/* ═══════════════════════════════════════════════════════════════
   PNL FORECAST — Restaurant Lock Manager  v3.1
   ─────────────────────────────────────────────────────────────
   DATA SOURCE: /api/master/restaurants (from Open_Close.xlsx)
     → Only restaurants listed in the Master Excel file are shown
     → Cross-referenced with DB for data availability
     → Deduplicated: each PC appears once

   STATE MACHINE:
     ACTIVE   → Excel status = ACTIVE, no manual lock override
     LOCKED   → Excel status = CLOSED  OR  manual lock applied
     UNLOCKED → Was locked, now past unlock time

   LOCK OVERRIDE:
     Users can manually lock/unlock restaurants regardless of
     Excel status. Manual overrides are saved in localStorage.
   ═══════════════════════════════════════════════════════════════ */

const LockManager = {

    // ── Storage keys ──
    STORAGE_KEY : 'aeon_lock_schedules',   // manual lock overrides
    MASTER_KEY  : 'aeon_master_list_cache', // { restaurants: [], fetchedAt: ISO }
    CACHE_TTL_MS: 6 * 60 * 60 * 1000,     // 6 giờ

    // ── In-memory ──
    schedules    : {},   // manual lock schedule map
    masterList   : [],   // full master restaurant list (from Excel)
    _filter      : '',   // current search string
    _statusFilter: '',   // 'ACTIVE' | 'LOCKED' | 'UNLOCKED' | ''
    _selected    : new Set(), // selected PCs for bulk action

    // ═══════════════════════════════════════════════════════════
    // BOOT
    // ═══════════════════════════════════════════════════════════

    async init() {
        this.load();                      // manual overrides from localStorage
        this._renderLoadingState();
        await this.loadMasterList();      // Master list from API or cache
        this.renderAll();
        this.bindEvents();
        this.startClock();
    },

    _renderLoadingState() {
        const tbody = document.getElementById('lockTableBody');
        if (tbody) tbody.innerHTML = `
            <tr><td colspan="9" class="lock-empty">
                <div class="lock-loading-spinner"></div>
                <span>Đang tải danh sách nhà hàng từ Master file...</span>
            </td></tr>`;
    },

    // ═══════════════════════════════════════════════════════════
    // PERSISTENCE — MANUAL LOCK OVERRIDES
    // ═══════════════════════════════════════════════════════════

    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            this.schedules = raw ? JSON.parse(raw) : {};
        } catch { this.schedules = {}; }
    },

    save() {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.schedules));
    },

    // ═══════════════════════════════════════════════════════════
    // MASTER LIST — FETCH FROM API (Excel) OR CACHE
    // ═══════════════════════════════════════════════════════════

    async loadMasterList(forceRefresh = false) {
        // 1. Try cache first
        if (!forceRefresh) {
            try {
                const cached = JSON.parse(localStorage.getItem(this.MASTER_KEY) || 'null');
                if (cached && cached.restaurants && cached.fetchedAt) {
                    const age = Date.now() - new Date(cached.fetchedAt).getTime();
                    if (age < this.CACHE_TTL_MS) {
                        this.masterList = cached.restaurants;
                        this._setDbStatus('cache',
                            `${cached.restaurants.length} NH (cache — ${this._ageStr(age)} trước)`);
                        return;
                    }
                }
            } catch { /* cache miss */ }
        }

        // 2. Fetch from /api/master/restaurants
        this._setDbStatus('loading', 'Đang tải danh sách từ Master file...');
        try {
            const API_BASE = (typeof window !== 'undefined' && window.API_BASE) || 'http://localhost:5050';
            const url = `${API_BASE}/api/master/restaurants${forceRefresh ? '?refresh=true' : ''}`;
            const resp = await fetch(url, { signal: AbortSignal.timeout(15000) });
            const json = await resp.json();

            if (json.status === 'ok' && Array.isArray(json.restaurants)) {
                this.masterList = json.restaurants;

                // Save to cache
                localStorage.setItem(this.MASTER_KEY, JSON.stringify({
                    restaurants: this.masterList,
                    fetchedAt: new Date().toISOString()
                }));

                const dbMatched = json.db_matched || 0;
                const dbNote = json.db_checked ? ` - ${dbMatched} co du lieu DB` : '';
                this._setDbStatus('live',
                    `✅ ${this.masterList.length} NH từ Master — ${dbMatched} có dữ liệu DB`);
                if (!json.db_checked) this._setDbStatus('live', `${this.masterList.length} NH tu Master`);
            } else {
                throw new Error(json.message || 'Invalid response');
            }
        } catch (err) {
            console.warn('[LockManager] Master API failed:', err.message);

            // Fallback: use cached data (even expired)
            try {
                const cached = JSON.parse(localStorage.getItem(this.MASTER_KEY) || 'null');
                if (cached?.restaurants?.length) {
                    this.masterList = cached.restaurants;
                    const age = Date.now() - new Date(cached.fetchedAt).getTime();
                    this._setDbStatus('warn',
                        `⚠️ Offline — dùng cache cũ (${cached.restaurants.length} NH, ${this._ageStr(age)} trước)`);
                    return;
                }
            } catch { /* no cache */ }

            this.masterList = [];
            this._setDbStatus('error',
                `❌ Không tải được Master file. Kiểm tra Open_Close.xlsx và server.`);
        }
    },

    _setDbStatus(type, msg) {
        const el = document.getElementById('lockDbStatus');
        if (!el) return;
        const cls = { live: 'db-live', cache: 'db-cache', warn: 'db-warn', error: 'db-error', loading: 'db-loading' };
        el.className = `lock-db-status ${cls[type] || ''}`;
        el.textContent = msg;
    },

    _ageStr(ms) {
        const m = Math.floor(ms / 60000);
        const h = Math.floor(m / 60);
        if (h > 0) return `${h}g${m % 60}p`;
        return `${m}p`;
    },

    // ═══════════════════════════════════════════════════════════
    // STATE COMPUTATION
    // Combines Excel status + manual lock override
    // ═══════════════════════════════════════════════════════════

    getState(pc, now = new Date()) {
        const manual = this.schedules[pc];

        // 1. Check manual lock override first
        if (manual && manual.lockStart) {
            const lockStart  = new Date(manual.lockStart);
            const unlockTime = manual.unlockTime ? new Date(manual.unlockTime) : null;
            if (now >= lockStart) {
                if (unlockTime && now >= unlockTime) return 'UNLOCKED';
                return 'LOCKED';
            }
        }

        // 2. Check manual unlock (schedule was deleted = unlocked)
        if (manual && manual._unlocked) return 'ACTIVE';

        // 3. Fall back to Excel status
        const master = this.masterList.find(r => r.pc === pc);
        if (master) {
            if (master.status === 'CLOSED') return 'LOCKED';
            return 'ACTIVE';
        }

        return 'ACTIVE';
    },

    getMasterInfo(pc) {
        return this.masterList.find(r => r.pc === pc) || null;
    },

    getEligiblePcs(pcs) {
        const codes = pcs || this.masterList.map(r => r.pc);
        return codes.filter(pc => this.getState(pc) !== 'LOCKED');
    },

    isEligible(pc) { return this.getState(pc) !== 'LOCKED'; },

    // ═══════════════════════════════════════════════════════════
    // CRUD
    // ═══════════════════════════════════════════════════════════

    upsert(pc, lockStart, unlockTime, note = '') {
        if (!pc) return;
        this.schedules[pc] = {
            lockStart  : lockStart  || null,
            unlockTime : unlockTime || null,
            note       : note.trim(),
            _unlocked  : false,
            addedAt    : this.schedules[pc]?.addedAt || new Date().toISOString(),
            updatedAt  : new Date().toISOString()
        };
        this.save();
    },

    remove(pc) {
        delete this.schedules[pc];
        this.save();
        this._selected.delete(pc);
        this.renderAll();
    },

    // ═══════════════════════════════════════════════════════════
    // SELECTION MANAGEMENT
    // ═══════════════════════════════════════════════════════════

    toggleSelect(pc) {
        if (this._selected.has(pc)) {
            this._selected.delete(pc);
        } else {
            this._selected.add(pc);
        }
        this._updateSelectionUI();
    },

    selectAll() {
        const visiblePcs = this._getVisiblePcs();
        visiblePcs.forEach(pc => this._selected.add(pc));
        this.renderTable();
    },

    deselectAll() {
        this._selected.clear();
        this.renderTable();
    },

    _getVisiblePcs() {
        const now = new Date();
        let pcs = this.masterList.map(r => r.pc);

        if (this._filter) {
            const q = this._filter;
            pcs = pcs.filter(pc => {
                const info = this.getMasterInfo(pc);
                return pc.toLowerCase().includes(q) ||
                       (info?.store || '').toLowerCase().includes(q) ||
                       (info?.brand || '').toLowerCase().includes(q);
            });
        }
        if (this._statusFilter) {
            pcs = pcs.filter(pc => this.getState(pc, now) === this._statusFilter);
        }
        return pcs;
    },

    _updateSelectionUI() {
        // Update checkbox states
        const tbody = document.getElementById('lockTableBody');
        if (tbody) {
            tbody.querySelectorAll('.lock-row-check').forEach(cb => {
                cb.checked = this._selected.has(cb.dataset.pc);
            });
        }

        // Update header checkbox
        const headerCb = document.getElementById('lockSelectAll');
        if (headerCb) {
            const visiblePcs = this._getVisiblePcs();
            const selectedVisible = visiblePcs.filter(pc => this._selected.has(pc)).length;
            headerCb.checked = visiblePcs.length > 0 && selectedVisible === visiblePcs.length;
            headerCb.indeterminate = selectedVisible > 0 && selectedVisible < visiblePcs.length;
        }

        // Update bulk action bar
        this._renderBulkActionBar();
    },

    // ═══════════════════════════════════════════════════════════
    // BULK ACTION BAR
    // ═══════════════════════════════════════════════════════════

    _renderBulkActionBar() {
        let bar = document.getElementById('lockBulkActionBar');
        const count = this._selected.size;

        if (count === 0) {
            if (bar) bar.classList.add('hidden');
            return;
        }

        if (!bar) {
            bar = document.createElement('div');
            bar.id = 'lockBulkActionBar';
            bar.className = 'lock-bulk-action-bar';
            const tableWrap = document.querySelector('.lock-table-wrap');
            if (tableWrap) tableWrap.parentNode.insertBefore(bar, tableWrap);
        }

        const now = new Date();
        let lockedCount = 0, unlockableCount = 0;
        this._selected.forEach(pc => {
            const st = this.getState(pc, now);
            if (st === 'LOCKED') lockedCount++;
            else unlockableCount++;
        });

        bar.classList.remove('hidden');
        bar.innerHTML = `
            <div class="bulk-bar-left">
                <span class="bulk-bar-count">
                    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                    Đã chọn <strong>${count}</strong> nhà hàng
                </span>
                <span class="bulk-bar-breakdown">
                    ${lockedCount > 0 ? `<span class="bb-locked">🔒 ${lockedCount} locked</span>` : ''}
                    ${unlockableCount > 0 ? `<span class="bb-active">✅ ${unlockableCount} active/unlocked</span>` : ''}
                </span>
            </div>
            <div class="bulk-bar-right">
                <div class="bulk-bar-unlock-field">
                    <label class="bulk-bar-label">🔓 Unlock lúc (tùy chọn):</label>
                    <input type="datetime-local" id="bulkBarUnlockTime" class="bulk-bar-input"
                           title="Để trống = lock vô thời hạn (limited)">
                </div>
                ${unlockableCount > 0 ? `
                    <button class="bulk-bar-btn bulk-bar-lock" id="bulkBarLockBtn"
                            title="Khóa ${unlockableCount} nhà hàng">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                            <path fill-rule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clip-rule="evenodd"/>
                        </svg>
                        Khóa (${unlockableCount})
                    </button>
                ` : ''}
                ${lockedCount > 0 ? `
                    <button class="bulk-bar-btn bulk-bar-unlock" id="bulkBarUnlockBtn"
                            title="Mở khóa ${lockedCount} nhà hàng">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
                            <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2H7V7a3 3 0 015.905-.75 1 1 0 001.937-.5A5.002 5.002 0 0010 2z"/>
                        </svg>
                        Mở khóa (${lockedCount})
                    </button>
                ` : ''}
                <button class="bulk-bar-btn bulk-bar-clear" id="bulkBarClearBtn" title="Bỏ chọn">✕</button>
            </div>
        `;

        document.getElementById('bulkBarLockBtn')?.addEventListener('click', () => this._bulkToggleLock());
        document.getElementById('bulkBarUnlockBtn')?.addEventListener('click', () => this._bulkToggleUnlock());
        document.getElementById('bulkBarClearBtn')?.addEventListener('click', () => this.deselectAll());
    },

    _bulkToggleLock() {
        const now = new Date();
        const unlockInput = document.getElementById('bulkBarUnlockTime');
        const unlockTime = unlockInput?.value || null;
        const lockStart = now.toISOString();

        let count = 0;
        this._selected.forEach(pc => {
            const st = this.getState(pc, now);
            if (st !== 'LOCKED') {
                this.upsert(pc, lockStart, unlockTime,
                    unlockTime ? 'Manual lock (scheduled unlock)' : 'Manual lock (limited)');
                count++;
            }
        });

        if (count > 0) {
            this._selected.clear();
            this.renderAll();
            this._showToast(
                `🔒 Đã khóa ${count} nhà hàng ${unlockTime ? '(có hẹn mở)' : '(limited — vô thời hạn)'}`,
                'warning');
        }
    },

    _bulkToggleUnlock() {
        const now = new Date();
        let count = 0;
        this._selected.forEach(pc => {
            const st = this.getState(pc, now);
            if (st === 'LOCKED') {
                // Mark as manually unlocked (overrides Excel CLOSED status)
                this.schedules[pc] = {
                    lockStart  : null,
                    unlockTime : null,
                    note       : 'Manually unlocked',
                    _unlocked  : true,
                    addedAt    : this.schedules[pc]?.addedAt || new Date().toISOString(),
                    updatedAt  : new Date().toISOString()
                };
                count++;
            }
        });

        if (count > 0) {
            this.save();
            this._selected.clear();
            this.renderAll();
            this._showToast(`🔓 Đã mở khóa ${count} nhà hàng`, 'success');
        }
    },

    _showToast(msg, type) {
        if (typeof Utils !== 'undefined') {
            (Utils.toast || Utils.showToast)?.call(Utils, msg, type);
        }
    },

    // ═══════════════════════════════════════════════════════════
    // RENDER
    // ═══════════════════════════════════════════════════════════

    renderAll() {
        this.renderSummary();
        this.renderTable();
    },

    renderSummary() {
        const summary = document.getElementById('lockSummary');
        if (!summary) return;
        const now = new Date();
        let locked = 0, unlocked = 0, active = 0, inDb = 0;
        this.masterList.forEach(r => {
            const s = this.getState(r.pc, now);
            if (s === 'LOCKED')   locked++;
            if (s === 'UNLOCKED') unlocked++;
            if (s === 'ACTIVE')   active++;
            if (r.in_db) inDb++;
        });
        const total = this.masterList.length;
        summary.innerHTML = `
            <span class="sum-chip chip-total">🏪 Tổng: <strong>${total}</strong></span>
            <span class="sum-chip chip-active">✅ Active: <strong>${active}</strong></span>
            <span class="sum-chip chip-locked">🔒 Locked: <strong>${locked}</strong></span>
            <span class="sum-chip chip-unlocked">🔓 Unlocked: <strong>${unlocked}</strong></span>
            <span class="sum-chip chip-scheduled" title="Có dữ liệu trên Database">
                💾 Có DB: <strong>${inDb}</strong>
            </span>`;
    },

    renderTable() {
        const tbody = document.getElementById('lockTableBody');
        if (!tbody) return;
        const now = new Date();

        // Only show restaurants from Master list
        let entries = [...this.masterList];

        // Apply search filter (search by code, store name, brand)
        if (this._filter) {
            const q = this._filter;
            entries = entries.filter(r =>
                r.pc.toLowerCase().includes(q) ||
                (r.store || '').toLowerCase().includes(q) ||
                (r.brand || '').toLowerCase().includes(q)
            );
        }

        // Apply status filter
        if (this._statusFilter) {
            entries = entries.filter(r => this.getState(r.pc, now) === this._statusFilter);
        }

        if (entries.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="lock-empty">
                ${this._filter || this._statusFilter
                    ? 'Không tìm thấy nhà hàng khớp với bộ lọc.'
                    : 'Chưa có dữ liệu. Nhấn "🔄 Refresh từ DB" để tải danh sách.'}
            </td></tr>`;
            this._updateSelectionUI();
            return;
        }

        const rows = entries.map(r => {
            const pc = r.pc;
            const state = this.getState(pc, now);
            const manual = this.schedules[pc] || null;
            const isChecked = this._selected.has(pc);

            // Status badge
            const stateBadge = state === 'LOCKED'
                ? `<span class="lock-badge badge-locked">🔒 LOCKED</span>`
                : state === 'UNLOCKED'
                ? `<span class="lock-badge badge-unlocked">🔓 UNLOCKED</span>`
                : `<span class="lock-badge badge-active">✅ ACTIVE</span>`;

            // Source badge (DB match or not)
            const dbBadge = r.in_db
                ? `<span class="lock-db-badge db-confirmed" title="Có dữ liệu trong DB">DB</span>`
                : `<span class="lock-db-badge db-manual" title="Chưa có dữ liệu DB">—</span>`;

            // Excel status tag
            const excelTag = r.status_raw && r.status_raw !== r.status
                ? `<span class="lock-excel-tag" title="Trạng thái gốc: ${r.status_raw}">${r.status_raw}</span>`
                : '';

            // Lock/Unlock times
            const ls = manual?.lockStart  ? this._fmt(manual.lockStart)  : '—';
            const ul = manual?.unlockTime
                ? this._fmt(manual.unlockTime)
                : (state === 'LOCKED' && !manual?.unlockTime
                    ? '<em class="lock-limited-tag">Limited</em>'
                    : '—');

            // Note
            const note = manual?.note || (r.status === 'CLOSED' && !manual ? r.status_raw : '') || '—';

            // Countdown
            let countdown = '';
            if (state === 'LOCKED' && manual?.unlockTime) {
                const diff = new Date(manual.unlockTime) - now;
                countdown = `<span class="cd-locked">Mở sau: ${this._duration(diff)}</span>`;
            } else if (state === 'LOCKED' && !manual?.unlockTime) {
                countdown = `<span class="cd-limited">∞ Vô thời hạn</span>`;
            }

            // Store name (truncated)
            const storeName = r.store || '—';
            const storeDisplay = storeName.length > 35
                ? `<span title="${storeName}">${storeName.slice(0, 35)}…</span>`
                : storeName;

            return `<tr class="lock-row-${state.toLowerCase()} ${isChecked ? 'lock-row-selected' : ''}">
                <td class="lock-check-cell">
                    <input type="checkbox" class="lock-row-check" data-pc="${pc}" ${isChecked ? 'checked' : ''}>
                </td>
                <td class="lock-pc-cell">
                    <code>${pc}</code>${dbBadge}
                </td>
                <td class="lock-store-cell" title="${storeName}">${storeDisplay}</td>
                <td>${stateBadge} ${excelTag}</td>
                <td class="lock-time-cell">${ls}</td>
                <td class="lock-time-cell">${ul}</td>
                <td class="lock-note">${note}</td>
                <td class="lock-countdown">${countdown}</td>
                <td class="lock-actions-cell">
                    <button class="btn-lock-edit" data-pc="${pc}" title="Chỉnh sửa">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                            <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/>
                        </svg>
                    </button>
                    ${manual ? `<button class="btn-lock-delete" data-pc="${pc}" title="Xóa override">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="13" height="13">
                            <path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/>
                        </svg>
                    </button>` : ''}
                </td>
            </tr>`;
        }).join('');

        tbody.innerHTML = rows;

        // Bind checkboxes
        tbody.querySelectorAll('.lock-row-check').forEach(cb => {
            cb.addEventListener('change', () => this.toggleSelect(cb.dataset.pc));
        });

        // Bind action buttons
        tbody.querySelectorAll('.btn-lock-edit').forEach(btn =>
            btn.addEventListener('click', () => this.openForm(btn.dataset.pc)));

        tbody.querySelectorAll('.btn-lock-delete').forEach(btn =>
            btn.addEventListener('click', () => {
                if (confirm(`Xóa override cho "${btn.dataset.pc}"? Sẽ quay về trạng thái từ Master file.`))
                    this.remove(btn.dataset.pc);
            }));

        this._updateSelectionUI();
    },

    // ═══════════════════════════════════════════════════════════
    // ADD / EDIT FORM MODAL
    // ═══════════════════════════════════════════════════════════

    openForm(pc = '') {
        const s = pc ? this.schedules[pc] : null;
        const master = pc ? this.getMasterInfo(pc) : null;

        document.getElementById('lockFormPc').value         = pc;
        document.getElementById('lockFormPcInput').value    = pc;
        document.getElementById('lockFormLockStart').value  = s?.lockStart  ? this._toDatetimeLocal(s.lockStart)  : '';
        document.getElementById('lockFormUnlock').value     = s?.unlockTime ? this._toDatetimeLocal(s.unlockTime) : '';
        document.getElementById('lockFormNote').value       = s?.note || '';
        document.getElementById('lockModalTitle').textContent = pc
            ? `Chỉnh sửa: ${pc}${master ? ` — ${master.store}` : ''}`
            : 'Thêm khai báo Lock';
        document.getElementById('lockFormPcInput').readOnly = !!pc;

        const modal = document.getElementById('lockModal');
        modal.classList.remove('hidden');
        modal.classList.add('visible');

        const overlay = document.getElementById('lockModalOverlay');
        overlay.classList.remove('hidden');
        overlay.classList.add('visible');
    },

    closeForm() {
        const modal = document.getElementById('lockModal');
        modal.classList.remove('visible');
        modal.classList.add('hidden');

        const overlay = document.getElementById('lockModalOverlay');
        overlay.classList.remove('visible');
        overlay.classList.add('hidden');
    },

    submitForm() {
        const pc        = (document.getElementById('lockFormPcInput').value || '').trim().toUpperCase();
        const lockStart = document.getElementById('lockFormLockStart').value;
        const unlock    = document.getElementById('lockFormUnlock').value;
        const note      = document.getElementById('lockFormNote').value;

        if (!pc) { alert('Vui lòng nhập mã nhà hàng (pc).'); return; }
        if (lockStart && unlock && new Date(unlock) <= new Date(lockStart)) {
            alert('Thời gian Unlock phải sau thời gian Lock.'); return;
        }

        this.upsert(pc, lockStart, unlock, note);
        this.renderAll();
        this.closeForm();
        this._showToast(`Đã lưu khai báo lock cho ${pc}`, 'success');
    },

    // ═══════════════════════════════════════════════════════════
    // BULK LOCK (legacy — from bulk panel textarea)
    // ═══════════════════════════════════════════════════════════

    bulkLock(pcsText, lockStart, unlockTime, note = 'Bulk lock') {
        const pcs = pcsText.split(/[\n,;]+/).map(p => p.trim().toUpperCase()).filter(Boolean);
        if (!pcs.length) { alert('Không có mã NH hợp lệ.'); return; }
        pcs.forEach(pc => this.upsert(pc, lockStart, unlockTime, note));
        this.renderAll();
        this._showToast(`🔒 Đã khóa ${pcs.length} nhà hàng`, 'warning');
    },

    // ═══════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════

    bindEvents() {
        // Add button
        document.getElementById('btnAddLock')?.addEventListener('click', () => this.openForm());

        // Modal close
        document.getElementById('btnLockModalClose')?.addEventListener('click', () => this.closeForm());
        document.getElementById('lockModalOverlay')?.addEventListener('click', () => this.closeForm());

        // Submit form
        document.getElementById('btnLockSubmit')?.addEventListener('click', () => this.submitForm());

        // Bulk lock button (legacy panel)
        document.getElementById('btnBulkLock')?.addEventListener('click', () => {
            const pcsText = document.getElementById('bulkPcInput').value;
            const lockStart = document.getElementById('bulkLockStart').value;
            const unlock    = document.getElementById('bulkUnlock').value;
            if (!pcsText.trim()) { alert('Nhập danh sách mã nhà hàng.'); return; }
            this.bulkLock(pcsText, lockStart, unlock);
        });

        // Search filter (searches code, store name, brand)
        document.getElementById('lockFilterInput')?.addEventListener('input', e => {
            this._filter = e.target.value.trim().toLowerCase();
            this.renderTable();
        });

        // Status filter chips
        document.querySelectorAll('.lock-filter-chip').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.lock-filter-chip').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this._statusFilter = btn.dataset.status || '';
                this.renderTable();
            });
        });

        // Select All checkbox
        document.getElementById('lockSelectAll')?.addEventListener('change', e => {
            if (e.target.checked) this.selectAll();
            else this.deselectAll();
        });

        // Refresh from Master file
        document.getElementById('btnRefreshDb')?.addEventListener('click', async () => {
            this._setDbStatus('loading', 'Đang tải lại từ Master file...');
            await this.loadMasterList(true);
            this.renderAll();
            this._showToast('Đã làm mới danh sách từ Master file', 'info');
        });

        // Export / Import
        document.getElementById('btnExportLock')?.addEventListener('click', () => this._exportSchedule());
        document.getElementById('btnImportLock')?.addEventListener('click', () =>
            document.getElementById('lockImportInput')?.click());
        document.getElementById('lockImportInput')?.addEventListener('change', e => this._importSchedule(e));
    },

    // ═══════════════════════════════════════════════════════════
    // EXPORT / IMPORT
    // ═══════════════════════════════════════════════════════════

    _exportSchedule() {
        const data = {
            exportedAt : new Date().toISOString(),
            schedules  : this.schedules,
            masterCount: this.masterList.length
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `lock_schedule_${new Date().toISOString().slice(0,10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    },

    _importSchedule(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const parsed = JSON.parse(ev.target.result);
                const newSchedules = parsed.schedules || parsed;
                if (typeof newSchedules !== 'object') throw new Error('Invalid format');
                const count = Object.keys(newSchedules).length;
                if (confirm(`Import ${count} khai báo lock? Các khai báo hiện tại sẽ bị ghi đè.`)) {
                    this.schedules = newSchedules;
                    this.save();
                    this.renderAll();
                    this._showToast(`Đã import ${count} khai báo`, 'success');
                }
            } catch (err) {
                alert('File không hợp lệ: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    },

    // ═══════════════════════════════════════════════════════════
    // CLOCK — auto refresh every 30s
    // ═══════════════════════════════════════════════════════════

    startClock() {
        setInterval(() => {
            if (document.getElementById('lockTableBody')) {
                this.renderSummary();
                this.renderTable();
            }
        }, 30000);
    },

    // ═══════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════

    _fmt(iso) {
        if (!iso) return '—';
        try { return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }); }
        catch { return iso; }
    },

    _toDatetimeLocal(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        const p = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
    },

    _duration(ms) {
        if (ms <= 0) return '0p';
        const h = Math.floor(ms / 3600000);
        const m = Math.floor((ms % 3600000) / 60000);
        const d = Math.floor(h / 24);
        if (d > 0) return `${d}n ${h % 24}g`;
        if (h > 0) return `${h}g ${m}p`;
        return `${m}p`;
    }
};
