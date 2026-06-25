// ── STATE ──────────────────────────────────────────────────────────
let notes = [];
let pendingFiles = [];
let noteToDeleteId = null;
let currentSort = { column: 'createdAt', direction: 'desc' };
let currentTabFilter = 'all';
let selectedIds = new Set();
let lastDeleted = null;
let undoTimer = null;
const DRAFT_KEY = 'orderManagerDraft';

// ── API ────────────────────────────────────────────────────────────
async function apiGet(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(r.status);
    return r;
}

async function apiPost(path, body, contentType) {
    const opts = { method: 'POST', body };
    if (contentType) opts.headers = { 'Content-Type': contentType };
    const r = await fetch(path, opts);
    if (!r.ok) throw new Error(r.status);
    return r;
}

async function apiDelete(path) {
    await fetch(path, { method: 'DELETE' });
}

// ── PERSISTENCE ────────────────────────────────────────────────────
async function loadNotes() {
    try {
        const r = await apiGet('/api/orders');
        notes = await r.json();
        notes.forEach(n => {
            if (!n.files)   n.files   = [];
            if (!n.dueDate) n.dueDate = '';
        });
    } catch { notes = []; }
}

async function saveNotesToStorage() {
    try {
        await apiPost('/api/orders', JSON.stringify(notes, null, 2), 'application/json');
    } catch (e) { console.error('Erro ao salvar pedidos', e); }
}

async function saveFileToDisk(file, overrideId) {
    const id    = overrideId || ('file_' + crypto.randomUUID());
    const safe  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
    const fname = id + '__' + safe;
    await apiPost(`/api/files/${encodeURIComponent(fname)}`, file, file.type || 'application/octet-stream');
    return { id, name: file.name, fname };
}

async function deleteFileFromDisk(fname) {
    if (!fname) return;
    try { await apiDelete(`/api/files/${encodeURIComponent(fname)}`); } catch {}
}

async function clearAllFilesFromDisk() {
    try { await apiDelete('/api/files'); } catch {}
}

// ── INIT ───────────────────────────────────────────────────────────
window.onload = async () => {
    const ok = await checkServer();
    if (ok) {
        await loadNotes();
    }
    renderTable();
    setupDragDrop();
    setupShortcuts();
    setupSearch();
    document.addEventListener('click', e => {
        if (!e.target.closest('#filesPopover') && !e.target.closest('.files-badge')) hidePopover();
    });
    document.getElementById('btnConfirmDelete').addEventListener('click', () => {
        if (!noteToDeleteId) return;
        performDelete(noteToDeleteId);
        closeModal();
    });
};

async function checkServer() {
    try {
        await fetch('/api/orders');
        return true;
    } catch {
        document.getElementById('offlineBanner').style.display = 'flex';
        return false;
    }
}

function setupShortcuts() {
    document.addEventListener('keydown', e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') handleMainAction();
        if (e.key === 'Escape') {
            if (document.getElementById('confirmModal').classList.contains('show')) closeModal();
            else closeDrawer();
        }
    });
}

function setupSearch() {
    let timer;
    document.getElementById('searchInput').addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(renderTable, 150);
    });
}

// ── DRAWER ─────────────────────────────────────────────────────────
function openDrawer(isEdit = false) {
    if (!isEdit) restoreDraft();
    document.getElementById('formDrawer').classList.add('open');
    document.getElementById('drawerBackdrop').classList.add('open');
    setTimeout(() => document.getElementById('poInput').focus(), 220);
}

function closeDrawer() {
    document.getElementById('formDrawer').classList.remove('open');
    document.getElementById('drawerBackdrop').classList.remove('open');
    resetForm();
}

// ── DRAFT AUTO-SAVE ────────────────────────────────────────────────
function saveDraft() {
    if (document.getElementById('noteId').value) return;
    const draft = {
        po:      document.getElementById('poInput').value,
        so:      document.getElementById('soInput').value,
        rep:     document.getElementById('repInput').value,
        status:  document.getElementById('statusInput').value,
        content: document.getElementById('noteInput').value,
        dueDate: document.getElementById('dueDateInput').value,
    };
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    const badge = document.getElementById('draftBadge');
    badge.classList.add('visible');
    setTimeout(() => badge.classList.remove('visible'), 1500);
}

