/* ═══════════════════════════════════════════════════════════════
   PNL FORECAST — Module 3: Onboarding & Data Ingestion
   ═══════════════════════════════════════════════════════════════ */

const Onboarding = {
    currentStep: 1,
    uploadedFiles: [],
    mappings: {},

    init() {
        this.bindEvents();
        this.renderValidation();
    },

    // ─── Step Navigation ───
    goToStep(step) {
        this.currentStep = step;

        // Update stepper
        document.querySelectorAll('.step').forEach(s => {
            const sNum = parseInt(s.dataset.step);
            s.classList.toggle('active', sNum === step);
            s.classList.toggle('completed', sNum < step);
        });

        // Update phases
        for (let i = 1; i <= 3; i++) {
            const phase = document.getElementById('phase' + i);
            if (phase) phase.classList.toggle('active', i === step);
        }
    },

    // ─── Simulate File Upload ───
    simulateUpload(files) {
        const fileList = document.getElementById('fileList');
        const uploadedArea = document.getElementById('uploadedFiles');
        const uploadZone = document.getElementById('uploadZone');

        if (!fileList || !uploadedArea) return;

        // Show uploaded files area
        uploadedArea.classList.remove('hidden');

        // Generate file items
        const mockFiles = files || [
            { name: 'GL_Export_Q1_2026.xlsx', size: '2.4 MB' },
            { name: 'Trial_Balance_Mar2026.csv', size: '856 KB' },
        ];

        this.uploadedFiles = mockFiles;

        fileList.innerHTML = mockFiles.map(file => {
            const ext = file.name.split('.').pop().toUpperCase();
            return `<div class="file-item">
                <div class="file-icon">${ext}</div>
                <div class="file-info">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${file.size}</div>
                </div>
                <span class="file-status">✓ Ready</span>
            </div>`;
        }).join('');

        // Animate upload zone collapse
        if (uploadZone) {
            uploadZone.style.padding = '20px';
            uploadZone.innerHTML = `
                <div style="display:flex;align-items:center;gap:12px;color:var(--positive-text)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
                        <path d="M22 11.08V12a10 10 0 11-5.93-9.14"/>
                        <polyline points="22 4 12 14.01 9 11.01"/>
                    </svg>
                    <span style="font-weight:600">${mockFiles.length} file(s) uploaded successfully</span>
                </div>`;
        }
    },

    // ─── Render Validation Table ───
    renderValidation() {
        const tbody = document.getElementById('validationBody');
        if (!tbody) return;

        tbody.innerHTML = VALIDATION_ROWS.map(row => {
            let statusClass, statusText;
            switch (row.status) {
                case 'verified':
                    statusClass = 'status-verified';
                    statusText = '✓ Verified';
                    break;
                case 'warning':
                    statusClass = 'status-warning';
                    statusText = '⚠ Warning';
                    break;
                case 'error':
                    statusClass = 'status-error';
                    statusText = '✕ Error';
                    break;
            }

            return `<tr>
                <td>#${row.row}</td>
                <td class="${statusClass}">${statusText}</td>
                <td style="font-family:var(--mono);color:var(--accent-cyan)">${row.gl || '—'}</td>
                <td>${row.amount != null ? Utils.currency(row.amount) : '—'}</td>
                <td style="font-size:0.78rem;color:var(--text-muted)">${row.issue}</td>
            </tr>`;
        }).join('');
    },

    // ─── Bind Events ───
    bindEvents() {
        // Upload zone interactions
        const uploadZone = document.getElementById('uploadZone');
        const fileInput = document.getElementById('fileInput');
        const browseBtn = document.getElementById('browseBtn');

        if (uploadZone) {
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
                this.simulateUpload();
                Utils.toast('Files uploaded successfully', 'success');
            });

            uploadZone.addEventListener('click', (e) => {
                if (e.target.closest('.upload-browse') || e.target === uploadZone) {
                    fileInput?.click();
                }
            });
        }

        if (browseBtn) {
            browseBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                fileInput?.click();
            });
        }

        if (fileInput) {
            fileInput.addEventListener('change', () => {
                this.simulateUpload();
                Utils.toast('Files uploaded successfully', 'success');
            });
        }

        // Step navigation buttons
        const proceedMapping = document.getElementById('proceedMapping');
        if (proceedMapping) {
            proceedMapping.addEventListener('click', () => {
                this.goToStep(2);
                Utils.toast('Proceed to column mapping', 'info');
            });
        }

        const proceedValidation = document.getElementById('proceedValidation');
        if (proceedValidation) {
            proceedValidation.addEventListener('click', () => {
                this.goToStep(3);
                Utils.toast('Validating data...', 'info');
            });
        }

        const backToUpload = document.getElementById('backToUpload');
        if (backToUpload) {
            backToUpload.addEventListener('click', () => this.goToStep(1));
        }

        const backToMapping = document.getElementById('backToMapping');
        if (backToMapping) {
            backToMapping.addEventListener('click', () => this.goToStep(2));
        }

        const finalizeImport = document.getElementById('finalizeImport');
        if (finalizeImport) {
            finalizeImport.addEventListener('click', () => {
                Utils.toast('Import finalized! 847 records ingested.', 'success');
            });
        }

        // Drag and drop mapping
        this.initDragDrop();
    },

    // ─── Drag & Drop Mapping ───
    initDragDrop() {
        const draggables = document.querySelectorAll('.mapping-item.draggable');
        const slots = document.querySelectorAll('.mapping-slot');

        draggables.forEach(item => {
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', item.dataset.col);
                item.style.opacity = '0.5';
            });

            item.addEventListener('dragend', () => {
                item.style.opacity = '1';
            });
        });

        slots.forEach(slot => {
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                slot.classList.add('drag-over');
            });

            slot.addEventListener('dragleave', () => {
                slot.classList.remove('drag-over');
            });

            slot.addEventListener('drop', (e) => {
                e.preventDefault();
                slot.classList.remove('drag-over');

                const colName = e.dataTransfer.getData('text/plain');
                const targetField = slot.dataset.target;

                // Update slot visual
                slot.classList.add('mapped');
                const dropSpan = slot.querySelector('.slot-drop');
                if (dropSpan) {
                    dropSpan.className = 'slot-mapped-name';
                    dropSpan.textContent = '✓ ' + colName;
                }

                // Mark source as mapped
                const source = document.querySelector(`.mapping-item[data-col="${colName}"]`);
                if (source) source.classList.add('mapped');

                this.mappings[targetField] = colName;
                Utils.toast(`Mapped "${colName}" → ${targetField}`, 'success');
            });
        });
    },

    destroy() {
        // Cleanup if needed
    }
};
