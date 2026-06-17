/* ═══════════════════════════════════════════════════════════════
   PNL FORECAST — Utility Functions
   ═══════════════════════════════════════════════════════════════ */

const Utils = {
    /**
     * Format number as currency with $ sign and thousand separators
     */
    currency(value, decimals = 0) {
        if (value == null) return '—';
        const abs = Math.abs(value);
        const formatted = abs.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
        const prefix = value < 0 ? '-$' : '$';
        return prefix + formatted;
    },

    /**
     * Format number with thousand separators (no currency sign)
     */
    number(value, decimals = 0) {
        if (value == null) return '—';
        return value.toLocaleString('en-US', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
        });
    },

    /**
     * Format percentage
     */
    percent(value, decimals = 1) {
        if (value == null) return '—';
        const sign = value > 0 ? '+' : '';
        return sign + value.toFixed(decimals) + '%';
    },

    /**
     * Calculate variance
     */
    variance(actual, forecast) {
        return actual - forecast;
    },

    /**
     * Calculate variance percentage
     */
    variancePct(actual, forecast) {
        if (forecast === 0) return 0;
        return ((actual - forecast) / Math.abs(forecast)) * 100;
    },

    /**
     * Calculate YoY change
     */
    yoyPct(current, prior) {
        if (prior === 0) return 0;
        return ((current - prior) / Math.abs(prior)) * 100;
    },

    /**
     * Get CSS class for positive/negative values
     */
    varianceClass(value, invertPositive = false) {
        if (value == null || value === 0) return '';
        if (invertPositive) {
            return value > 0 ? 'val-negative' : 'val-positive';
        }
        return value > 0 ? 'val-positive' : 'val-negative';
    },

    /**
     * Debounce function
     */
    debounce(fn, delay = 250) {
        let timer;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    /**
     * Show a toast notification
     */
    toast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3200);
    },

    /**
     * Animate number counting up
     */
    animateValue(element, start, end, duration = 800) {
        const range = end - start;
        const startTime = performance.now();
        
        function update(currentTime) {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            const current = start + range * eased;
            element.textContent = Utils.currency(Math.round(current));
            
            if (progress < 1) {
                requestAnimationFrame(update);
            }
        }
        
        requestAnimationFrame(update);
    },

    /**
     * Get short currency format (e.g., $2.8M, $245K)
     */
    shortCurrency(value) {
        const abs = Math.abs(value);
        const sign = value < 0 ? '-' : '';
        if (abs >= 1000000) return sign + '$' + (abs / 1000000).toFixed(1) + 'M';
        if (abs >= 1000) return sign + '$' + (abs / 1000).toFixed(0) + 'K';
        return sign + '$' + abs.toFixed(0);
    },

    /**
     * Parse currency string to number
     */
    parseCurrency(str) {
        if (typeof str === 'number') return str;
        return parseFloat(str.replace(/[$,]/g, '')) || 0;
    },

    /**
     * Create skeleton loading placeholder
     */
    skeleton(lines = 3) {
        let html = '<div class="skeleton-wrapper">';
        for (let i = 0; i < lines; i++) {
            html += `<div class="skeleton skeleton-line" style="width:${70 + Math.random() * 30}%"></div>`;
        }
        html += '</div>';
        return html;
    },
};
