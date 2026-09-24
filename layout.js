/* Homepage-only clearance for themed native bars. No polling, card scans, or
   changes to the theme's toolbar/composer. All measurements use viewport pixels. */
export function shelfInsets(port, visible, bars) {
    const width = visible.right - visible.left, height = visible.bottom - visible.top;
    if (!(width > 0 && height > 0 && port.bottom > port.top)) return { top: 0, bottom: 0 };
    let top = Math.max(0, visible.top - port.top);
    let bottom = Math.max(0, port.bottom - visible.bottom);
    const middle = (visible.top + visible.bottom) / 2;
    for (const { edge, rect } of bars) {
        if (rect.right <= visible.left || rect.left >= visible.right ||
            rect.bottom <= visible.top || rect.top >= visible.bottom) continue;
        // Ignore expanded drawers / full-screen containers, not their small
        // toolbar buttons. They are overlays, not permanent page chrome.
        const barHeight = rect.bottom - rect.top;
        if (!(barHeight > 0 && barHeight < height * .8 && rect.right > rect.left)) continue;
        const center = (Math.max(rect.top, visible.top) + Math.min(rect.bottom, visible.bottom)) / 2;
        if (edge === 'top' && center <= middle) top = Math.max(top, rect.bottom - port.top);
        if (edge === 'bottom' && center >= middle) bottom = Math.max(bottom, port.bottom - rect.top);
    }
    return { top: Math.ceil(top), bottom: Math.ceil(bottom) };
}

