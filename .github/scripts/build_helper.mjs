#!/usr/bin/env node
/* Build the Tavern Helper script from the same source files as the native extension.
 * The existing V1.4.3 helper is used only as the stable outer runtime wrapper.
 */
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const write = (name, value) => fs.writeFileSync(path.join(root, name), value);

function extractEmbedded(helper) {
    const start = helper.content.indexOf('    module.textContent = ');
    const end = helper.content.indexOf('    module.addEventListener', start);
    if (start < 0 || end < 0) throw new Error('Could not locate helper module expression');
    const expression = helper.content.slice(start, end)
        .replace(/^\s*module\.textContent\s*=\s*/, '')
        .replace(/JSON\.stringify\(runtime\.token\)/g, '"TOKEN"')
        .replace(/;\s*$/, '');
    return Function(`return (${expression})`)();
}

function transform(source, { main = false } = {}) {
    let output = source
        // Imports are resolved by concatenating the modules in dependency order.
        .replace(/^import .*?;\s*$/gm, '')
        // Exports are unnecessary inside the single helper module.
        .replace(/^export\s+/gm, '');
    if (main) {
        output = output
            .replace("const appRoot = new URL('../../../../', import.meta.url);", "const appRoot = new URL('./', document.baseURI);")
            .replace('const nativeModuleURL = import.meta.url;', 'const nativeModuleURL = null;');
    }
    return output.trim() + '\n';
}

function replaceStyles(embedded, css) {
    const start = embedded.indexOf('    style.textContent = ');
    const end = embedded.indexOf(';\n    runtime.style', start);
    if (start < 0 || end < 0) throw new Error('Could not locate helper style literal');
    return embedded.slice(0, start) + '    style.textContent = ' + JSON.stringify(css) + embedded.slice(end);
}

function buildEmbedded(oldEmbedded) {
    const withStyle = replaceStyles(oldEmbedded, read('style.css'));
    const moduleStart = withStyle.indexOf('const MODULE = ');
    const tailStart = withStyle.indexOf('runtime.stop = () =>', moduleStart);
    if (moduleStart < 0 || tailStart < 0 || tailStart <= moduleStart) throw new Error('Could not locate helper module boundaries');
    const transformedIndex = transform(read('index.js'), { main: true });
    const indexInvoke = transformedIndex.lastIndexOf('\nonEnable();');
    if (indexInvoke < 0) throw new Error('Could not locate index startup invocation');
    const indexBody = transformedIndex.slice(0, indexInvoke);
    const modules = [
        '/* Presentation helpers and native chat entrypoints. No generation requests. */',
        transform(read('core.js')),
        transform(read('organizer.js')),
        transform(read('versions.js')),
        transform(read('version-ui.js')),
        transform(read('layout.js')),
        indexBody,
    ].join('\n');
    // Keep the V1.4.3 wrapper tail, including runtime.stop -> onEnable -> state.
    const tail = withStyle.slice(tailStart);
    return withStyle.slice(0, moduleStart) + modules + tail;
}

function rebuildContent(oldContent, embedded) {
    const lines = oldContent.split('\n');
    const beforeModuleLine = lines.slice(0, 45).join('\n') + '\n';
    const listenerIndex = oldContent.indexOf('    module.addEventListener');
    if (listenerIndex < 0) throw new Error('Could not locate helper listener');
    const afterExpression = oldContent.slice(listenerIndex);
    const token = embedded.indexOf('TOKEN');
    if (token < 0) throw new Error('Embedded helper token marker missing');
    const beforeToken = embedded.slice(0, token);
    const afterToken = embedded.slice(token + 'TOKEN'.length);
    // The token remains a runtime expression, exactly as in the original helper:
    // generated module source contains the parent frame's current runtime token.
    const expression = '    module.textContent = ' + JSON.stringify(beforeToken)
        + ' + JSON.stringify(runtime.token) + ' + JSON.stringify(afterToken) + ';\n';
    return beforeModuleLine + expression + afterExpression;
}

const old = JSON.parse(read('releases/yantai-bookshelf-v1.4.3-helper.json'));
const oldEmbedded = extractEmbedded(old);
const embedded = buildEmbedded(oldEmbedded);
const next = {
    ...old,
    name: '砚台 · 角色书架 V1.4.4（酒馆助手版）',
    info: `# 砚台 · 角色书架 V1.4.4\n创意与测试：阿砚 · 代码：Codex\n新增首页原生角色卡导入、标签视图、完整标签筛选、角色卡封面更换，以及存档页原生角色卡删除与二次确认。\n导入酒馆助手全局脚本库，只启用一份书架。\n支持角色展示、轻量分类、存档管理与浏览位置记忆。\n在书架设置的“版本与更新”里手动检查、更新或退回兼容版本。\n发布仓库：https://github.com/ayan-atelier/yantai-bookshelf\n完整代码随包提供；启动时不检查或下载更新，不调用模型。\n`,
};
next.content = rebuildContent(old.content, embedded);
next.content = next.content.replace('砚台 · 角色书架 V1.4.3 · 酒馆助手版', '砚台 · 角色书架 V1.4.4 · 酒馆助手版');
write('releases/yantai-bookshelf-v1.4.4-helper.json', JSON.stringify(next, null, 2) + '\n');
console.log(`built releases/yantai-bookshelf-v1.4.4-helper.json (${next.content.length} chars)`);