function restoreDraft() {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
        const d = JSON.parse(raw);
        document.getElementById('poInput').value      = d.po || '';
        document.getElementById('soInput').value      = d.so || '';
        document.getElementById('repInput').value     = d.rep || '';
        document.getElementById('statusInput').value  = d.status || 'pending';
        document.getElementById('noteInput').value    = d.content || '';
        document.getElementById('dueDateInput').value = d.dueDate || '';
        if (Object.values(d).some(v => v)) showToast('Rascunho restaurado.', 'info');
    } catch {}
}

function clearDraft() { sessionStorage.removeItem(DRAFT_KEY); }

// ── DATA ───────────────────────────────────────────────────────────
function updateStatCards() {
    const pending  = notes.filter(n => (n.status || 'pending') === 'pending').length;
    const progress = notes.filter(n => n.status === 'progress').length;
    const done     = notes.filter(n => n.status === 'done').length;
    document.getElementById('statTotal').textContent    = notes.length;
    document.getElementById('statPending').textContent  = pending;
    document.getElementById('statProgress').textContent = progress;
    document.getElementById('statDone').textContent     = done;
}

// ── FILE UI ────────────────────────────────────────────────────────
function setupDragDrop() {
    const dz = document.getElementById('dropZone');
    dz.addEventListener('dragover',  e => { e.preventDefault(); dz.classList.add('drag-over'); });
    dz.addEventListener('dragleave', e => { e.preventDefault(); dz.classList.remove('drag-over'); });
    dz.addEventListener('drop',      e => { e.preventDefault(); dz.classList.remove('drag-over'); handleFileSelect(e.dataTransfer.files); });
}

function handleFileSelect(files) {
    if (!files.length) return;
    Array.from(files).forEach(f => pendingFiles.push({ type: 'new', file: f }));
    renderFileList();
}

function renderFileList() {
    const container = document.getElementById('fileListContainer');
    container.innerHTML = '';
    pendingFiles.forEach((item, i) => {
        const name = item.type === 'new' ? item.file.name : item.name;
        const size = item.type === 'new' ? formatBytes(item.file.size) : '';
        const chip = document.createElement('div');
        chip.className = 'file-chip';
        chip.innerHTML = `<span class="file-chip-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg></span>`;
        const n = document.createElement('span'); n.className = 'file-chip-name'; n.textContent = name; n.title = name;
        const s = document.createElement('span'); s.className = 'file-chip-size'; s.textContent = size;
        const r = document.createElement('span'); r.className = 'file-chip-remove'; r.textContent = '×'; r.title = 'Remover';
        r.addEventListener('click', () => removePendingFile(i));
        chip.append(n, s, r);
        container.appendChild(chip);
    });
}

function removePendingFile(index) {
    pendingFiles.splice(index, 1);
    renderFileList();
    if (!pendingFiles.some(f => f.type === 'new')) document.getElementById('fileInput').value = '';
}

function clearFileSelection() {
    pendingFiles = [];
    document.getElementById('fileInput').value = '';
    renderFileList();
}

// ── CRUD ───────────────────────────────────────────────────────────
async function handleMainAction() {
    const btn = document.getElementById('mainBtn');
    const orig = document.getElementById('btnText').textContent;
    btn.disabled = true;
    document.getElementById('btnText').textContent = 'Salvando…';
    try {
        if (document.getElementById('noteId').value) await updateNote();
        else await addNote();
    } catch (e) {
        console.error(e);
        showToast('Erro ao processar.', 'error');
    } finally {
        btn.disabled = false;
        document.getElementById('btnText').textContent = orig;
    }
}

async function processPendingFiles() {
    const out = [];
    for (const item of pendingFiles) {
        if (item.type === 'existing') out.push({ id: item.id, name: item.name, fname: item.fname });
        else out.push(await saveFileToDisk(item.file));
    }
    return out;
}

