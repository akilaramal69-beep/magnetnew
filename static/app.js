/**
 * PikPak Torrent Downloader - Frontend Application
 */

// ============================================
// State Management
// ============================================

const state = {
    user: null,
    currentFolder: null,
    folderStack: [],
    pollInterval: null
};

// ============================================
// API Functions
// ============================================

const api = {
    async request(endpoint, options = {}) {
        const url = `/api${endpoint}`;
        const config = {
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        if (options.body && typeof options.body === 'object') {
            config.body = JSON.stringify(options.body);
        }

        const response = await fetch(url, config);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    },

    login(username, password) {
        return this.request('/login', {
            method: 'POST',
            body: { username, password }
        });
    },

    register(username, password) {
        return this.request('/register', {
            method: 'POST',
            body: { username, password }
        });
    },

    logout() {
        return this.request('/logout', { method: 'POST' });
    },

    getUser() {
        return this.request('/user');
    },

    addDownload(url, parentId = null, name = null) {
        return this.request('/download', {
            method: 'POST',
            body: { url, parent_id: parentId, name }
        });
    },

    getTasks(phases = null) {
        let url = '/tasks';
        if (phases && phases.length) {
            url += '?' + phases.map(p => `phase=${p}`).join('&');
        }
        return this.request(url);
    },

    deleteTask(taskId, deleteFiles = false) {
        return this.request(`/tasks/${taskId}?delete_files=${deleteFiles}`, {
            method: 'DELETE'
        });
    },

    retryTask(taskId) {
        return this.request(`/tasks/${taskId}/retry`, { method: 'POST' });
    },

    getFiles(parentId = null) {
        const url = parentId ? `/files?parent_id=${parentId}` : '/files';
        return this.request(url);
    },

    getFileInfo(fileId) {
        return this.request(`/files/${fileId}`);
    },

    getDownloadUrl(fileId) {
        return this.request(`/files/${fileId}/url`);
    },

    trashFiles(ids) {
        return this.request('/files/trash', {
            method: 'POST',
            body: { ids }
        });
    }
};

// ============================================
// UI Functions
// ============================================

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-message">${message}</div>
        <button class="toast-close" onclick="this.parentElement.remove()">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.animation = 'slideIn 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

function setButtonLoading(btn, loading) {
    const text = btn.querySelector('.btn-text');
    const loader = btn.querySelector('.btn-loader');

    if (loading) {
        btn.disabled = true;
        if (text) text.classList.add('hidden');
        if (loader) loader.classList.remove('hidden');
    } else {
        btn.disabled = false;
        if (text) text.classList.remove('hidden');
        if (loader) loader.classList.add('hidden');
    }
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
        bytes /= 1024;
        i++;
    }
    return `${bytes.toFixed(1)} ${units[i]}`;
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function getFileIcon(file) {
    const kind = file.kind || '';
    const name = file.name || '';
    const mime = file.mime_type || '';

    if (kind.includes('folder')) {
        return {
            class: 'folder',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>'
        };
    }

    if (mime.startsWith('video') || /\.(mp4|mkv|avi|mov|wmv|flv|webm)$/i.test(name)) {
        return {
            class: 'video',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>'
        };
    }

    if (mime.startsWith('audio') || /\.(mp3|flac|wav|aac|ogg|m4a)$/i.test(name)) {
        return {
            class: 'audio',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>'
        };
    }

    if (mime.startsWith('image') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name)) {
        return {
            class: 'image',
            svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
        };
    }

    return {
        class: 'file',
        svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>'
    };
}

function getTaskPhase(task) {
    const phase = task.phase || '';
    if (phase.includes('RUNNING')) return { class: 'running', label: 'Downloading' };
    if (phase.includes('COMPLETE')) return { class: 'complete', label: 'Complete' };
    if (phase.includes('ERROR')) return { class: 'error', label: 'Error' };
    if (phase.includes('PENDING')) return { class: 'pending', label: 'Pending' };
    return { class: 'pending', label: phase.replace('PHASE_TYPE_', '') };
}

