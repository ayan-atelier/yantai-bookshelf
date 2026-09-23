/* Presentation helpers and native chat entrypoints. No generation requests. */
export const MODULE = 'jingdu_bookshelf';
export const DEFAULT_CROP = Object.freeze({ x: 50, y: 25 });
export const fileStem = name => String(name ?? '').replace(/\.jsonl$/i, '');
export const entityKey = (kind, id) => `${kind}:${id}`;
export const aliasKey = (key, name) => JSON.stringify([key, fileStem(name)]);
export const bounded = (value, fallback = 50) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : fallback;
export const SORT_OPTIONS = Object.freeze([
    ['recent', '最近游玩'], ['added', '最近添加'], ['addedOldest', '最早添加'],
    ['count', '存档最多'], ['name', '名称排序'],
]);
export const normalizeSort = value => SORT_OPTIONS.some(([id]) => id === value) ? value : 'recent';
const nameOrder = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });

// Cache only successful reads; share concurrent requests, and never let an old
// request repopulate the cache after a chat/character change or manual refresh.
export function createArchiveCache({ ttl = 30000, now = () => Date.now() } = {}) {
    const values = new Map(), pending = new Map();
    let revision = 0;
    return {
        peek(key) {
            const item = values.get(key);
            return item && now() - item.time < ttl ? item.value : undefined;
        },
        load(key, read, { fresh = false } = {}) {
            const cached = this.peek(key);
            if (!fresh && cached !== undefined) return Promise.resolve(cached);
            if (pending.has(key)) return pending.get(key);
            const started = revision;
            const result = Promise.resolve().then(read).then(value => {
                if (revision === started) values.set(key, { value, time: now() });
                return value;
            }).finally(() => { if (pending.get(key) === result) pending.delete(key); });
            pending.set(key, result);
            return result;
        },
        clear() { revision++; values.clear(); pending.clear(); },
    };
}

export function timestamp(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    if (!value) return 0;
    if (/^\d{13}$/.test(String(value))) return Number(value);
    const direct = Date.parse(value);
    if (Number.isFinite(direct)) return direct;
    const m = String(value).match(/(\d{4})-(\d{2})-(\d{2})[@ T](\d{2})[h:](\d{2})(?:[m:](\d{2}))?/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)).getTime() : 0;
}

