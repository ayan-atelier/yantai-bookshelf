/* Explicit, user-triggered release switching. No startup polling or automatic installs. */
export const BOOKSHELF_VERSION = '1.4.1';
export const BOOKSHELF_ID = 'jingdu-bookshelf';
export const BOOKSHELF_SCRIPT_ID = 'dfe86938-8c9f-461a-b382-75b047b26ff2';
export const SETTINGS_SCHEMA = 1;
export const DEFAULT_REPOSITORY = 'https://github.com/ayan-atelier/yantai-bookshelf';
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
export function compareVersions(a, b) {
    if (!VERSION_PATTERN.test(a) || !VERSION_PATTERN.test(b)) throw new Error('版本号格式无效。');
    const x = a.split('.').map(Number), y = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
    return 0;
}
export function repositoryURL(value) {
    if (!value) return '';
    let parsed;
    try { parsed = new URL(String(value).trim()); } catch { throw new Error('请填写完整的 GitHub 仓库网址。'); }
    const match = parsed.pathname.match(/^\/([a-zA-Z0-9-]+)\/([a-zA-Z0-9_.-]+)\/?$/);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash || !match) throw new Error('请使用 https://github.com/作者/仓库名 这样的仓库网址。');
    const repo = match[2].replace(/\.git$/, '');
    if (!repo || repo === '.' || repo === '..') throw new Error('仓库名称无效。');
    return `https://github.com/${match[1]}/${repo}`;
}
export function releaseCatalog(value) {
    if (!value || value.schema !== 1 || value.extension !== BOOKSHELF_ID || !Array.isArray(value.releases) || value.releases.length > 100) throw new Error('这个仓库没有可识别的砚台书架版本清单。');
    const seen = new Set();
    const releases = value.releases.map(release => {
        if (!release || !VERSION_PATTERN.test(release.version) || seen.has(release.version) || release.branch !== `v${release.version}` || !Number.isSafeInteger(release.settings_schema) || !VERSION_PATTERN.test(release.minimum_client_version) || release.helper !== `releases/yantai-bookshelf-v${release.version}-helper.json` || !/^[a-f0-9]{64}$/.test(release.sha256)) throw new Error('版本清单不完整或包含重复版本，请等待作者修复。');
        seen.add(release.version);
        return { ...release, notes: String(release.notes || '').slice(0, 4000) };
    }).sort((a, b) => compareVersions(b.version, a.version));
    if (!releases.some(release => release.version === value.latest)) throw new Error('版本清单缺少最新版。');
    return { latest: value.latest, releases };
}
// SHA-256 also works on ordinary HTTP/LAN hosts where SubtleCrypto is unavailable.
export function sha256(text) {
    const bytes = new TextEncoder().encode(text);
    const constants = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    const h = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const buffer = new ArrayBuffer(Math.ceil((bytes.length + 9) / 64) * 64), view = new DataView(buffer);
    new Uint8Array(buffer).set(bytes); view.setUint8(bytes.length, 0x80);
    view.setUint32(buffer.byteLength - 8, Math.floor(bytes.length / 0x20000000)); view.setUint32(buffer.byteLength - 4, bytes.length * 8);
    const rotate = (n, bits) => (n >>> bits) | (n << (32 - bits)), w = new Uint32Array(64);
    for (let offset = 0; offset < buffer.byteLength; offset += 64) {
        for (let i = 0; i < 16; i++) w[i] = view.getUint32(offset + i * 4);
        for (let i = 16; i < 64; i++) {
            const a = w[i - 15], b = w[i - 2];
            w[i] = w[i - 16] + (rotate(a,7) ^ rotate(a,18) ^ (a >>> 3)) + w[i - 7] + (rotate(b,17) ^ rotate(b,19) ^ (b >>> 10));
        }
        let [a,b,c,d,e,f,g,k] = h;
        for (let i = 0; i < 64; i++) {
            const t1 = (k + (rotate(e,6) ^ rotate(e,11) ^ rotate(e,25)) + ((e & f) ^ (~e & g)) + constants[i] + w[i]) | 0;
            const t2 = ((rotate(a,2) ^ rotate(a,13) ^ rotate(a,22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
            k=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;
        }
        [a,b,c,d,e,f,g,k].forEach((n,i) => { h[i] = (h[i] + n) >>> 0; });
    }
    return h.map(n => n.toString(16).padStart(8,'0')).join('');
}
export function validateHelper(text, release) {
    if (text.length > 4_000_000 || sha256(text) !== release.sha256) throw new Error('下载文件校验失败，当前版本未被替换。');
    let script;
    try { script = JSON.parse(text); } catch { throw new Error('下载的助手脚本不是有效 JSON。'); }
    if (script.type !== 'script' || script.id !== BOOKSHELF_SCRIPT_ID || typeof script.content !== 'string' || !script.content.includes('jingdu.bookshelf.helper.runtime') || !String(script.name).includes(`V${release.version}`)) throw new Error('下载内容不是对应版本的砚台书架。');
    return script;
}
export function patchHelperTrees(trees, id, expectedContent, replacement) {
    let matches = 0;
    const patch = script => {
        if (script.id !== id) return script;
        matches++;
        if (script.type !== 'script' || script.content !== expectedContent) throw new Error('书架脚本已被其他操作修改，请重新检查版本。');
        // Keep identity, enable state, user data, buttons and every unrelated script.
        return { ...script, name: replacement.name, content: replacement.content, info: replacement.info };
    };
    const next = trees.map(tree => tree.type === 'folder' ? { ...tree, scripts: tree.scripts.map(patch) } : patch(tree));
    if (matches !== 1) throw new Error('未能唯一定位正在运行的全局书架脚本，请检查是否重复安装。');
    return next;
}
export function versionSnapshot(settings, version) {
    const snapshot = JSON.parse(JSON.stringify(settings));
    delete snapshot.versionBackup; delete snapshot.updateState;
    return { version, savedAt: new Date().toISOString(), settings: snapshot };
}
export function createVersionManager({ settings, save, flush, context, moduleURL, helperId, apiRoot, beforeChange, fetcher = (...args) => fetch(...args), currentVersion = BOOKSHELF_VERSION }) {
    let busy = false, disposed = false, reloadNeeded = false, clientVersion = '';
    const readControllers = new Set();
    const state = () => {
        const s = settings();
        if (!s.updateState || typeof s.updateState !== 'object' || Array.isArray(s.updateState)) s.updateState = {};
        return s.updateState;
    };
    const checkAlive = () => { if (disposed) throw new Error('书架已关闭，请重新打开。'); };
    const request = async (address, options = {}, mutating = false) => {
        checkAlive();
        const controller = new AbortController();
        if (!mutating) readControllers.add(controller);
        const timer = setTimeout(() => controller.abort(), mutating ? 90000 : 30000);
        try {
            const response = await fetcher(address, { ...options, signal: controller.signal });
            if (!response.ok) throw new Error(response.status === 403 ? '没有修改此扩展的权限，请由酒馆管理员操作。' : `请求失败（${response.status}），请检查网络和仓库发布状态。`);
            return await response.text();
        } catch (error) {
            if (error.name === 'AbortError') throw new Error(mutating ? '版本切换尚未确认完成，请刷新后查看版本号，不要连续重试。' : '检查超时或已取消，请稍后重试。');
            throw error;
        } finally { clearTimeout(timer); readControllers.delete(controller); }
    };
    const json = async (address, options, mutating = false) => {
        const text = await request(address, options, mutating);
        try { return text ? JSON.parse(text) : null; } catch { throw new Error('服务器返回内容无法识别，请稍后重试。'); }
    };
    const native = async (route, install, extra = {}, mutating = false) => json(new URL(`api/extensions/${route}`, apiRoot).href, { method: 'POST', headers: context().getRequestHeaders(), body: JSON.stringify({ extensionName: install.extensionName, global: install.global, ...extra }) }, mutating);
    const remoteText = (repo, path) => request(`https://raw.githubusercontent.com/${repo.slice('https://github.com/'.length)}/main/${path}`, { credentials: 'omit', cache: 'no-store', redirect: 'error' });
    const remoteJSON = async (repo, path) => { try { return JSON.parse(await remoteText(repo, path)); } catch (error) { if (error instanceof SyntaxError) throw new Error('仓库中的版本清单不是有效 JSON。'); throw error; } };
    const helperAPI = () => {
        const api = globalThis.TavernHelper;
        if (!api?.getScriptTrees || !api?.updateScriptTreesWith) throw new Error('请先更新酒馆助手；当前版本缺少脚本更新接口。');
        return api;
    };
    const currentHelper = () => {
        const trees = helperAPI().getScriptTrees({ type: 'global' });
        const matches = trees.flatMap(tree => tree.type === 'folder' ? tree.scripts : [tree]).filter(script => script.id === helperId);
        if (matches.length !== 1 || matches[0].type !== 'script') throw new Error('未找到唯一的全局书架脚本，请确认只启用了一份。');
        return matches[0];
    };
    const resolveInstall = async () => {
        if (!moduleURL) return { mode: 'helper', script: currentHelper(), repository: repositoryURL(state().repository || DEFAULT_REPOSITORY) };
        const match = new URL(moduleURL).pathname.match(/\/scripts\/extensions\/third-party\/([^/]+)\//);
        if (!match) throw new Error('无法识别扩展安装目录。请通过酒馆的“安装扩展”使用仓库网址安装。');
        const extensionName = decodeURIComponent(match[1]);
        const discovered = await json(new URL('api/extensions/discover', apiRoot).href, { headers: context().getRequestHeaders() });
        const found = Array.isArray(discovered) && discovered.find(item => item.name === `third-party/${extensionName}` && ['local','global'].includes(item.type));
        if (!found) throw new Error('找不到当前书架的安装位置，请刷新酒馆后重试。');
        const install = { mode: 'native', extensionName, global: found.type === 'global' };
        const version = await native('version', install);
        if (!version?.remoteUrl || !version.currentCommitHash) throw new Error('这份书架是解压安装的。在线更新需要先改用仓库网址安装，原书架设置可以保留。');
        return { ...install, ...version, repository: repositoryURL(version.remoteUrl) };
    };
    const compatible = release => {
        if (release.settings_schema !== SETTINGS_SCHEMA) return false;
        return VERSION_PATTERN.test(clientVersion) && compareVersions(clientVersion, release.minimum_client_version) >= 0;
    };
    return {
        get busy() { return busy; }, get reloadNeeded() { return reloadNeeded; },
        get mode() { return moduleURL ? 'native' : 'helper'; },
        get repository() { return state().repository || DEFAULT_REPOSITORY; },
        setRepository(value) {
            if (busy) throw new Error('请等待当前检查结束。');
            const repo = repositoryURL(value); state().repository = repo; save(); return repo;
        },
        async check() {
            if (busy) throw new Error('正在处理版本，请稍候。');
            if (reloadNeeded) throw new Error('版本已切换，请先刷新酒馆。');
            busy = true;
            try {
                const install = await resolveInstall();
                if (!install.repository) throw new Error('尚未设置发布仓库。作者完成 GitHub 发布后，填入仓库网址即可检查更新。');
                const client = await json(new URL('version', apiRoot).href, { cache: 'no-store' });
                clientVersion = String(client?.pkgVersion || '').match(/\d+\.\d+\.\d+/)?.[0] || '';
                if (!clientVersion) throw new Error('无法确认酒馆版本，暂不提供版本切换。');
                const catalog = releaseCatalog(await remoteJSON(install.repository, 'versions.json'));
                if (install.mode === 'native') {
                    install.branches = await native('branches', install);
                    if (!Array.isArray(install.branches)) throw new Error('当前酒馆未返回可切换版本，请先更新酒馆。');
                }
                checkAlive();
                const available = catalog.releases.filter(release => compatible(release) && (install.mode === 'helper' || install.branches.some(branch => branch.name === `origin/${release.branch}`)));
                const latest = available.find(release => release.version === catalog.latest);
                const previous = available.find(release => compareVersions(release.version, currentVersion) < 0);
                return { install, catalog, latest: latest && compareVersions(latest.version, currentVersion) > 0 ? latest : null, previous, unavailableLatest: compareVersions(catalog.latest, currentVersion) > 0 && !latest, checkedAt: Date.now() };
            } finally { busy = false; }
        },
        async apply(checked, target) {
            if (busy) throw new Error('正在处理版本，请稍候。');
            if (reloadNeeded) throw new Error('版本已切换，请先刷新酒馆。');
            checkAlive();
            if (!checked || Date.now() - checked.checkedAt > 10 * 60 * 1000 || ![checked.latest, checked.previous].includes(target) || !target || !compatible(target)) throw new Error('版本信息已过期或不兼容，请重新检查。');
            busy = true;
            let mutationStarted = false;
            try {
                const install = await resolveInstall();
                if (install.repository !== checked.install.repository || install.mode !== checked.install.mode || (install.mode === 'native' && (install.currentCommitHash !== checked.install.currentCommitHash || install.currentBranchName !== checked.install.currentBranchName))) throw new Error('安装来源或当前版本发生变化，请重新检查。');
                let replacement;
                if (install.mode === 'helper') replacement = validateHelper(await remoteText(install.repository, target.helper), target);
                checkAlive();
                await beforeChange();
                settings().versionBackup = versionSnapshot(settings(), currentVersion);
                await flush();
                checkAlive();
                if (install.mode === 'native') {
                    mutationStarted = true;
                    await native('switch', install, { branch: `origin/${target.branch}` }, true);
                    // Frozen version branches are verified instead of fast-forwarded silently.
                    const [manifest, actual] = await Promise.all([
                        json(new URL('manifest.json', moduleURL).href, { cache: 'no-store' }),
                        native('version', install),
                    ]);
                    const expected = checked.install.branches.find(branch => branch.name === `origin/${target.branch}`);
                    if (manifest?.version !== target.version || actual?.currentBranchName !== target.branch || !actual?.currentCommitHash?.startsWith(expected.commit)) throw new Error('切换后的版本未能通过核对，请刷新后检查扩展版本。');
                } else {
                    mutationStarted = true;
                    helperAPI().updateScriptTreesWith(trees => patchHelperTrees(trees, helperId, install.script.content, replacement), { type: 'global' });
                    if (currentHelper().content !== replacement.content) throw new Error('助手脚本未能通过写入核对。');
                }
                const s = state(); s.repository = install.repository; s.previousVersion = currentVersion; s.chosenVersion = target.version;
                save(); await flush(); reloadNeeded = true;
                return target.version;
            } catch (error) {
                if (mutationStarted) { reloadNeeded = true; throw new Error(`${error.message} 请刷新酒馆确认当前版本；书架设置备份已保留。`); }
                throw error;
            } finally { busy = false; }
        },
        dispose() { disposed = true; for (const controller of readControllers) controller.abort(); readControllers.clear(); },
    };
}
