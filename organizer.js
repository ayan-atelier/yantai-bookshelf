/* Flat, display-only folders. Character files and chat metadata stay with ST. */
export const PAGE_SIZES = [20, 40];
export const pageSize = value => PAGE_SIZES.includes(Number(value)) ? Number(value) : 20;
export function pageWindow(items, page, size) {
    size = pageSize(size);
    const pages = Math.max(1, Math.ceil(items.length / size));
    const current = Math.max(0, Math.min(pages - 1, Math.trunc(Number(page)) || 0));
    return { page: current, pages, items: items.slice(current * size, (current + 1) * size) };
}
export function organization(settings) {
    if (!settings.organizer || typeof settings.organizer !== 'object' || Array.isArray(settings.organizer)) settings.organizer = {};
    const data = settings.organizer;
    if (!Array.isArray(data.folders)) data.folders = [];
    if (!data.assignments || typeof data.assignments !== 'object' || Array.isArray(data.assignments)) data.assignments = {};
    return data;
}
export function foldersFor(settings) {
    const seen = new Set();
    return organization(settings).folders.filter(folder => {
        if (!folder || typeof folder.id !== 'string' || !folder.id.startsWith('folder:') || typeof folder.name !== 'string' || !folder.name.trim() || seen.has(folder.id)) return false;
        seen.add(folder.id); return true;
    });
}
// A small account setting, shared by the homepage and popup. Searches are temporary.
export function shelfView(settings, value = settings.viewState) {
    value = value && typeof value === 'object' ? value : {};
    const valid = value.scope === 'all' || value.scope === 'unfiled' || foldersFor(settings).some(f => f.id === value.scope);
    return {
        scope: valid ? value.scope : 'all',
        filter: value.filter === 'favorites' ? 'favorites' : 'all',
        page: valid && Number.isSafeInteger(value.page) && value.page >= 0 ? value.page : 0,
    };
}
export function rememberShelfView(settings, value) {
    const next = shelfView(settings, value), old = settings.viewState;
    if (old && next.scope === old.scope && next.filter === old.filter && next.page === old.page) return false;
    settings.viewState = next;
    return true;
}
export function folderOf(entity, settings, ids = new Set(foldersFor(settings).map(f => f.id))) {
    const id = organization(settings).assignments[entity.key];
    return !entity.assistant && ids.has(id) ? id : '';
}
export function filterFolder(entities, scope, settings) {
    if (scope === 'all') return entities;
    const ids = new Set(foldersFor(settings).map(f => f.id));
    return entities.filter(entity => !entity.assistant && folderOf(entity, settings, ids) === (scope === 'unfiled' ? '' : scope));
}
export function saveFolder(settings, name, id = null) {
    name = String(name).trim();
    if (!name || [...name].length > 40) throw new Error('文件夹名称请填写 1—40 个字。');
    const folders = foldersFor(settings);
    if (folders.some(f => f.id !== id && f.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('已经有同名文件夹了。');
    const data = organization(settings);
    if (id) {
        const folder = data.folders.find(f => f.id === id);
        if (!folder) throw new Error('文件夹已不存在，请重新选择。');
        folder.name = name; return id;
    }
    id = `folder:${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    data.folders.push({ id, name }); return id;
}
export function moveCards(settings, keys, target, entities) {
    const data = organization(settings);
    if (target && !foldersFor(settings).some(f => f.id === target)) throw new Error('文件夹已不存在，请重新选择。');
    let moved = 0;
    for (const key of new Set(keys)) {
        const entity = entities.get(key);
        if (!entity || entity.assistant) continue;
        if (target) data.assignments[key] = target;
        else delete data.assignments[key];
        moved++;
    }
    return moved;
}
export function removeFolder(settings, id) {
    const data = organization(settings);
    data.folders = data.folders.filter(f => f.id !== id);
    for (const [key, value] of Object.entries(data.assignments)) if (value === id) delete data.assignments[key];
}

export function attachOrganizer({ shell, settings, save, redraw, element, button, dialog }) {
    const control = element('div', 'jd-folder-control');
    const menu = element('div', 'jd-folder-menu'); menu.hidden = true;
    menu.setAttribute('role', 'group'); menu.setAttribute('aria-label', '角色文件夹');
    const toggle = button('全部 ▾', 'jd-tab jd-folder-toggle', () => menu.hidden ? open() : close(true), '筛选文件夹，也可将角色卡拖到这里');
    toggle.setAttribute('aria-expanded', 'false');
    control.append(toggle, menu);
    shell.scope ??= 'all'; shell.selected = new Set(); shell.organizing = false;
    let dragKeys = [], disposed = false;
    const holds = new Set();
    const outside = event => { if (!control.contains(event.target)) close(); };
    function close(focus = false) {
        menu.hidden = true; toggle.setAttribute('aria-expanded', 'false');
        document.removeEventListener('pointerdown', outside, true);
        if (focus && toggle.isConnected) toggle.focus({ preventScroll: true });
    }
    function open(focus = true) {
        renderMenu(); menu.hidden = false; toggle.setAttribute('aria-expanded', 'true');
        document.addEventListener('pointerdown', outside, true);
        if (focus) menu.querySelector('button')?.focus({ preventScroll: true });
    }
    control.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !menu.hidden) { event.preventDefault(); event.stopPropagation(); close(true); }
        if (event.key === 'Tab' && !menu.hidden) { close(true); return; }
        if (event.target === toggle && event.key === 'ArrowDown') { event.preventDefault(); open(); }
        if (!menu.hidden && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && event.target !== toggle) {
            event.preventDefault(); const options = [...menu.querySelectorAll('button')]; const current = options.indexOf(document.activeElement);
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length;
            options[next]?.focus({ preventScroll: true });
        }
    });
    // WebKit can blur an option before tapping another, with no relatedTarget.
    // That is not evidence of leaving the menu: let the ensuing click complete.
    // Outside pointerdown and keyboard Tab/Escape still dismiss it explicitly.
    control.addEventListener('focusout', event => {
        if (event.relatedTarget && !control.contains(event.relatedTarget) && !dragKeys.length) close();
    });
    toggle.addEventListener('dragenter', () => { if (dragKeys.length && menu.hidden) open(false); });
    toggle.addEventListener('dragover', event => { if (dragKeys.length) event.preventDefault(); });
    function commitMove(keys, target) {
        try {
            const count = moveCards(settings(), keys, target, shell.entities);
            const name = foldersFor(settings()).find(f => f.id === target)?.name || '未分类';
            save(); shell.selected.clear(); redraw();
            shell.notice.textContent = `已将 ${count} 张卡移至「${name}」。`;
        } catch (error) { shell.notice.textContent = error.message; }
    }
    function addDrop(target, folderId) {
        target.addEventListener('dragover', event => {
            if (!dragKeys.length) return;
            event.preventDefault(); event.dataTransfer.dropEffect = 'move'; target.classList.add('jd-drop-target');
        });
        target.addEventListener('dragleave', () => target.classList.remove('jd-drop-target'));
        target.addEventListener('drop', event => {
            if (!dragKeys.length) return;
            event.preventDefault(); event.stopPropagation(); target.classList.remove('jd-drop-target');
            const keys = dragKeys; dragKeys = []; close(); commitMove(keys, folderId);
        });
    }
    function editFolder(folder = null, after = null) {
        close();
        const { modal, body, notice } = dialog(folder ? '重命名文件夹' : '新建文件夹');
        const input = element('input', 'jd-input'); input.type = 'text'; input.maxLength = 80; input.value = folder?.name || '';
        input.placeholder = '文件夹名称'; input.setAttribute('aria-label', '文件夹名称');
        const commit = () => {
            try {
                const id = saveFolder(settings(), input.value, folder?.id);
                save(); modal.close(); redraw(); after?.(id);
            } catch (error) { notice.textContent = error.message; input.focus(); }
        };
        input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); commit(); } });
        body.append(input, button('保存文件夹', 'jd-primary-button', commit)); input.focus();
    }
    function deleteFolder(folder) {
        close();
        const { modal, body } = dialog('删除文件夹');
        body.append(element('p', 'jd-dialog-intro', `删除「${folder.name}」后，里面的卡片会回到未分类。角色卡和聊天存档都会保留。`));
        const actions = element('div', 'jd-delete-actions');
        const cancel = button('取消', 'jd-secondary-button', () => modal.close());
        actions.append(cancel, button('删除文件夹', 'jd-primary-button', () => {
            removeFolder(settings(), folder.id); save(); modal.close(); redraw();
        }));
        body.append(actions); cancel.focus();
    }
    function renderMenu() {
        menu.replaceChildren();
        for (const folder of [{ id: 'all', name: '全部' }, { id: 'unfiled', name: '未分类' }, ...foldersFor(settings())]) {
            const option = button(folder.name, 'jd-folder-option', () => {
                shell.scope = folder.id; shell.page = 0; close(true); shell.draw(); shell.remember();
            });
            option.dataset.folder = folder.id; option.setAttribute('aria-pressed', String(folder.id === shell.scope));
            if (folder.id !== 'all') addDrop(option, folder.id === 'unfiled' ? '' : folder.id);
            menu.append(option);
        }
        const actions = element('div', 'jd-folder-actions');
        actions.append(button('＋ 新建文件夹', 'jd-folder-option', () => editFolder()));
        const current = foldersFor(settings()).find(f => f.id === shell.scope);
        if (current) actions.append(button('重命名文件夹', 'jd-folder-option', () => editFolder(current)), button('删除文件夹', 'jd-folder-option', () => deleteFolder(current)));
        menu.append(actions);
        // Match the sort menu's explicit focusability, including action buttons.
        for (const option of menu.querySelectorAll('button')) option.tabIndex = -1;
    }
    function moveDialog() {
        const keys = [...shell.selected];
        if (!keys.length) return;
        const { modal, body } = dialog(`移动 ${keys.length} 张卡`);
        const list = element('div', 'jd-move-list');
        for (const folder of [{ id: '', name: '未分类' }, ...foldersFor(settings())]) {
            list.append(button(folder.name, 'jd-folder-option', () => { modal.close(); commitMove(keys, folder.id); }));
        }
        list.append(button('＋ 新建文件夹', 'jd-folder-option', () => {
            modal.close(); editFolder(null, id => commitMove(keys, id));
        }));
        body.append(list);
    }
    const organize = button('整理', 'jd-text-button jd-organize', () => {
        shell.organizing = !shell.organizing; if (!shell.organizing) shell.selected.clear(); sync();
    });
    const bar = element('div', 'jd-organizer-bar'); bar.hidden = true;
    const selectedLabel = element('span', 'jd-selected-count'); selectedLabel.setAttribute('role', 'status');
    const selectPage = button('全选本页', 'jd-text-button', () => {
        const keys = [...shell.visible.keys()].filter(key => !shell.entities.get(key)?.assistant);
        const allSelected = keys.every(key => shell.selected.has(key));
        for (const key of keys) allSelected ? shell.selected.delete(key) : shell.selected.add(key);
        sync();
    });
    const move = button('移至…', 'jd-text-button jd-move-selected', moveDialog);
    const done = button('完成', 'jd-text-button', () => { shell.organizing = false; shell.selected.clear(); sync(); });
    bar.append(selectedLabel, selectPage, move, done);
    function sync() {
        for (const key of shell.selected) if (!shell.entities.has(key) || shell.entities.get(key).assistant) shell.selected.delete(key);
        const folders = foldersFor(settings());
        if (shell.scope !== 'all' && shell.scope !== 'unfiled' && !folders.some(f => f.id === shell.scope)) {
            shell.scope = 'all'; shell.page = 0; shell.remember();
        }
        const name = shell.scope === 'all' ? '全部' : shell.scope === 'unfiled' ? '未分类' : folders.find(f => f.id === shell.scope).name;
        toggle.textContent = name + ' ▾'; toggle.title = name + ' · 筛选文件夹，也可拖入卡片';
        bar.hidden = !shell.organizing; organize.textContent = shell.organizing ? '退出整理' : '整理';
        organize.setAttribute('aria-pressed', String(shell.organizing));
        shell.root.classList.toggle('jd-organizing', shell.organizing);
        selectedLabel.textContent = `已选 ${shell.selected.size} 张`;
        move.disabled = !shell.selected.size;
        const pageKeys = [...shell.visible.keys()].filter(key => !shell.entities.get(key)?.assistant);
        selectPage.textContent = pageKeys.length && pageKeys.every(key => shell.selected.has(key)) ? '取消本页' : '全选本页';
        for (const [key, item] of shell.visible) {
            const chosen = shell.selected.has(key);
            item.classList.toggle('jd-selected', chosen);
            item.querySelector('.jd-select-card')?.setAttribute('aria-checked', String(chosen));
            const select = item.querySelector('.jd-select-card'); if (select) select.textContent = chosen ? '✓' : '';
            const main = item.querySelector('.jd-open-card');
            if (main) main.setAttribute('aria-label', `${shell.organizing ? '选择' : '打开'}${shell.entities.get(key)?.name || ''}`);
        }
    }
    function select(entity) {
        if (entity.assistant) return;
        shell.selected.has(entity.key) ? shell.selected.delete(entity.key) : shell.selected.add(entity.key); sync();
    }
    function decorateCard(item, main, entity) {
        if (entity.assistant) return;
        const checkbox = button('', 'jd-select-card', () => select(entity), `选择${entity.name}`);
        checkbox.setAttribute('role', 'checkbox'); checkbox.setAttribute('aria-checked', 'false'); item.append(checkbox);
        let timer, pointer, suppressUntil = 0;
        const cancelHold = () => { clearTimeout(timer); timer = null; holds.delete(cancelHold); };
        main.addEventListener('click', event => {
            if (performance.now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation(); return; }
            if (shell.organizing) { event.preventDefault(); event.stopImmediatePropagation(); select(entity); }
        }, true);
        main.addEventListener('pointerdown', event => {
            if (event.pointerType !== 'touch' || !event.isPrimary) return;
            cancelHold(); pointer = { x: event.clientX, y: event.clientY }; holds.add(cancelHold);
            timer = setTimeout(() => {
                cancelHold(); if (disposed || !item.isConnected) return;
                shell.organizing = true; shell.selected.add(entity.key); suppressUntil = Infinity; sync();
            }, 500);
        });
        main.addEventListener('pointermove', event => { if (pointer && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 10) cancelHold(); });
        for (const type of ['pointerup', 'pointercancel', 'pointerleave']) main.addEventListener(type, () => {
            cancelHold(); pointer = null; if (suppressUntil === Infinity) suppressUntil = performance.now() + 700;
        });
        main.addEventListener('contextmenu', event => { if (timer || shell.organizing) event.preventDefault(); });
        main.draggable = true;
        main.querySelectorAll('img').forEach(img => { img.draggable = false; });
        main.addEventListener('dragstart', event => {
            cancelHold(); if (!event.dataTransfer) return;
            dragKeys = shell.selected.has(entity.key) ? [...shell.selected] : [entity.key];
            event.dataTransfer.setData('application/x-yantai-cards', 'internal'); event.dataTransfer.effectAllowed = 'move';
            item.classList.add('jd-dragging');
        });
        main.addEventListener('dragend', () => { dragKeys = []; item.classList.remove('jd-dragging'); close(); });
    }
    return { control, organize, bar, sync, decorateCard,
        beforeDraw() { for (const cancel of holds) cancel(); sync(); },
        dispose() { disposed = true; close(); for (const cancel of holds) cancel(); shell.selected.clear(); dragKeys = []; },
    };
}