// A short display-only excerpt. Never render chat HTML or run character regexes.
export function chatPreview(value, limit = 360) {
    if (typeof value !== 'string' || !value.trim()) return '';
    if (/^\[The (?:chat|message) is empty\]$/.test(value.trim())) return '';
    let text = value.slice(0, 250000);
    const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
    text = text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (match, code) => {
        if (code[0] !== '#') return entities[code.toLowerCase()] || match;
        const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
        return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : ' ';
    });
    text = text
        .replace(/<(?:think|thinking|analysis|reasoning)\b[^>]*>[\s\S]*?<\/(?:think|thinking|analysis|reasoning)\s*>/gi, ' ')
        .replace(/<(?:think|thinking|analysis|reasoning)\b[^>]*>[\s\S]*$/gi, ' ')
        .replace(/<(script|style|tableEdit)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<!--[^]*?-->/g, ' ')
        .replace(/<(?:script|style|tableEdit)\b[^>]*>[^]*$/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
        .replace(/!\[[^\]]*\]\([^\n)]*\)/g, ' ')
        .replace(/\[([^\]]+)\]\([^\n)]*\)/g, '$1')
        .replace(/```[^\n]*\n|```/g, ' ')
        .replace(/(^|\n)\s{0,3}(?:#{1,6}\s+|>\s*)/g, '$1')
        .replace(/[*_`~]/g, '')
        .replace(/\s+/g, ' ').trim();
    const chars = Array.from(text);
    return chars.length > limit ? chars.slice(0, limit).join('') + '…' : text;
}

export function normalizeRows(data) {
    if (!Array.isArray(data) && (!data || typeof data !== 'object' || data.error)) throw new Error('未能读取存档列表');
    const values = Array.isArray(data) ? data : Object.values(data);
    const seen = new Map();
    for (const row of values) {
        if (!row || typeof row !== 'object' || typeof row.file_name !== 'string' || !row.file_name.trim()) continue;
        const name = fileStem(row.file_name);
        const messages = row.chat_items ?? row.message_count;
        const message = typeof row.mes === 'string' ? row.mes : row.preview_message;
        if (!seen.has(name)) seen.set(name, {
            name, date: timestamp(row.last_mes),
            messages: Number.isFinite(Number(messages)) && messages != null ? Number(messages) : null,
            preview: typeof message === 'string' ? chatPreview(message) : null,
            size: typeof row.file_size === 'string' ? row.file_size : '',
        });
    }
    return [...seen.values()];
}

// Keep every filename from the authoritative lightweight listing, even when
// SillyTavern cannot read the preview/metadata of one of the older files.
export function mergeDetails(files, details) {
    const byName = new Map(details.map(row => [row.name, row]));
    return files.map(row => ({ ...row, ...(byName.get(row.name) || {}) }))
        .sort((a, b) => (b.date || timestamp(b.name)) - (a.date || timestamp(a.name)) || b.name.localeCompare(a.name));
}

export function displayChatName(entity, row, aliases) {
    const alias = aliases[aliasKey(entity.key, row.name)];
    if (typeof alias === 'string' && alias.trim()) return alias;
    const branch = row.name.match(/\bBranch\s*#?\s*(\d+)/i);
    if (branch) return `分支 ${branch[1]}`;
    let name = row.name;
    if (name.startsWith(entity.name + ' - ')) name = name.slice(entity.name.length + 3);
    const dated = name.match(/^(\d{4}-\d{2}-\d{2})@(\d{2})h(\d{2})m/);
    if (dated) return `${dated[1]} · ${dated[2]}:${dated[3]}${/imported/i.test(name) ? ' · 导入' : ''}`;
    return name || '未命名存档';
}

export function entitiesFromContext(ctx, assistantAvatar) {
    const tags = new Map((ctx.tags || []).map(tag => [String(tag.id), tag.name]));
    const cards = (ctx.characters || []).filter(c => c && typeof c.avatar === 'string').map(c => {
        const mapped = (ctx.tagMap?.[c.avatar] || []).map(id => tags.get(String(id))).filter(Boolean);
        const embedded = (c.tags || c.data?.tags || []).filter?.(tag => typeof tag === 'string') || [];
        return {
            key: entityKey('char', c.avatar), kind: 'char', id: c.avatar,
            name: String(c.name || c.data?.name || fileStem(c.avatar)),
            tags: [...new Set([...mapped, ...embedded])].slice(0, 4),
            last: timestamp(c.date_last_chat),
            added: timestamp(c.date_added),
            nativeFavorite: c.fav === true || c.fav === 'true' || c.data?.extensions?.fav === true,
            assistant: c.avatar === assistantAvatar,
        };
    });
    for (const g of ctx.groups || []) cards.push({
        key: entityKey('group', g.id), kind: 'group', id: String(g.id), name: String(g.name || '群聊'),
        tags: ['群聊'], last: timestamp(g.date_last_chat), nativeFavorite: !!g.fav,
        added: timestamp(g.date_added) || timestamp(g.id),
        assistant: false, avatar: g.avatar_url,
    });
    if (!cards.some(card => card.assistant)) cards.push({
        key: 'assistant:default', kind: 'assistant', id: assistantAvatar,
        name: '酒馆助手', tags: ['随手聊聊'], last: 0, nativeFavorite: false, assistant: true,
    });
    return cards;
}

export function isFavorite(entity, settings) {
    return typeof settings.favorites?.[entity.key] === 'boolean' ? settings.favorites[entity.key] : entity.nativeFavorite;
}

export function isPinned(entity, settings) {
    return !entity.assistant && Array.isArray(settings.pinned) && settings.pinned.includes(entity.key);
}

export function filterEntities(entities, query, filter, settings, counts = new Map()) {
    const q = query.trim().toLocaleLowerCase();
    const pins = new Map((Array.isArray(settings.pinned) ? settings.pinned : []).map((key, i) => [key, i]));
    const sort = normalizeSort(settings.sort);
    return entities.filter(entity => {
        if (q && ![entity.name, ...entity.tags].join(' ').toLocaleLowerCase().includes(q)) return false;
        if (entity.assistant) return filter !== 'favorites' || isFavorite(entity, settings);
        if (filter === 'favorites') return isFavorite(entity, settings);
        if (filter === 'recent') return entity.last > 0;
        return true;
    }).sort((a, b) => {
        const assistantOrder = Number(!!a.assistant) - Number(!!b.assistant);
        if (assistantOrder) return assistantOrder;
        const aPinned = !a.assistant && pins.has(a.key);
        const bPinned = !b.assistant && pins.has(b.key);
        if (aPinned !== bPinned) return Number(bPinned) - Number(aPinned);
        if (aPinned && bPinned) return pins.get(a.key) - pins.get(b.key);
        if (sort === 'name') return nameOrder.compare(a.name, b.name) || a.key.localeCompare(b.key);
        if (sort === 'added' || sort === 'addedOldest') {
            const aTime = a.added || 0, bTime = b.added || 0;
            if (!!aTime !== !!bTime) return aTime ? -1 : 1;
            if (aTime !== bTime) return sort === 'added' ? bTime - aTime : aTime - bTime;
        }
        if (sort === 'count') {
            const aCount = counts.get(a.key), bCount = counts.get(b.key);
            const aKnown = Number.isFinite(aCount), bKnown = Number.isFinite(bCount);
            if (aKnown !== bKnown) return aKnown ? -1 : 1;
            if (aKnown && aCount !== bCount) return bCount - aCount;
        }
        return b.last - a.last || nameOrder.compare(a.name, b.name) || a.key.localeCompare(b.key);
    });
}

export function selectedEntityMatches(context, entity) {
    if (entity.kind === 'group') return context.groupId != null && String(context.groupId) === String(entity.id);
    return context.groupId == null && context.characterId != null && context.characters?.[context.characterId]?.avatar === entity.id;
}

// Native selection must succeed before a filename may be opened. The native
// selectors can silently return while another chat is saving/generating.
export async function switchNativeChat({ context, entity, filename = null, api, groups, openAssistant }) {
    if (api.is_send_press || groups.is_group_generating || api.isChatSaving) throw new Error('酒馆正在生成或保存，请稍后再切换存档');
    if (entity.kind === 'assistant') {
        await openAssistant();
        if (context().characterId == null && context().groupId == null) throw new Error('助手暂时未能打开');
    } else if (entity.kind === 'group') {
        const findGroup = () => (context().groups || []).find(g => String(g.id) === String(entity.id));
        const group = findGroup();
        if (!group) throw new Error('群聊已不存在，请刷新书架');
        if (!selectedEntityMatches(context(), entity)) await groups.openGroupById(group.id);
        if (!selectedEntityMatches(context(), entity)) throw new Error('酒馆正在保存或生成，请稍后再切换');
        if (filename && !findGroup()?.chats?.some(name => fileStem(name) === filename)) throw new Error('这份群聊存档已不在列表中，请刷新后重选');
        if (filename && findGroup().chat_id !== filename) await context().openGroupChat(group.id, filename);
        api.setActiveGroup?.(group.id); context().saveSettingsDebounced?.();
    } else {
        const index = (context().characters || []).findIndex(c => c.avatar === entity.id);
        if (index < 0) throw new Error('角色已不存在，请刷新书架');
        if (typeof context().selectCharacterById !== 'function' || typeof context().openCharacterChat !== 'function') throw new Error('当前酒馆缺少原生存档接口，请更新酒馆后重试');
        await context().selectCharacterById(index, { switchMenu: false });
        if (!selectedEntityMatches(context(), entity)) throw new Error('酒馆正在保存或生成，请稍后再切换');
        if (filename && context().getCurrentChatId() !== filename) await context().openCharacterChat(filename);
        api.setActiveCharacter?.(entity.id); context().saveSettingsDebounced?.();
    }
    if (filename) {
        const actual = entity.kind === 'group' ? (context().groups || []).find(g => String(g.id) === String(entity.id))?.chat_id : context().getCurrentChatId();
        if (!selectedEntityMatches(context(), entity) || actual !== filename) throw new Error('存档尚未切换成功，请重试');
    }
}

// Save through the host before creating; never delete or reuse an existing file.
export async function createNativeChat(options) {
    const { context, entity, api, groups } = options;
    const assertIdle = () => {
        if (api.is_send_press || groups.is_group_generating || api.isChatSaving) throw new Error('酒馆正在生成或保存，请稍后再新建聊天');
    };
    assertIdle();
    if (typeof api.doNewChat !== 'function') throw new Error('当前酒馆未提供新建聊天接口，请使用原生菜单');
    if (context().chat?.length && (context().characterId != null || context().groupId != null)) await context().saveChat?.();
    await switchNativeChat({ ...options, filename: null });
    const before = context().getCurrentChatId();
    await context().saveChat?.();
    assertIdle();
    if (!selectedEntityMatches(context(), entity)) throw new Error('角色已切换，请重新选择要新建聊天的角色');
    await api.doNewChat({ deleteCurrentChat: false });
    if (!selectedEntityMatches(context(), entity) || !context().getCurrentChatId() || context().getCurrentChatId() === before) {
        throw new Error('新聊天尚未建立，请稍后重试或使用原生菜单');
    }
}

// Native deletion also updates the last-opened chat pointer and notifies other
// extensions. Some host versions return normally on HTTP errors, so require
// both the native success event and a fresh server listing before reporting success.
export async function deleteNativeChat({ context, entity, filename, api, groups, listFiles, isCurrent = () => true, isEnabled = () => true }) {
    const assertIdle = () => {
        if (api.is_send_press || groups.is_group_generating || api.isChatSaving) throw new Error('酒馆正在生成或保存，请结束后再删除存档');
    };
    const requireCurrent = () => {
        if (!isEnabled() || !isCurrent()) throw new Error('页面或存档列表已经变化，请重新选择要删除的存档');
    };
    const isGroup = entity.kind === 'group';
    const remove = isGroup ? groups.deleteGroupChatByName : api.deleteCharacterChatByName;
    const c = context(), types = c.eventTypes || c.event_types;
    const type = isGroup ? types?.GROUP_CHAT_DELETED : types?.CHAT_DELETED;
    if (!['char', 'group'].includes(entity.kind) || typeof remove !== 'function' || !type) throw new Error('当前酒馆未提供存档删除接口，请使用原生管理入口');
    assertIdle(); requireCurrent();
    if (!(await listFiles(entity)).some(row => row.name === filename)) throw new Error('这份存档已不存在，请刷新列表');
    assertIdle(); requireCurrent();
    const active = selectedEntityMatches(context(), entity) && fileStem(context().getCurrentChatId()) === filename;
    if (active) {
        if (typeof api.closeCurrentChat !== 'function') throw new Error('请先回到首页，再删除正在打开的存档');
        const closed = await api.closeCurrentChat();
        if (closed === false || context().characterId != null || context().groupId != null) throw new Error('当前聊天尚未退出，未删除存档');
    }
    assertIdle();
    if (!isEnabled() || (!active && !isCurrent())) throw new Error('删除操作已取消');
    const group = isGroup ? context().groups?.find(g => String(g.id) === String(entity.id)) : null;
    const characterId = isGroup ? -1 : context().characters?.findIndex(c => c.avatar === entity.id);
    if (isGroup ? !group : characterId == null || characterId < 0) throw new Error('角色或群聊已不存在，请刷新书架');
    let confirmed = false, failure;
    const onDeleted = name => { if (fileStem(name) === filename) confirmed = true; };
    c.eventSource.on(type, onDeleted);
    try { await remove(isGroup ? group.id : String(characterId), filename); }
    catch (error) { failure = error; }
    finally { c.eventSource.removeListener ? c.eventSource.removeListener(type, onDeleted) : c.eventSource.off(type, onDeleted); }
    // For groups, listFiles also restores host metadata from the server after
    // a failed delete that optimistically removed a name from the local array.
    let remaining;
    try { remaining = await listFiles(entity); }
    catch { throw new Error('暂时无法确认删除结果，请刷新列表检查，不要连续重复删除'); }
    if (remaining.some(row => row.name === filename)) throw new Error('删除未成功，存档仍保留，请稍后重试');
    if (!confirmed || failure) throw new Error('存档文件已不在列表中，但酒馆未完整确认删除，请刷新酒馆后检查');
    return { files: remaining, closedCurrent: active };
}
