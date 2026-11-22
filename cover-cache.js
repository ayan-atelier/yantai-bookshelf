/* Client-side 810x1080 WebP cover thumbnail cache (IndexedDB + Blob URL).
 * Prevents 300~2000+ raw multi-megabyte character PNGs from exhausting mobile
 * WebView / Safari bitmap memory while preserving crisp 3:4 Retina cover quality.
 */
export const COVER_CACHE_DB = 'yantai-bookshelf-covers-v1';
export const COVER_CACHE_STORE = 'thumbs';
export const COVER_MAX_WIDTH = 810;
export const COVER_MAX_HEIGHT = 1080;
export const COVER_WEBP_QUALITY = 0.92;
export const COVER_MAX_ENTRIES = 1600;
export const COVER_MIN_ENCODE_PIXELS = 360000;

export function computeCoverTargetDimensions(
    srcWidth,
    srcHeight,
    maxWidth = COVER_MAX_WIDTH,
    maxHeight = COVER_MAX_HEIGHT,
) {
    const w = Number(srcWidth) || 0;
    const h = Number(srcHeight) || 0;
    if (!(w > 0 && h > 0)) {
        return { width: 0, height: 0, shouldCache: false };
    }
    const scale = Math.min(1, maxWidth / w, maxHeight / h);
    const width = Math.max(1, Math.round(w * scale));
    const height = Math.max(1, Math.round(h * scale));
    const shouldCache = scale < 0.995 || w * h >= COVER_MIN_ENCODE_PIXELS;
    return { width, height, shouldCache };
}