async function addNote() {
    const po      = document.getElementById('poInput').value.trim();
    const so      = document.getElementById('soInput').value.trim();
    const rep     = document.getElementById('repInput').value.trim();
    const content = document.getElementById('noteInput').value.trim();
    const status  = document.getElementById('statusInput').value;
    const dueDate = document.getElementById('dueDateInput').value;

    if (!po && !so && !content && pendingFiles.length === 0) {
        showToast('Preencha ao menos um campo.', 'error'); return;
    }

    const savedFiles = await processPendingFiles();
    const now = new Date();
    notes.unshift({
        id: crypto.randomUUID(),
        po: po || '-', so: so || '-', rep: rep || '-',
        content: content || '', status: status || 'pending',
        dueDate, files: savedFiles,
        createdAt: now.toISOString(), updatedAt: now.toISOString()
    });
    await saveNotesToStorage();
    clearDraft();
    renderTable();
    closeDrawer();
    showToast('Pedido criado!', 'success');
}

async function updateNote() {
    const id    = document.getElementById('noteId').value;
    const index = notes.findIndex(n => n.id === id);
    if (index === -1) return;

    const oldFiles   = notes[index].files || [];
    const savedFiles = await processPendingFiles();
    const keptFnames = new Set(savedFiles.map(f => f.fname));
    oldFiles.forEach(f => { if (!keptFnames.has(f.fname)) deleteFileFromDisk(f.fname); });

    notes[index].po      = document.getElementById('poInput').value.trim()  || '-';
    notes[index].so      = document.getElementById('soInput').value.trim()  || '-';
    notes[index].rep     = document.getElementById('repInput').value.trim() || '-';
    notes[index].content = document.getElementById('noteInput').value.trim();
    notes[index].status  = document.getElementById('statusInput').value;
    notes[index].dueDate = document.getElementById('dueDateInput').value;
    notes[index].files   = savedFiles;
    notes[index].updatedAt = new Date().toISOString();

    await saveNotesToStorage();
    renderTable();
    closeDrawer();
    showToast('Pedido atualizado!', 'success');
}

function editNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    document.getElementById('noteId').value       = note.id;
    document.getElementById('poInput').value      = note.po !== '-' ? note.po : '';
    document.getElementById('soInput').value      = note.so !== '-' ? note.so : '';
    document.getElementById('repInput').value     = note.rep !== '-' ? note.rep : '';
    document.getElementById('noteInput').value    = note.content;
    document.getElementById('statusInput').value  = note.status || 'pending';
    document.getElementById('dueDateInput').value = note.dueDate || '';
    clearFileSelection();
    (note.files || []).forEach(f => pendingFiles.push({ type: 'existing', id: f.id, name: f.name, fname: f.fname }));
    renderFileList();
    document.getElementById('drawerTitle').textContent     = 'Editar Pedido';
    document.getElementById('drawerSubtitle').textContent  = `PO: ${note.po} · SO: ${note.so}`;
    document.getElementById('btnText').textContent         = 'Salvar Alterações';
    document.getElementById('btnCancelEdit').style.display = 'block';
    openDrawer(true);
}

function duplicateNote(id) {
    const note = notes.find(n => n.id === id);
    if (!note) return;
    const now = new Date();
    const copy = { ...JSON.parse(JSON.stringify(note)), id: crypto.randomUUID(), files: [], createdAt: now.toISOString(), updatedAt: now.toISOString() };
    const idx = notes.findIndex(n => n.id === id);
    notes.splice(idx + 1, 0, copy);
    saveNotesToStorage();
    renderTable();
    showToast('Pedido duplicado.', 'info');
}

function toggleStatus(id) {
    const index = notes.findIndex(n => n.id === id);
    if (index === -1) return;
    const map = { pending: 'progress', progress: 'done', done: 'pending' };
    notes[index].status    = map[notes[index].status || 'pending'];
    notes[index].updatedAt = new Date().toISOString();
    saveNotesToStorage();
    renderTable();
}

function confirmDelete(id) {
    noteToDeleteId = id;
    document.getElementById('confirmModal').classList.add('show');
}
function closeModal() {
    document.getElementById('confirmModal').classList.remove('show');
    noteToDeleteId = null;
}

function performDelete(id) {
    const index = notes.findIndex(n => n.id === id);
    if (index === -1) return;
    lastDeleted = { note: notes[index], index };
    notes.splice(index, 1);
    saveNotesToStorage();
    selectedIds.delete(id);
    renderTable();

    if (undoTimer) clearTimeout(undoTimer);
    const el = showToastWithUndo('Pedido apagado.', 'error', undoDelete);
    undoTimer = setTimeout(() => {
        if (lastDeleted?.note?.files) lastDeleted.note.files.forEach(f => deleteFileFromDisk(f.fname));
        lastDeleted = null;
        el?.remove();
    }, 5000);
}

