/* ═══════════════════════════════════════════════════════════════
   PNL FORECAST — Main Application Controller
   ═══════════════════════════════════════════════════════════════ */

const App = {
    currentModule: 'dashboard',
    initialized: {},

    // ─── Boot ───
    init() {
        // Initialize LockManager at boot (always needed for Forecast filtering)
        LockManager.load();

        // Set Chart.js defaults
        ChartConfig.defaults();

        // Initialize default module
        this.switchModule('dashboard');

        // Bind global navigation
        this.bindNavigation();
        this.bindSidebarToggle();

        // Welcome toast
        setTimeout(() => {
            Utils.toast('Welcome to PnL Forecast', 'info');
        }, 800);

        console.log('%c✦ PnL Forecast v1.0 — Financial Intelligence Platform', 
            'color:#3B82F6;font-size:14px;font-weight:700;padding:8px 0');
    },

    // ─── Module Switching ───
    switchModule(moduleName) {
        // Hide all views
        document.querySelectorAll('.module-view').forEach(v => v.classList.remove('active'));

        // Show target view
        const view = document.getElementById('view-' + moduleName);
        if (view) view.classList.add('active');

        // Update nav items (sidebar)
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-module="${moduleName}"]`);
        if (navItem) navItem.classList.add('active');

        // Update bottom nav (mobile)
        document.querySelectorAll('.bottom-nav-item').forEach(n => n.classList.remove('active'));
        const bottomItem = document.querySelector(`.bottom-nav-item[data-module="${moduleName}"]`);
        if (bottomItem) bottomItem.classList.add('active');

        // Update topbar title
        const titles = {
            dashboard:    'PnL Performance Dashboard',
            forecast:     'Forecast Formula Builder',
            onboarding:   'Data Ingestion & Onboarding',
            newrestaurant:'NH mới & Import dữ liệu',
            consolidation:'Report Consolidation Engine',
            lockmanager:  '🔒 Lock Manager — Quản lý trạng thái NH',
        };
        const topbarTitle = document.getElementById('topbarTitle');
        if (topbarTitle) topbarTitle.textContent = titles[moduleName] || moduleName;

        // Initialize module (lazy)
        if (!this.initialized[moduleName]) {
            this.initModule(moduleName);
            this.initialized[moduleName] = true;
        } else if (moduleName === 'consolidation') {
            // Always refresh Consolidation with the latest Forecast data
            Consolidation.refreshFromForecast();
        }

        // Close sidebar on mobile
        const sidebar = document.getElementById('sidebar');
        if (sidebar) sidebar.classList.remove('open');

        this.currentModule = moduleName;
    },

    // ─── Lazy Module Initialization ───
    initModule(moduleName) {
        switch (moduleName) {
            case 'dashboard':
                Dashboard.init();
                break;
            case 'forecast':
                Forecast.init();
                break;
            case 'onboarding':
                Onboarding.init();
                break;
            case 'consolidation':
                Consolidation.init();
                break;
            case 'newrestaurant':
                NewRestaurant.init();
                break;
            case 'lockmanager':
                LockManager.init();
                break;
        }
    },

    // ─── Navigation Binding ───
    bindNavigation() {
        // Sidebar nav
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                this.switchModule(item.dataset.module);
            });
        });

        // Bottom nav (mobile)
        document.querySelectorAll('.bottom-nav-item').forEach(item => {
            item.addEventListener('click', () => {
                this.switchModule(item.dataset.module);
            });
        });
    },

    // ─── Sidebar Toggle (Mobile) ───
    bindSidebarToggle() {
        const menuBtn = document.getElementById('menuToggle');
        const sidebar = document.getElementById('sidebar');

        if (menuBtn && sidebar) {
            menuBtn.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });

            // Close sidebar when clicking outside
            document.addEventListener('click', (e) => {
                if (sidebar.classList.contains('open') &&
                    !sidebar.contains(e.target) &&
                    !menuBtn.contains(e.target)) {
                    sidebar.classList.remove('open');
                }
            });
        }

        // Notification button
        const notifBtn = document.getElementById('notifBtn');
        if (notifBtn) {
            notifBtn.addEventListener('click', () => {
                Utils.toast('3 new notifications', 'info');
            });
        }

        // Export button
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                Utils.toast('Exporting report as PDF...', 'success');
            });
        }

        // System Update
        document.getElementById('btnSystemUpdate')?.addEventListener('click', () => {
             Utils.toast('♻️ Đang làm mới kết nối và dữ liệu...', 'info');
             setTimeout(() => location.reload(), 800);
        });

        // System Reset
        document.getElementById('btnSystemReset')?.addEventListener('click', () => {
             if(confirm('CẢNH BÁO: Thao tác này sẽ xóa toàn bộ danh sách NH mới và dữ liệu đã Import lưu trên trình duyệt. Bạn có chắc chắn muốn thực hiện?')) {
                 localStorage.clear();
                 Utils.toast('🔥 Đã xóa toàn bộ dữ liệu tạm thời.', 'error');
                 setTimeout(() => location.reload(), 1000);
             }
        });
    },
};

// ─── Boot on DOM ready ───
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});