export function isSameOriginCharacterAsset(src, baseHref) {
    if (typeof src !== 'string' || !src.trim()) return false;
    try {
        const parsed = new URL(src, baseHref || 'http://localhost/');
        const originBase = new URL(baseHref || parsed.href);
        if (parsed.origin !== originBase.origin) return false;
        return /\/characters\/[^/?#]+$/i.test(parsed.pathname);
    } catch {
        return false;
    }
}

export function buildCoverCacheKey(entityId, src, { avatarRevision = 0, dataSize = 0 } = {}) {
    if (!entityId || !src) return '';
    const cleanPath = String(src).split('?')[0];
    const rev = Number(avatarRevision) || 0;
    const size = Number(dataSize) || 0;
    return `char:${entityId}|r:${rev}|s:${size}|u:${cleanPath}`;
}

export function createCoverThumbnailCache({
    indexedDBImpl = globalThis.indexedDB,
    documentImpl = globalThis.document,
    urlImpl = globalThis.URL,
    maxConcurrency = 2,
} = {}) {
    const memoryUrls = new Map();
    const keyByEntity = new Map();
    const inflightEncode = new Set();
    const encodeQueue = [];
    let activeEncodes = 0;
    let dbPromise = null;
    let dbDisabled = false;
    let disposed = false;
    let pruneScheduled = false;

    function canUseIdb() {
        return Boolean(!dbDisabled && !disposed && indexedDBImpl && typeof indexedDBImpl.open === 'function');
    }

    function canUseBlobUrl() {
        return Boolean(urlImpl && typeof urlImpl.createObjectURL === 'function' && typeof urlImpl.revokeObjectURL === 'function');
    }

    function openDb() {
        if (!canUseIdb()) return Promise.resolve(null);
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(resolve => {
            try {
                const req = indexedDBImpl.open(COVER_CACHE_DB, 1);
                req.onupgradeneeded = () => {
                    const db = req.result;
                    if (!db.objectStoreNames.contains(COVER_CACHE_STORE)) {
                        const store = db.createObjectStore(COVER_CACHE_STORE, { keyPath: 'key' });
                        store.createIndex('byEntity', 'entityId', { unique: false });
                        store.createIndex('byTime', 'ts', { unique: false });
                    }
                };
                req.onsuccess = () => {
                    const db = req.result;
                    db.onversionchange = () => {
                        try { db.close(); } catch {}
                        dbPromise = null;
                    };
                    resolve(db);
                };
                req.onerror = () => {
                    dbDisabled = true;
                    dbPromise = null;
                    resolve(null);
                };
                req.onblocked = () => {
                    dbPromise = null;
                    resolve(null);
                };
            } catch {
                dbDisabled = true;
                dbPromise = null;
                resolve(null);
            }
        });
        return dbPromise;
    }

    async function readCachedBlob(key) {
        const db = await openDb();
        if (!db) return null;
        return new Promise(resolve => {
            try {
                const tx = db.transaction(COVER_CACHE_STORE, 'readonly');
                const req = tx.objectStore(COVER_CACHE_STORE).get(key);
                req.onsuccess = () => {
                    const rec = req.result;
                    if (rec && rec.blob && typeof rec.blob.size === 'number' && rec.blob.size > 0) {
                        resolve(rec.blob);
                    } else {
                        resolve(null);
                    }
                };
                req.onerror = () => resolve(null);
            } catch {
                resolve(null);
            }
        });
    }

    async function writeCachedBlob(key, entityId, blob, width, height) {
        const db = await openDb();
        if (!db || disposed) return;
        await new Promise(resolve => {
            try {
                const tx = db.transaction(COVER_CACHE_STORE, 'readwrite');
                const store = tx.objectStore(COVER_CACHE_STORE);
                if (store.indexNames.contains('byEntity')) {
                    const idxReq = store.index('byEntity').openCursor(entityId);
                    idxReq.onsuccess = () => {
                        const cursor = idxReq.result;
                        if (cursor) {
                            if (cursor.primaryKey !== key) cursor.delete();
                            cursor.continue();
                        }
                    };
                }
                store.put({ key, entityId, width, height, ts: Date.now(), blob });
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
                tx.onabort = () => resolve();
            } catch {
                resolve();
            }
        });
        schedulePruneIfNeeded(db);
    }

    async function deleteCachedKey(key) {
        const prevUrl = memoryUrls.get(key);
        if (prevUrl) {
            memoryUrls.delete(key);
            try { urlImpl.revokeObjectURL(prevUrl); } catch {}
        }
        const db = await openDb();
        if (!db) return;
        await new Promise(resolve => {
            try {
                const tx = db.transaction(COVER_CACHE_STORE, 'readwrite');
                tx.objectStore(COVER_CACHE_STORE).delete(key);
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch {
                resolve();
            }
        });
    }

    function schedulePruneIfNeeded(db) {
        if (pruneScheduled || disposed || !db) return;
        pruneScheduled = true;
        setTimeout(() => {
            pruneScheduled = false;
            if (disposed) return;
            try {
                const tx = db.transaction(COVER_CACHE_STORE, 'readwrite');
                const store = tx.objectStore(COVER_CACHE_STORE);
                const countReq = store.count();
                countReq.onsuccess = () => {
                    const extra = (Number(countReq.result) || 0) - COVER_MAX_ENTRIES;
                    if (extra <= 0 || !store.indexNames.contains('byTime')) return;
                    let removed = 0;
                    const curReq = store.index('byTime').openCursor();
                    curReq.onsuccess = () => {
                        const cursor = curReq.result;
                        if (cursor && removed < extra) {
                            cursor.delete();
                            removed += 1;
                            cursor.continue();
                        }
                    };
                };
            } catch {}
        }, 1200);
    }

    function rememberMemoryBlobUrl(key, entityId, blob) {
        if (!canUseBlobUrl() || disposed) return '';
        const existing = memoryUrls.get(key);
        if (existing) return existing;
        const prevKey = keyByEntity.get(entityId);
        if (prevKey && prevKey !== key) {
            const oldUrl = memoryUrls.get(prevKey);
            if (oldUrl) {
                memoryUrls.delete(prevKey);
                try { urlImpl.revokeObjectURL(oldUrl); } catch {}
            }
        }
        const nextUrl = urlImpl.createObjectURL(blob);
        memoryUrls.set(key, nextUrl);
        keyByEntity.set(entityId, key);
        return nextUrl;
    }

    function pumpEncodeQueue() {
        while (!disposed && activeEncodes < maxConcurrency && encodeQueue.length > 0) {
            const job = encodeQueue.shift();
            activeEncodes += 1;
            job().finally(() => {
                activeEncodes -= 1;
                pumpEncodeQueue();
            });
        }
    }

    function encodeImageElementToBlob(imgEl, width, height) {
        return new Promise(resolve => {
            try {
                const doc = imgEl?.ownerDocument || documentImpl;
                const canvas = doc?.createElement?.('canvas');
                if (!canvas || typeof canvas.getContext !== 'function' || typeof canvas.toBlob !== 'function') {
                    resolve(null);
                    return;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx2d = canvas.getContext('2d', { alpha: true });
                if (!ctx2d) {
                    resolve(null);
                    return;
                }
                ctx2d.imageSmoothingEnabled = true;
                if ('imageSmoothingQuality' in ctx2d) {
                    ctx2d.imageSmoothingQuality = 'high';
                }
                ctx2d.drawImage(imgEl, 0, 0, width, height);
                canvas.toBlob(
                    blob => {
                        canvas.width = 0;
                        canvas.height = 0;
                        resolve(blob && blob.size > 0 ? blob : null);
                    },
                    'image/webp',
                    COVER_WEBP_QUALITY,
                );
            } catch {
                resolve(null);
            }
        });
    }

    function enqueueBackgroundEncode(key, entityId, imgEl) {
        if (disposed || !canUseIdb() || !canUseBlobUrl() || memoryUrls.has(key) || inflightEncode.has(key)) {
            return;
        }
        const natW = Number(imgEl?.naturalWidth) || 0;
        const natH = Number(imgEl?.naturalHeight) || 0;
        const dims = computeCoverTargetDimensions(natW, natH);
        if (!dims.shouldCache) return;

        inflightEncode.add(key);
        encodeQueue.push(async () => {
            try {
                if (disposed || memoryUrls.has(key)) return;
                const blob = await encodeImageElementToBlob(imgEl, dims.width, dims.height);
                if (!blob || disposed) return;
                rememberMemoryBlobUrl(key, entityId, blob);
                await writeCachedBlob(key, entityId, blob, dims.width, dims.height);
            } finally {
                inflightEncode.delete(key);
            }
        });
        pumpEncodeQueue();
    }

    function attachCoverImage(
        imgEl,
        {
            entity,
            chosenSrc = '',
            fallbackSrc = '',
            baseHref = '',
            avatarRevision = 0,
            dataSize = 0,
        } = {},
    ) {
        if (!imgEl || !chosenSrc) return;
        disposed = false;

        const eligible =
            entity?.kind === 'char' &&
            Boolean(entity.id) &&
            canUseIdb() &&
            canUseBlobUrl() &&
            isSameOriginCharacterAsset(chosenSrc, baseHref);

        const key = eligible
            ? buildCoverCacheKey(entity.id, chosenSrc, { avatarRevision, dataSize })
            : '';

        let triedOriginal = false;
        let triedFallback = false;

        imgEl.addEventListener('error', () => {
            if (key && imgEl.dataset?.jdThumbBlob === '1' && !triedOriginal) {
                triedOriginal = true;
                delete imgEl.dataset.jdThumbBlob;
                void deleteCachedKey(key);
                imgEl.src = chosenSrc;
                return;
            }
            if (fallbackSrc && !triedFallback && imgEl.src !== fallbackSrc) {
                triedFallback = true;
                imgEl.src = fallbackSrc;
                return;
            }
            imgEl.remove();
        });

        if (!key) {
            imgEl.src = chosenSrc;
            return;
        }

        const fastUrl = memoryUrls.get(key);
        if (fastUrl) {
            imgEl.dataset.jdThumbBlob = '1';
            imgEl.src = fastUrl;
            return;
        }

        imgEl.addEventListener(
            'load',
            () => {
                if (imgEl.dataset?.jdThumbBlob === '1') return;
                enqueueBackgroundEncode(key, entity.id, imgEl);
            },
            { once: true },
        );

        void readCachedBlob(key).then(blob => {
            if (disposed) return;
            if (blob) {
                const blobUrl = rememberMemoryBlobUrl(key, entity.id, blob);
                if (blobUrl) {
                    imgEl.dataset.jdThumbBlob = '1';
                    imgEl.src = blobUrl;
                    return;
                }
            }
            imgEl.src = chosenSrc;
        });
    }

    function invalidateAllMemoryUrls() {
        for (const u of memoryUrls.values()) {
            try { urlImpl?.revokeObjectURL?.(u); } catch {}
        }
        memoryUrls.clear();
        keyByEntity.clear();
    }

    function dispose() {
        disposed = true;
        encodeQueue.length = 0;
        inflightEncode.clear();
        invalidateAllMemoryUrls();
        if (dbPromise) {
            dbPromise.then(db => { try { db?.close?.(); } catch {} });
            dbPromise = null;
        }
    }

    return {
        attachCoverImage,
        invalidateAllMemoryUrls,
        dispose,
    };
}
