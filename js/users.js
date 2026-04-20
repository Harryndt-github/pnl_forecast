/* ═══════════════════════════════════════════════════════════════
   PNL FORECAST — Phân Hệ Quản Lý Người Dùng
   ═══════════════════════════════════════════════════════════════ */

const UserManager = {
    users: [],

    init() {
        this.fetchUsers();
    },

    async fetchUsers() {
        try {
            const res = await fetch('/api/admin/users');
            if (res.ok) {
                const data = await res.json();
                this.users = data.users || [];
                this.renderUsers();
            } else {
                console.warn('Bạn không có quyền xem User list');
            }
        } catch (e) {
            console.error('Error fetching users', e);
        }
    },

    renderUsers() {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;

        tbody.innerHTML = this.users.map(u => `
            <tr>
                <td><strong>${u.username}</strong></td>
                <td><span class="badge ${u.role === 'admin' ? 'badge-primary' : 'badge-neutral'}">${u.role.toUpperCase()}</span></td>
                <td>${(u.allowed_chains || []).join(', ') || 'Tất cả (nếu trống)'}</td>
                <td>${(u.allowed_pcs || []).join(', ') || 'Tất cả (nếu trống)'}</td>
                <td style="text-align: right;">
                    <button class="btn btn-outline btn-sm" onclick="UserManager.openEditModal('${u.username}')">Sửa</button>
                    ${u.username.toLowerCase() !== 'admin' ? `
                    <button class="btn btn-primary btn-sm" style="background:#dc2626;" onclick="UserManager.deleteUser('${u.username}')">Xóa</button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    },

    openCreateModal() {
        document.getElementById('modalUserTitle').innerText = 'Tạo Người dùng Mới';
        document.getElementById('m_username').value = '';
        document.getElementById('m_username').disabled = false;
        document.getElementById('m_password').value = '';
        document.getElementById('m_role').value = 'user';
        document.getElementById('m_chains').value = '';
        document.getElementById('m_pcs').value = '';
        document.getElementById('userModal').style.display = 'flex';
    },

    openEditModal(username) {
        const u = this.users.find(x => x.username === username);
        if(!u) return;

        document.getElementById('modalUserTitle').innerText = 'Chỉnh sửa Người dùng';
        document.getElementById('m_username').value = u.username;
        document.getElementById('m_username').disabled = true;
        document.getElementById('m_password').value = '';
        document.getElementById('m_password').placeholder = 'Bỏ trống nếu không muốn đổi';
        document.getElementById('m_role').value = u.role;
        document.getElementById('m_chains').value = (u.allowed_chains || []).join(', ');
        document.getElementById('m_pcs').value = (u.allowed_pcs || []).join(', ');
        document.getElementById('userModal').style.display = 'flex';
    },

    closeModal() {
        document.getElementById('userModal').style.display = 'none';
    },

    async saveUser() {
        const username = document.getElementById('m_username').value;
        const password = document.getElementById('m_password').value;
        const role = document.getElementById('m_role').value;
        
        const chainRaw = document.getElementById('m_chains').value;
        const pcsRaw = document.getElementById('m_pcs').value;

        const allowed_chains = chainRaw.split(',').map(s=>s.trim()).filter(s=>s.length > 0);
        const allowed_pcs = pcsRaw.split(',').map(s=>s.trim()).filter(s=>s.length > 0);

        const isNew = !document.getElementById('m_username').disabled;

        const payload = {
            action: isNew ? 'create' : 'update',
            username, role, allowed_chains, allowed_pcs
        };
        if(password) payload.password = password;

        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            if(res.ok) {
                alert('Thành công!');
                this.closeModal();
                this.fetchUsers();
            } else {
                alert('Lỗi: ' + data.message);
            }
        } catch(e) {
            alert('Lỗi kết nối máy chủ');
        }
    },

    async deleteUser(username) {
        if(!confirm(`Bạn có chắc chắn muốn xóa ${username} không?`)) return;

        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'delete', username })
            });
            if(res.ok) {
                this.fetchUsers();
            } else {
                alert('Xóa thất bại');
            }
        } catch(e) {
            alert('Lỗi kết nối máy chủ');
        }
    }
};