function undoDelete() {
    if (!lastDeleted) return;
    clearTimeout(undoTimer);
    notes.splice(lastDeleted.index, 0, lastDeleted.note);
    lastDeleted = null;
    saveNotesToStorage();
    renderTable();
    showToast('Pedido restaurado!', 'success');
}

// ── BULK ACTIONS ───────────────────────────────────────────────────
function toggleRowSelect(id, checked) {
    if (checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateBulkBar();
    const tr = document.querySelector(`tr[data-note-id="${id}"]`);
    if (tr) tr.classList.toggle('row-selected', checked);
}

function toggleSelectAll(checked) {
    document.querySelectorAll('[data-row-cb]').forEach(cb => {
        const id = cb.dataset.rowCb;
        cb.checked = checked;
        if (checked) selectedIds.add(id); else selectedIds.delete(id);
        const tr = document.querySelector(`tr[data-note-id="${id}"]`);
        if (tr) tr.classList.toggle('row-selected', checked);
    });
    updateBulkBar();
}

function updateBulkBar() {
    const n = selectedIds.size;
    document.getElementById('bulkCount').textContent = `${n} selecionado${n !== 1 ? 's' : ''}`;
    document.getElementById('bulkBar').classList.toggle('visible', n > 0);
}

function clearSelection() {
    selectedIds.clear();
    document.querySelectorAll('[data-row-cb]').forEach(cb => cb.checked = false);
    document.getElementById('selectAllCb').checked = false;
    document.querySelectorAll('tr.row-selected').forEach(tr => tr.classList.remove('row-selected'));
    updateBulkBar();
}

function applyBulkStatus() {
    const status = document.getElementById('bulkStatusSelect').value;
    if (!status) { showToast('Escolha um status para aplicar.', 'warn'); return; }
    selectedIds.forEach(id => {
        const idx = notes.findIndex(n => n.id === id);
        if (idx !== -1) { notes[idx].status = status; notes[idx].updatedAt = new Date().toISOString(); }
    });
    saveNotesToStorage();
    clearSelection();
    renderTable();
    showToast('Status atualizado.', 'success');
    document.getElementById('bulkStatusSelect').value = '';
}

function bulkDelete() {
    const count = selectedIds.size;
    if (!count) return;
    if (!confirm(`Apagar ${count} pedido${count > 1 ? 's' : ''} selecionado${count > 1 ? 's' : ''}? Esta ação é permanente.`)) return;
    selectedIds.forEach(id => {
        const note = notes.find(n => n.id === id);
        if (note?.files) note.files.forEach(f => deleteFileFromDisk(f.fname));
    });
    notes = notes.filter(n => !selectedIds.has(n.id));
    saveNotesToStorage();
    clearSelection();
    renderTable();
    showToast(`${count} pedido${count > 1 ? 's' : ''} apagado${count > 1 ? 's' : ''}.`, 'error');
}

// ── FILTER / SORT ──────────────────────────────────────────────────
function setTabFilter(tab) {
    currentTabFilter = tab;
    document.querySelectorAll('.filter-tab').forEach(el => el.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.querySelectorAll('.stat-card').forEach(el => el.classList.remove('active-filter'));
    document.getElementById(`card-${tab}`).classList.add('active-filter');
    renderTable();
}

function sortTable(col) {
    currentSort.direction = currentSort.column === col ? (currentSort.direction === 'asc' ? 'desc' : 'asc') : 'asc';
    currentSort.column = col;
    renderTable();
}

function clearSearch() { document.getElementById('searchInput').value = ''; renderTable(); }
function clearDateFilter(which) {
    document.getElementById(which === 'from' ? 'filterDateFrom' : 'filterDateTo').value = '';
    renderTable();
}

// ── RENDER ─────────────────────────────────────────────────────────
function renderTable() {
    updateStatCards();
    const tbody      = document.getElementById('notesTableBody');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase().trim();
    const dateFrom   = document.getElementById('filterDateFrom').value;
    const dateTo     = document.getElementById('filterDateTo').value;
    document.getElementById('clearSearchBtn').style.display = searchTerm ? 'block' : 'none';
    tbody.innerHTML = '';

    let filtered = notes.filter(n => currentTabFilter === 'all' || (n.status || 'pending') === currentTabFilter);
    if (searchTerm) {
        filtered = filtered.filter(n => {
            const filesText = (n.files || []).map(f => f.name).join(' ');
            return (n.po + n.so + n.rep + n.content + filesText + getStatusLabel(n.status)).toLowerCase().includes(searchTerm);
        });
    }
    if (dateFrom) filtered = filtered.filter(n => n.createdAt && n.createdAt.slice(0,10) >= dateFrom);
    if (dateTo)   filtered = filtered.filter(n => n.createdAt && n.createdAt.slice(0,10) <= dateTo);

    filtered.sort((a, b) => {
        let vA = a[currentSort.column] || '', vB = b[currentSort.column] || '';
        if (currentSort.column === 'createdAt') { vA = new Date(vA).getTime(); vB = new Date(vB).getTime(); }
        else { vA = vA.toString().toLowerCase(); vB = vB.toString().toLowerCase(); }
        if (vA < vB) return currentSort.direction === 'asc' ? -1 : 1;
        if (vA > vB) return currentSort.direction === 'asc' ?  1 : -1;
        return 0;
    });

    document.querySelectorAll('.sort-icon').forEach(el => el.textContent = '');
    const si = document.getElementById(`sort-${currentSort.column}`);
    if (si) si.textContent = currentSort.direction === 'asc' ? ' ▲' : ' ▼';

    document.getElementById('totalCount').textContent   = notes.length;
    document.getElementById('visibleCount').textContent = filtered.length;
    document.getElementById('selectAllCb').checked = filtered.length > 0 && filtered.every(n => selectedIds.has(n.id));

    if (filtered.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td'); td.colSpan = 9;
        const hasFilter = searchTerm || currentTabFilter !== 'all' || dateFrom || dateTo;
        td.innerHTML = `<div class="empty-state"><div class="empty-icon">📭</div><div class="empty-title">${hasFilter ? 'Nenhum resultado encontrado' : 'Nenhum pedido ainda'}</div><div class="empty-desc">${searchTerm ? 'Tente outros termos.' : currentTabFilter !== 'all' ? 'Sem pedidos com este status.' : dateFrom || dateTo ? 'Nenhum pedido no período.' : 'Clique em "Novo Pedido" para começar.'}</div></div>`;
        tr.appendChild(td); tbody.appendChild(tr); return;
    }

    const todayStr = new Date().toISOString().slice(0,10);
    const frag = document.createDocumentFragment();

    filtered.forEach(note => {
        const tr = document.createElement('tr');
        tr.dataset.noteId = note.id; tr.dataset.status = note.status || 'pending';
        if (selectedIds.has(note.id)) tr.classList.add('row-selected');

        // Checkbox
        const tdCb = document.createElement('td'); tdCb.className = 'cb-col';
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.dataset.rowCb = note.id; cb.checked = selectedIds.has(note.id);
        cb.addEventListener('change', e => toggleRowSelect(note.id, e.target.checked));
        tdCb.appendChild(cb);

        // Status
        const tdS = document.createElement('td');
        const pill = document.createElement('span'); pill.className = `status-pill pill-${note.status || 'pending'}`; pill.textContent = getStatusLabel(note.status); pill.title = 'Clique para avançar';
        pill.addEventListener('click', () => toggleStatus(note.id)); tdS.appendChild(pill);

        // PO
        const tdP = document.createElement('td');
        const poEl = document.createElement('span'); poEl.className = 'mono-tag po'; poEl.title = 'Clique para copiar';
        setHighlight(poEl, note.po, searchTerm); poEl.addEventListener('click', () => copyToClipboard(note.po)); tdP.appendChild(poEl);

        // SO
        const tdSo = document.createElement('td');
        const soEl = document.createElement('span'); soEl.className = 'mono-tag so'; soEl.title = 'Clique para copiar';
        setHighlight(soEl, note.so, searchTerm); soEl.addEventListener('click', () => copyToClipboard(note.so)); tdSo.appendChild(soEl);

        // Rep
        const tdR = document.createElement('td');
        const repCell = document.createElement('div'); repCell.className = 'rep-cell';
        if (note.rep && note.rep !== '-') {
            const av = document.createElement('div'); av.className = 'avatar'; av.style.background = getAvatarColor(note.rep); av.textContent = getInitials(note.rep);
            const rn = document.createElement('span'); rn.style.cssText = 'color:var(--t2);font-size:.85rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;'; rn.title = note.rep;
            setHighlight(rn, note.rep, searchTerm); repCell.append(av, rn);
        } else { repCell.innerHTML = '<span style="color:var(--t3)">—</span>'; }
        tdR.appendChild(repCell);

        // Content
        const tdC = document.createElement('td');
        const cc = document.createElement('div'); cc.className = 'content-cell'; cc.title = note.content.length > 60 ? 'Clique para expandir' : note.content;
        if (note.content) setHighlight(cc, note.content, searchTerm); else { cc.textContent = '—'; cc.style.color = 'var(--t3)'; }
        if (note.content.length > 60) cc.addEventListener('click', () => tr.classList.toggle('row-expanded'));
        tdC.appendChild(cc);

        // Files
        const tdF = document.createElement('td');
        if (note.files && note.files.length > 0) {
            const badge = document.createElement('span'); badge.className = 'files-badge';
            badge.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/></svg>`;
            badge.appendChild(document.createTextNode(` ${note.files.length}`));
            badge.addEventListener('click', e => showFilesPopover(e, note.files)); tdF.appendChild(badge);
        } else { const dash = document.createElement('span'); dash.className = 'files-none'; dash.textContent = '—'; tdF.appendChild(dash); }

        // Date
        const tdD = document.createElement('td');
        const dWrap = document.createElement('div'); dWrap.className = 'date-cell';
        const pDate = document.createElement('div'); pDate.className = 'primary'; pDate.textContent = relativeTime(note.createdAt); pDate.title = formatDateDisplay(note.createdAt);
        dWrap.appendChild(pDate);
        if (note.updatedAt && note.updatedAt !== note.createdAt) {
            const upd = document.createElement('div'); upd.className = 'secondary'; upd.textContent = 'editado ' + relativeTime(note.updatedAt); upd.title = formatDateDisplay(note.updatedAt);
            dWrap.appendChild(upd);
        }
        if (note.dueDate) {
            const dueBadge = document.createElement('span');
            const isOverdue = note.dueDate < todayStr && note.status !== 'done';
            const isToday   = note.dueDate === todayStr;
            const daysDiff  = Math.ceil((new Date(note.dueDate) - new Date(todayStr)) / 86400000);
            if (isOverdue)       { dueBadge.className = 'due-badge due-overdue'; dueBadge.textContent = `⚠ Atrasado`; }
            else if (isToday)    { dueBadge.className = 'due-badge due-today';   dueBadge.textContent = `⏰ Hoje`; }
            else if (daysDiff <= 3) { dueBadge.className = 'due-badge due-soon'; dueBadge.textContent = `${daysDiff}d restantes`; }
            else { dueBadge.className = 'due-ok'; dueBadge.textContent = `Entrega: ${formatDateDisplay(note.dueDate)}`; }
            dWrap.appendChild(dueBadge);
        }
        tdD.appendChild(dWrap);

        // Actions
        const tdA = document.createElement('td');
        const actions = document.createElement('div'); actions.className = 'row-actions';
        const editBtn = document.createElement('button'); editBtn.className = 'btn-icon'; editBtn.title = 'Editar';
        editBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
        editBtn.addEventListener('click', () => editNote(note.id));
        const copyBtn = document.createElement('button'); copyBtn.className = 'btn-icon'; copyBtn.title = 'Duplicar';
        copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
        copyBtn.addEventListener('click', () => duplicateNote(note.id));
        const delBtn = document.createElement('button'); delBtn.className = 'btn-icon danger'; delBtn.title = 'Apagar';
        delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`;
        delBtn.addEventListener('click', () => confirmDelete(note.id));
        actions.append(editBtn, copyBtn, delBtn); tdA.appendChild(actions);

        tr.append(tdCb, tdS, tdP, tdSo, tdR, tdC, tdF, tdD, tdA);
        frag.appendChild(tr);
    });
    tbody.appendChild(frag);
}

// ── SEARCH HIGHLIGHT ───────────────────────────────────────────────
function setHighlight(el, text, term) {
    el.innerHTML = '';
    if (!text) { el.textContent = ''; return; }
    if (!term) { el.textContent = text; return; }
    const lower = text.toLowerCase(), lTerm = term.toLowerCase();
    let pos = 0, idx;
    while ((idx = lower.indexOf(lTerm, pos)) !== -1) {
        if (idx > pos) el.appendChild(document.createTextNode(text.slice(pos, idx)));
        const mark = document.createElement('mark'); mark.textContent = text.slice(idx, idx + term.length); el.appendChild(mark);
        pos = idx + term.length;
    }
    if (pos < text.length) el.appendChild(document.createTextNode(text.slice(pos)));
}

// ── FILES POPOVER ──────────────────────────────────────────────────
function showFilesPopover(e, files) {
    const pop = document.getElementById('filesPopover');
    pop.innerHTML = '';
    files.forEach(f => {
        const item = document.createElement('div'); item.className = 'popover-item';
        item.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
        const sp = document.createElement('span'); sp.textContent = f.name; sp.title = f.name; item.appendChild(sp);
        item.addEventListener('click', () => { downloadFile(f.fname, f.name); hidePopover(); });
        pop.appendChild(item);
    });
    const rect = e.currentTarget.getBoundingClientRect();
    pop.style.top  = (rect.bottom + 6) + 'px';
    pop.style.left = Math.min(rect.left, window.innerWidth - 280) + 'px';
    pop.classList.add('show'); e.stopPropagation();
}
function hidePopover() { document.getElementById('filesPopover').classList.remove('show'); }

// ── EXPORT / IMPORT ────────────────────────────────────────────────
function blobToBase64(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}

function base64ToBlob(dataUrl) {
    const [hdr, b64] = dataUrl.split(',');
    const mime = hdr.match(/:(.*?);/)[1];
    const bin  = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
}

async function exportData() {
    const btn = document.getElementById('exportBtn');
    btn.disabled = true; const origHtml = btn.innerHTML; btn.innerHTML = '⏳ Exportando…';
    try {
        const filesPayload = {};
        for (const note of notes) {
            for (const f of (note.files || [])) {
                if (f.fname && !filesPayload[f.fname]) {
                    const r = await fetch(`/api/files/${encodeURIComponent(f.fname)}`);
                    if (r.ok) { const blob = await r.blob(); filesPayload[f.fname] = { name: f.name, type: blob.type, data: await blobToBase64(blob) }; }
                }
            }
        }
        const payload = { version: '6.1', exportedAt: new Date().toISOString(), notes, files: filesPayload };
        triggerDownload(new Blob([JSON.stringify(payload)], { type: 'application/json' }), `order_backup_${todayStr()}.json`);
        showToast(`Backup criado — ${notes.length} pedidos, ${Object.keys(filesPayload).length} arquivo(s).`, 'success');
    } catch (e) { console.error(e); showToast('Erro ao criar backup.', 'error'); }
    finally { btn.disabled = false; btn.innerHTML = origHtml; }
}

function exportCSV() {
    const headers = ['Status','PO','SO','Representante','Conteúdo','Arquivos','Data Entrega','Criado em','Atualizado em'];
    const rows = notes.map(n => [
        getStatusLabel(n.status), n.po, n.so, n.rep,
        (n.content || '').replace(/"/g,'""'), (n.files||[]).length,
        n.dueDate ? formatDateDisplay(n.dueDate) : '',
        formatDateDisplay(n.createdAt), formatDateDisplay(n.updatedAt)
    ].map(v => `"${v}"`).join(','));
    triggerDownload(new Blob(['﻿' + [headers.join(','),...rows].join('\r\n')], { type:'text/csv;charset=utf-8' }), `pedidos_${todayStr()}.csv`);
    showToast(`CSV exportado — ${notes.length} pedidos.`, 'success');
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function importData(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async e => {
        try {
            const parsed = JSON.parse(e.target.result);
            let importedNotes, importedFiles;
            if (Array.isArray(parsed)) { importedNotes = parsed; importedFiles = {}; }
            else if (parsed.notes) { importedNotes = parsed.notes; importedFiles = parsed.files || {}; }
            else { showToast('Arquivo inválido.', 'error'); return; }
            const fc = Object.keys(importedFiles).length;
            if (!confirm(`Restaurar ${importedNotes.length} pedidos e ${fc} arquivo(s)?\nSubstituirá todos os dados atuais.`)) return;
            await clearAllFilesFromDisk();
            for (const [fname, rec] of Object.entries(importedFiles)) {
                if (!rec.data) continue;
                const blob = base64ToBlob(rec.data);
                await apiPost(`/api/files/${encodeURIComponent(fname)}`, blob, rec.type);
            }
            notes = importedNotes;
            await saveNotesToStorage();
            renderTable();
            showToast(`Restaurado — ${importedNotes.length} pedidos, ${fc} arquivo(s).`, 'success');
        } catch (err) { console.error(err); showToast('Erro ao ler arquivo.', 'error'); }
        input.value = '';
    };
    reader.readAsText(file);
}

// ── UTILS ──────────────────────────────────────────────────────────
function resetForm() {
    ['poInput','soInput','repInput','noteInput','noteId','dueDateInput'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('statusInput').value = 'pending';
    document.getElementById('drawerTitle').textContent     = 'Novo Pedido';
    document.getElementById('drawerSubtitle').textContent  = 'Preencha os dados abaixo';
    document.getElementById('btnText').textContent         = 'Salvar Pedido';
    document.getElementById('btnCancelEdit').style.display = 'none';
    clearFileSelection();
}

function downloadFile(fname, name) {
    const a = document.createElement('a');
    a.href = `/api/files/${encodeURIComponent(fname)}`; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function copyToClipboard(text) {
    if (!text || text === '-') return;
    navigator.clipboard.writeText(text).then(() => showToast(`Copiado: ${text}`, 'info'));
}

function getInitials(name) {
    if (!name || name === '-') return '?';
    return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(name) {
    const p = ['#7c3aed','#2563eb','#059669','#d97706','#dc2626','#db2777','#0891b2','#65a30d'];
    let h = 0; for (const c of name) h = (h * 31 + c.charCodeAt(0)) % p.length;
    return p[Math.abs(h)];
}

function getStatusLabel(s) { return { pending:'Pendente', progress:'Andamento', done:'Concluído' }[s] || 'Pendente'; }

function relativeTime(iso) {
    if (!iso) return '—';
    const diff = Math.floor((Date.now() - new Date(iso)) / 1000);
    if (diff < 60)     return 'agora';
    if (diff < 3600)   return `${Math.floor(diff/60)}min atrás`;
    if (diff < 86400)  return `${Math.floor(diff/3600)}h atrás`;
    if (diff < 172800) return 'ontem';
    if (diff < 604800) return `${Math.floor(diff/86400)}d atrás`;
    return new Date(iso).toLocaleDateString('pt-BR');
}

function formatDateDisplay(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? iso : d.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function formatBytes(bytes) {
    if (!+bytes) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes/Math.pow(1024,i)).toFixed(1)} ${['B','KB','MB','GB'][i]}`;
}

function todayStr() { return new Date().toISOString().slice(0,10); }

function showToast(msg, type = 'info') {
    const box = document.getElementById('toast-container'), el = document.createElement('div');
    el.className = `toast ${type}`;
    const dot = document.createElement('div'); dot.className = 'toast-dot';
    const txt = document.createElement('span'); txt.textContent = msg;
    el.append(dot, txt); box.appendChild(el);
    el._timer = setTimeout(() => dismissToast(el), 3500); return el;
}

function showToastWithUndo(msg, type, undoFn) {
    const box = document.getElementById('toast-container'), el = document.createElement('div');
    el.className = `toast ${type}`;
    const dot = document.createElement('div'); dot.className = 'toast-dot';
    const txt = document.createElement('span'); txt.textContent = msg;
    const undo = document.createElement('button'); undo.className = 'toast-undo'; undo.textContent = 'Desfazer';
    undo.addEventListener('click', () => { dismissToast(el); undoFn(); });
    el.append(dot, txt, undo); box.appendChild(el);
    el._timer = setTimeout(() => dismissToast(el), 5000); return el;
}

function dismissToast(el) {
    clearTimeout(el._timer);
    el.style.animation = 'toastOut .3s forwards';
    el.addEventListener('animationend', () => el.remove());
}