// ============================================
// Render Functions
// ============================================

function renderTasks(tasks) {
    const container = document.getElementById('tasks-container');

    if (!tasks || tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                <p>No active downloads</p>
                <p style="font-size: 0.85rem; margin-top: 0.5rem;">Add a magnet link to start downloading</p>
            </div>
        `;
        return;
    }

    container.innerHTML = tasks.map(task => {
        const phase = getTaskPhase(task);
        const progress = task.progress || 0;
        const name = task.name || task.file_name || 'Unknown';
        const size = task.file_size ? formatFileSize(parseInt(task.file_size)) : '';

        return `
            <div class="task-card" data-id="${task.id}">
                <div class="task-header">
                    <div class="task-name">${escapeHtml(name)}</div>
                    <span class="task-status ${phase.class}">${phase.label}</span>
                </div>
                <div class="task-progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${progress}%"></div>
                    </div>
                </div>
                <div class="task-meta">
                    <span>${size ? size : ''} ${progress > 0 ? `• ${progress}%` : ''}</span>
                    <div class="task-actions">
                        ${phase.class === 'complete' && task.file_id ? `
                            <button class="task-action-btn" onclick="viewFile('${task.file_id}')" title="View File">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                            </button>
                        ` : ''}
                        ${phase.class === 'error' ? `
                            <button class="task-action-btn" onclick="retryTask('${task.id}')" title="Retry">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                    <polyline points="23 4 23 10 17 10"/>
                                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                                </svg>
                            </button>
                        ` : ''}
                        <button class="task-action-btn danger" onclick="deleteTask('${task.id}')" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderFiles(files) {
    const container = document.getElementById('files-container');

    if (!files || files.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                </svg>
                <p>This folder is empty</p>
            </div>
        `;
        return;
    }

    // Sort: folders first, then files
    files.sort((a, b) => {
        const aIsFolder = a.kind && a.kind.includes('folder');
        const bIsFolder = b.kind && b.kind.includes('folder');
        if (aIsFolder && !bIsFolder) return -1;
        if (!aIsFolder && bIsFolder) return 1;
        return (a.name || '').localeCompare(b.name || '');
    });

    container.innerHTML = files.map(file => {
        const icon = getFileIcon(file);
        const isFolder = file.kind && file.kind.includes('folder');
        const size = file.size ? formatFileSize(parseInt(file.size)) : '';
        const date = formatDate(file.created_time);

        return `
            <div class="file-card ${isFolder ? 'folder' : 'file'}"
                 data-id="${file.id}"
                 data-name="${escapeHtml(file.name)}"
                 data-kind="${file.kind}"
                 onclick="${isFolder ? `navigateToFolder('${file.id}', '${escapeHtml(file.name)}')` : ''}">
                <div class="file-header">
                    <div class="file-icon ${icon.class}">${icon.svg}</div>
                    <div class="file-info">
                        <div class="file-name">${escapeHtml(file.name)}</div>
                        <div class="file-meta">${size} ${date ? `• ${date}` : ''}</div>
                    </div>
                </div>
                ${!isFolder ? `
                    <div class="file-actions">
                        <a href="/api/proxy/download/${file.id}" class="btn btn-sm btn-primary" onclick="event.stopPropagation();" target="_blank" download>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            Download
                        </a>
                        <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); trashFile('${file.id}')">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function renderBreadcrumb() {
    const breadcrumb = document.getElementById('breadcrumb');
    let html = `
        <button class="breadcrumb-item" onclick="navigateToFolder(null, 'Home')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Home
        </button>
    `;

    state.folderStack.forEach((folder, index) => {
        html += `
            <span class="breadcrumb-separator">›</span>
            <button class="breadcrumb-item" onclick="navigateToIndex(${index})">
                ${escapeHtml(folder.name)}
            </button>
        `;
    });

    breadcrumb.innerHTML = html;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================
// Actions
// ============================================

async function loadTasks() {
    try {
        const phases = [
            'PHASE_TYPE_RUNNING',
            'PHASE_TYPE_PENDING',
            'PHASE_TYPE_ERROR',
            'PHASE_TYPE_COMPLETE'
        ];
        const data = await api.getTasks(phases);
        renderTasks(data.tasks || []);
    } catch (error) {
        console.error('Failed to load tasks:', error);
        showToast('Failed to load tasks', 'error');
    }
}

async function loadFiles(parentId = null) {
    const container = document.getElementById('files-container');
    container.innerHTML = `
        <div class="loading-placeholder">
            <div class="spinner"></div>
            <p>Loading files...</p>
        </div>
    `;

    try {
        const data = await api.getFiles(parentId);
        renderFiles(data.files || []);
    } catch (error) {
        console.error('Failed to load files:', error);
        showToast('Failed to load files', 'error');
        renderFiles([]);
    }
}

async function addDownload() {
    const input = document.getElementById('magnet-input');
    const url = input.value.trim();

    if (!url) {
        showToast('Please enter a magnet link', 'error');
        return;
    }

    if (!url.startsWith('magnet:') && !url.startsWith('http')) {
        showToast('Please enter a valid magnet link or URL', 'error');
        return;
    }

    try {
        await api.addDownload(url);
        input.value = '';
        showToast('Download added successfully!', 'success');
        loadTasks();
    } catch (error) {
        console.error('Failed to add download:', error);
        showToast(error.message || 'Failed to add download', 'error');
    }
}

async function deleteTask(taskId) {
    if (!confirm('Delete this task?')) return;

    try {
        await api.deleteTask(taskId, false);
        showToast('Task deleted', 'success');
        loadTasks();
    } catch (error) {
        console.error('Failed to delete task:', error);
        showToast('Failed to delete task', 'error');
    }
}

async function retryTask(taskId) {
    try {
        await api.retryTask(taskId);
        showToast('Retrying download...', 'info');
        loadTasks();
    } catch (error) {
        console.error('Failed to retry task:', error);
        showToast('Failed to retry task', 'error');
    }
}

async function viewFile(fileId) {
    if (!fileId) return;

    // Switch to files tab
    document.querySelector('.tab[data-tab="files"]').click();

    // Try to find the file's parent folder (requires getting file info)
    try {
        const fileInfo = await api.getFileInfo(fileId);
        if (fileInfo && fileInfo.parent_id) {
            // If it's in a subfolder, we might need more logic to reconstruct the path
            // For now, let's just go to the parent folder
            navigateToFolder(fileInfo.parent_id, '...');
        } else {
            // It's in root
            navigateToFolder(null, 'Home');
        }
    } catch (error) {
        console.error('Failed to view file:', error);
        // Fallback to root
        navigateToFolder(null, 'Home');
    }
}

async function downloadFile(fileId) {
    try {
        showToast('Getting download link...', 'info');
        const data = await api.getDownloadUrl(fileId);

        // Try different URL fields
        const url = data.web_content_link ||
            (data.medias && data.medias[0] && data.medias[0].link && data.medias[0].link.url) ||
            (data.links && Object.values(data.links)[0] && Object.values(data.links)[0].url);

        if (url) {
            window.open(url, '_blank');
        } else {
            console.log('Download data:', data);
            showToast('Download link not available', 'error');
        }
    } catch (error) {
        console.error('Failed to get download link:', error);
        showToast('Failed to get download link', 'error');
    }
}

async function trashFile(fileId) {
    if (!confirm('Move this file to trash?')) return;

    try {
        await api.trashFiles([fileId]);
        showToast('File moved to trash', 'success');
        loadFiles(state.currentFolder);
    } catch (error) {
        console.error('Failed to trash file:', error);
        showToast('Failed to trash file', 'error');
    }
}

function navigateToFolder(folderId, folderName) {
    if (folderId === null) {
        // Going to root
        state.currentFolder = null;
        state.folderStack = [];
    } else {
        state.currentFolder = folderId;
        state.folderStack.push({ id: folderId, name: folderName });
    }

    renderBreadcrumb();
    loadFiles(state.currentFolder);
}

function navigateToIndex(index) {
    // Navigate to specific folder in stack
    state.folderStack = state.folderStack.slice(0, index + 1);
    state.currentFolder = state.folderStack[index].id;
    renderBreadcrumb();
    loadFiles(state.currentFolder);
}

// ============================================
// Event Handlers
// ============================================

// Auth Toggle Logic
let isRegister = false;
document.getElementById('toggle-auth').addEventListener('click', (e) => {
    e.preventDefault();
    isRegister = !isRegister;

    const title = document.getElementById('auth-title');
    const btn = document.getElementById('auth-btn');
    const toggleText = document.getElementById('toggle-text');

    if (isRegister) {
        title.textContent = 'Create Account';
        btn.querySelector('.btn-text').textContent = 'Register';
        toggleText.innerHTML = 'Already have an account? <a href="#" id="toggle-auth-link">Sign in</a>';
    } else {
        title.textContent = 'Sign In';
        btn.querySelector('.btn-text').textContent = 'Sign In';
        toggleText.innerHTML = 'New user? <a href="#" id="toggle-auth-link">Create an account</a>';
    }

    // Re-bind the toggle link since we replaced innerHTML
    document.getElementById('toggle-auth-link').addEventListener('click', (ev) => {
        ev.preventDefault();
        document.getElementById('toggle-auth').click();
    });
});

document.getElementById('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const btn = document.getElementById('auth-btn');
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    setButtonLoading(btn, true);

    try {
        if (isRegister) {
            await api.register(username, password);
            showToast('Account created! Please sign in.', 'success');
            // Switch back to login
            document.getElementById('toggle-auth').click();
        } else {
            const data = await api.login(username, password);
            state.user = data.user;
            document.getElementById('user-display').textContent = state.user.username;
            showScreen('dashboard-screen');
            showToast('Welcome back!', 'success');

            // Load initial data
            loadTasks();
            loadFiles();

            // Start polling for task updates
            if (state.pollInterval) clearInterval(state.pollInterval);
            state.pollInterval = setInterval(loadTasks, 10000);
        }
    } catch (error) {
        console.error('Auth failed:', error);
        showToast(error.message || 'Authentication failed', 'error');
    } finally {
        setButtonLoading(btn, false);
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    try {
        await api.logout();
    } catch (e) {
        // Ignore logout errors
    }

    // Clear state
    state.user = null;
    state.currentFolder = null;
    state.folderStack = [];

    if (state.pollInterval) {
        clearInterval(state.pollInterval);
        state.pollInterval = null;
    }

    // Clear form
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';

    showScreen('login-screen');
    showToast('Logged out successfully', 'info');
});

document.getElementById('add-download-btn').addEventListener('click', addDownload);

document.getElementById('magnet-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addDownload();
    }
});

document.getElementById('refresh-tasks-btn').addEventListener('click', loadTasks);
document.getElementById('refresh-files-btn').addEventListener('click', () => loadFiles(state.currentFolder));

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;

        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(`${tabId}-tab`).classList.add('active');
    });
});

// Check if already logged in (on page load)
async function checkAuth() {
    try {
        const user = await api.getUser();
        state.user = user;
        document.getElementById('user-display').textContent = state.user.username;
        showScreen('dashboard-screen');
        loadTasks();
        loadFiles();
        state.pollInterval = setInterval(loadTasks, 10000);
    } catch (e) {
        // Not logged in, show login screen
        showScreen('login-screen');
    }
}

// Initialize
checkAuth();