export function attachHomeLayout(chat, shelf) {
    const doc = chat.ownerDocument, win = doc.defaultView;
    const property = { top: '--jd-home-inset-top', bottom: '--jd-home-inset-bottom' };
    const previous = Object.fromEntries(Object.entries(property).map(([edge, name]) =>
        [edge, [chat.style.getPropertyValue(name), chat.style.getPropertyPriority(name)]]));
    const observed = new Set(), unlisten = [];
    let stopped = false, pending = 0, candidates = [];
    const schedule = () => {
        if (!stopped && !pending) pending = win.requestAnimationFrame(() => { pending = 0; refresh(); });
    };
    const resize = win.ResizeObserver ? new win.ResizeObserver(schedule) : null;
    const changes = new win.MutationObserver(schedule);
    const cssChanges = new win.MutationObserver(schedule);
    const listen = (target, type, fn, options) => {
        target?.addEventListener(type, fn, options);
        unlisten.push(() => target?.removeEventListener(type, fn, options));
    };
    const ancestors = node => {
        const result = [];
        for (let parent = node.parentElement; parent; parent = parent.parentElement) result.push(parent);
        return result;
    };
    function watch(nodes) {
        if (nodes.size === observed.size && [...nodes].every(node => observed.has(node))) return;
        changes.disconnect();
        for (const node of observed) if (!nodes.has(node)) { resize?.unobserve(node); observed.delete(node); }
        for (const node of nodes) {
            if (!observed.has(node)) { observed.add(node); resize?.observe(node); }
            // Deliberately no subtree: typing, cards, archive counts and open
            // settings drawers must not cause whole-document layout rescans.
            changes.observe(node, { attributes: true, attributeFilter: ['style', 'class', 'hidden'], childList: true });
        }
    }
    function refresh() {
        if (stopped || !chat.isConnected || !shelf.isConnected) return;
        const parents = ancestors(chat);
        const top = [...doc.querySelectorAll('#top-bar, #top-settings-holder, #top-settings-holder > .drawer > .drawer-toggle')];
        const bottom = [...doc.querySelectorAll('#form_sheld, #send_form, #nonQRFormItems')];
        candidates = [...top.map(node => ({ node, edge: 'top' })), ...bottom.map(node => ({ node, edge: 'bottom' }))]
            .filter(({ node }) => node !== chat && !node.contains(chat) && !shelf.contains(node));
        watch(new Set([chat, ...parents, ...candidates.flatMap(({ node }) => [node, ...ancestors(node)])]));

        const styles = new Map();
        const style = node => {
            if (!styles.has(node)) styles.set(node, win.getComputedStyle(node));
            return styles.get(node);
        };
        const shown = node => [node, ...ancestors(node)].every(part => {
            const s = style(part);
            return s.display !== 'none' && s.visibility !== 'hidden' && s.visibility !== 'collapse' && Number(s.opacity || 1) > 0;
        });
        const box = node => {
            const r = node.getBoundingClientRect();
            const sx = node.offsetWidth ? r.width / node.offsetWidth : 1;
            const sy = node.offsetHeight ? r.height / node.offsetHeight : 1;
            const left = r.left + node.clientLeft * sx, top = r.top + node.clientTop * sy;
            return { left, top, right: left + node.clientWidth * sx, bottom: top + node.clientHeight * sy, scale: sy || 1 };
        };
        const port = box(chat), shelfBox = shelf.getBoundingClientRect(), viewport = win.visualViewport;
        // Pinch zoom should magnify the page, not repeatedly reflow its content.
        const visual = viewport && Math.abs(viewport.scale - 1) < .05;
        const viewTop = visual ? viewport.offsetTop : 0, viewLeft = visual ? viewport.offsetLeft : 0;
        const viewHeight = visual ? viewport.height : win.innerHeight;
        const viewWidth = visual ? viewport.width : win.innerWidth;
        const visible = { top: Math.max(port.top, viewTop), bottom: Math.min(port.bottom, viewTop + viewHeight),
            left: Math.max(port.left, viewLeft, shelfBox.left), right: Math.min(port.right, viewLeft + viewWidth, shelfBox.right) };
        for (const parent of parents) {
            const s = style(parent), p = box(parent);
            if (/^(auto|scroll|hidden|clip)$/.test(s.overflowY)) {
                visible.top = Math.max(visible.top, p.top); visible.bottom = Math.min(visible.bottom, p.bottom);
            }
            if (/^(auto|scroll|hidden|clip)$/.test(s.overflowX)) {
                visible.left = Math.max(visible.left, p.left); visible.right = Math.min(visible.right, p.right);
            }
        }
        const bars = candidates.filter(({ node }) => shown(node)).map(({ node, edge }) => ({ edge, rect: node.getBoundingClientRect() }));
        // A theme may remove the chat scrollport altogether. Do not feed its
        // content-dependent height back into padding and grow it indefinitely.
        const unconstrained = port.bottom - port.top > win.innerHeight * 1.5 && chat.scrollHeight <= chat.clientHeight + 1;
        const inset = unconstrained ? { top: 0, bottom: 0 } : shelfInsets(port, visible, bars);
        for (const edge of ['top', 'bottom']) {
            const value = `${Math.ceil(inset[edge] / port.scale)}px`;
            if (chat.style.getPropertyValue(property[edge]) !== value) chat.style.setProperty(property[edge], value);
        }
    }
    const relevant = event => {
        if (observed.has(event.target) || candidates.some(({ node }) => node.contains(event.target))) schedule();
    };
    listen(win, 'resize', schedule, { passive: true });
    listen(win, 'orientationchange', schedule, { passive: true });
    listen(win.visualViewport, 'resize', schedule, { passive: true });
    listen(win.visualViewport, 'scroll', schedule, { passive: true });
    listen(doc, 'scroll', event => {
        // Native bars normally sit outside #chat, so scrolling through hundreds
        // of cards doesn't trigger layout work. Still handle relocated sticky bars.
        if (event.target === chat && !candidates.some(({ node }) => chat.contains(node))) return;
        if (event.target === doc || observed.has(event.target)) schedule();
    }, { capture: true, passive: true });
    for (const type of ['focusin', 'focusout', 'input', 'transitionrun', 'transitionend', 'transitioncancel', 'animationend']) listen(doc, type, relevant, true);
    listen(doc, 'load', event => { if (event.target?.tagName === 'LINK') schedule(); }, true);
    if (doc.head) cssChanges.observe(doc.head, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'media', 'disabled'] });
    refresh();
    return {
        refresh: schedule,
        dispose() {
            if (stopped) return;
            stopped = true;
            if (pending) win.cancelAnimationFrame(pending);
            resize?.disconnect(); changes.disconnect(); cssChanges.disconnect();
            for (const off of unlisten) off();
            observed.clear(); candidates = [];
            for (const [edge, name] of Object.entries(property)) {
                const [value, priority] = previous[edge];
                if (value) chat.style.setProperty(name, value, priority); else chat.style.removeProperty(name);
            }
        },
    };
}
