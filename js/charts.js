/* ═══════════════════════════════════════════════════════════════
   PNL FORECAST — Chart Configurations (Chart.js)
   ═══════════════════════════════════════════════════════════════ */

const ChartConfig = {
    // Global defaults
    defaults() {
        Chart.defaults.font.family = "'Inter', -apple-system, sans-serif";
        Chart.defaults.font.size = 11;
        Chart.defaults.color = '#94A3B8';
        Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(17, 30, 51, 0.95)';
        Chart.defaults.plugins.tooltip.borderColor = 'rgba(148, 163, 184, 0.2)';
        Chart.defaults.plugins.tooltip.borderWidth = 1;
        Chart.defaults.plugins.tooltip.cornerRadius = 8;
        Chart.defaults.plugins.tooltip.padding = 12;
        Chart.defaults.plugins.tooltip.titleFont = { weight: '600', size: 12 };
        Chart.defaults.plugins.tooltip.bodyFont = { size: 12 };
        Chart.defaults.plugins.legend.display = false;
        Chart.defaults.elements.bar.borderRadius = 4;
        Chart.defaults.scale.grid = { color: 'rgba(148, 163, 184, 0.06)' };
    },

    // ─── Volume vs Margin (Combined Bar + Line) ───
    volumeMargin(canvasId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: VOLUME_MARGIN.labels,
                datasets: [
                    {
                        label: 'Actual Revenue',
                        data: VOLUME_MARGIN.revenue,
                        backgroundColor: 'rgba(59, 130, 246, 0.7)',
                        hoverBackgroundColor: 'rgba(59, 130, 246, 0.9)',
                        borderRadius: 6,
                        barPercentage: 0.35,
                        categoryPercentage: 0.8,
                        order: 2,
                    },
                    {
                        label: 'Forecast',
                        data: VOLUME_MARGIN.forecast,
                        backgroundColor: 'rgba(6, 182, 212, 0.35)',
                        hoverBackgroundColor: 'rgba(6, 182, 212, 0.55)',
                        borderRadius: 6,
                        barPercentage: 0.35,
                        categoryPercentage: 0.8,
                        order: 3,
                    },
                    {
                        label: 'Margin %',
                        data: VOLUME_MARGIN.margin,
                        type: 'line',
                        yAxisID: 'y1',
                        borderColor: '#10B981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 2.5,
                        pointRadius: 4,
                        pointBackgroundColor: '#10B981',
                        pointBorderColor: '#111E33',
                        pointBorderWidth: 2,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.3,
                        order: 1,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 11, weight: '500' } }
                    },
                    y: {
                        beginAtZero: false,
                        ticks: {
                            callback: v => Utils.shortCurrency(v),
                            font: { size: 10 }
                        }
                    },
                    y1: {
                        position: 'right',
                        beginAtZero: false,
                        min: 15,
                        max: 25,
                        grid: { display: false },
                        ticks: {
                            callback: v => v + '%',
                            font: { size: 10 }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                if (ctx.dataset.yAxisID === 'y1') {
                                    return ctx.dataset.label + ': ' + ctx.raw.toFixed(1) + '%';
                                }
                                return ctx.dataset.label + ': ' + Utils.currency(ctx.raw);
                            }
                        }
                    }
                }
            }
        });
    },

    // ─── Expense Breakdown (Doughnut) ───
    expenseBreakdown(canvasId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        return new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: EXPENSE_BREAKDOWN.labels,
                datasets: [{
                    data: EXPENSE_BREAKDOWN.values,
                    backgroundColor: EXPENSE_BREAKDOWN.colors,
                    borderColor: '#111E33',
                    borderWidth: 3,
                    hoverOffset: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '68%',
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            boxWidth: 10,
                            boxHeight: 10,
                            padding: 10,
                            font: { size: 10, weight: '500' },
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((ctx.raw / total) * 100).toFixed(1);
                                return ctx.label + ': ' + Utils.currency(ctx.raw) + ' (' + pct + '%)';
                            }
                        }
                    }
                }
            }
        });
    },

    // ─── 12-Month Trend (Line with projection) ───
    trendLine(canvasId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const allLabels = [...MONTHLY_TREND.labels, ...MONTHLY_TREND.projLabels];
        const actualData = [...MONTHLY_TREND.actual, ...Array(3).fill(null)];
        const forecastData = [...MONTHLY_TREND.forecast, ...Array(3).fill(null)];

        // Projection line starts from last actual
        const projData = [
            ...Array(MONTHLY_TREND.actual.length - 1).fill(null),
            MONTHLY_TREND.actual[MONTHLY_TREND.actual.length - 1],
            ...MONTHLY_TREND.projection
        ];

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: 'Actual Revenue',
                        data: actualData,
                        borderColor: '#3B82F6',
                        backgroundColor: 'rgba(59, 130, 246, 0.08)',
                        borderWidth: 2.5,
                        pointRadius: 3,
                        pointBackgroundColor: '#3B82F6',
                        pointBorderColor: '#111E33',
                        pointBorderWidth: 2,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.35,
                    },
                    {
                        label: 'Forecast',
                        data: forecastData,
                        borderColor: 'rgba(6, 182, 212, 0.5)',
                        borderWidth: 1.5,
                        borderDash: [6, 4],
                        pointRadius: 0,
                        fill: false,
                        tension: 0.35,
                    },
                    {
                        label: 'Projection',
                        data: projData,
                        borderColor: '#06B6D4',
                        borderWidth: 2.5,
                        borderDash: [8, 5],
                        pointRadius: 4,
                        pointBackgroundColor: '#06B6D4',
                        pointBorderColor: '#111E33',
                        pointBorderWidth: 2,
                        pointStyle: 'triangle',
                        fill: false,
                        tension: 0.35,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10, weight: '500' } }
                    },
                    y: {
                        ticks: {
                            callback: v => Utils.shortCurrency(v),
                            font: { size: 10 }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                if (ctx.raw === null) return null;
                                return ctx.dataset.label + ': ' + Utils.currency(ctx.raw);
                            }
                        }
                    }
                }
            }
        });
    },

    // ─── Forecast Preview Chart ───
    forecastPreview(canvasId, historicalData, forecastData) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        // Destroy existing chart if any
        const existing = Chart.getChart(ctx);
        if (existing) existing.destroy();

        const labels = ['Oct','Nov','Dec','Jan','Feb','Mar','Apr','May*','Jun*','Jul*'];
        const hist = historicalData || [245000, 252000, 268000, 255000, 260000, 265000, 270000];
        const fcast = forecastData || [null, null, null, null, null, null, null, 283500, 297675, 312559];

        // Bridge line (connects last historical to first forecast)
        const bridge = hist.map((v, i) => i === hist.length - 1 ? v : null);
        bridge.push(fcast.find(v => v !== null));

        return new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Historical',
                        data: [...hist, null, null, null],
                        borderColor: '#3B82F6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        borderWidth: 2.5,
                        pointRadius: 3,
                        pointBackgroundColor: '#3B82F6',
                        fill: true,
                        tension: 0.3,
                    },
                    {
                        label: 'Forecast',
                        data: fcast,
                        borderColor: '#06B6D4',
                        borderWidth: 2.5,
                        borderDash: [6, 4],
                        pointRadius: 5,
                        pointBackgroundColor: '#06B6D4',
                        pointStyle: 'triangle',
                        fill: false,
                        tension: 0.3,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { font: { size: 10, weight: '500' } }
                    },
                    y: {
                        ticks: {
                            callback: v => Utils.shortCurrency(v),
                            font: { size: 10 }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.raw == null ? null : ctx.dataset.label + ': ' + Utils.currency(ctx.raw)
                        }
                    }
                }
            }
        });
    },

    // ─── Consolidation Preview ───
    consolidationPreview(canvasId) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;

        const existing = Chart.getChart(ctx);
        if (existing) existing.destroy();

        return new Chart(ctx, {
            type: 'bar',
            data: {
                labels: CONSOL_DATA.labels,
                datasets: [
                    {
                        label: 'Sum of Units',
                        data: CONSOL_DATA.units.map(Math.abs),
                        backgroundColor: 'rgba(59, 130, 246, 0.6)',
                        borderRadius: 4,
                        barPercentage: 0.6,
                    },
                    {
                        label: 'Consolidated',
                        data: CONSOL_DATA.consolidated.map(Math.abs),
                        backgroundColor: 'rgba(16, 185, 129, 0.6)',
                        borderRadius: 4,
                        barPercentage: 0.6,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: 'y',
                scales: {
                    x: {
                        ticks: {
                            callback: v => Utils.shortCurrency(v),
                            font: { size: 10 }
                        }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { font: { size: 11, weight: '500' } }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        align: 'end',
                        labels: {
                            boxWidth: 10,
                            boxHeight: 10,
                            padding: 12,
                            font: { size: 11, weight: '500' },
                            usePointStyle: true,
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: ctx => ctx.dataset.label + ': ' + Utils.currency(ctx.raw)
                        }
                    }
                }
            }
        });
    }
};
