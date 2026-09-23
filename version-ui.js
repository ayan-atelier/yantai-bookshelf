/* Keep release controls in the extension settings, away from the bookshelf toolbar. */
export function openVersionDialog({ manager, element, button, dialog, currentVersion, notify, refresh }) {
    const { modal, body, notice } = dialog('书架版本');
    body.append(element('p', 'jd-dialog-intro', `当前版本 V${currentVersion}`));
    let checked = null;
    const actions = element('div', 'jd-version-actions');
    const details = element('p', 'jd-version-notes');
    const inputs = [];
    if (manager.mode === 'helper') {
        const label = element('label', 'jd-version-source');
        label.append(element('span', '', '发布仓库'));
        const input = element('input', 'jd-input'); input.type = 'url'; input.value = manager.repository;
        input.placeholder = 'https://github.com/作者/仓库名'; input.setAttribute('aria-label', '书架发布仓库');
        const store = button('保存网址', 'jd-secondary-button', () => {
            try { input.value = manager.setRepository(input.value); checked = null; sync(); notice.textContent = '仓库网址已保存，可以检查版本。'; }
            catch (error) { notice.textContent = error.message; }
        });
        label.append(input, store); body.append(label); inputs.push(input, store);
    }
    const check = button('检查更新', 'jd-secondary-button', async () => {
        await run(async () => {
            checked = await manager.check();
            details.textContent = checked.latest ? `V${checked.latest.version}\n${checked.latest.notes}` : checked.unavailableLatest ? '新版暂未完成发布或与当前酒馆不兼容。' : '当前没有可用的新版本。';
            notice.textContent = checked.previous ? `可退回 V${checked.previous.version}。切换前会保存书架设置备份。` : '暂无更早的兼容版本可回退。';
        });
    });
    const update = button('更新到最新版', 'jd-primary-button', () => confirm(checked?.latest));
    const rollback = button('退回上一版本', 'jd-secondary-button', () => confirm(checked?.previous));
    const reload = button('刷新酒馆', 'jd-primary-button', async () => {
        try { await refresh(); } catch (error) { notice.textContent = error.message; }
    });
    actions.append(check, update, rollback, reload); body.append(actions, details);
    body.append(element('small', 'jd-version-help', '只在你点击时检查或切换版本。回退后停留在旧版；角色卡和聊天存档保持原样。'));
    function sync() {
        for (const input of inputs) input.disabled = manager.busy || manager.reloadNeeded;
        check.disabled = manager.busy || manager.reloadNeeded;
        update.disabled = manager.busy || manager.reloadNeeded || !checked?.latest;
        rollback.disabled = manager.busy || manager.reloadNeeded || !checked?.previous;
        update.textContent = checked?.latest ? `更新到 V${checked.latest.version}` : '更新到最新版';
        rollback.textContent = checked?.previous ? `退回 V${checked.previous.version}` : '退回上一版本';
        reload.hidden = !manager.reloadNeeded;
    }
    async function run(action) {
        notice.textContent = '正在处理，请稍候…';
        const promise = action(); sync();
        try { await promise; }
        catch (error) { notice.textContent = error.message; if (!modal.isConnected) notify(error.message); }
        finally { sync(); }
    }
    function confirm(target) {
        if (!target || manager.busy || manager.reloadNeeded) return;
        const prompt = dialog(`切换到 V${target.version}？`);
        prompt.body.append(element('p', 'jd-dialog-intro', target.notes || '将切换书架程序版本，保留当前书架设置。'));
        prompt.body.append(element('p', 'jd-dialog-intro', '会先保存设置备份。兼容的分类、收藏、置顶与封面位置继续保留；旧版本可能不显示新增功能。'));
        if (target.version === '1.4.0') prompt.body.append(element('p', 'jd-dialog-intro', 'V1.4.0 尚无位置记忆和版本按钮。回退后，如需再升级，助手版需重新导入新版 JSON；独立扩展可从酒馆扩展管理切回 main。'));
        const row = element('div', 'jd-version-actions');
        const cancel = button('取消', 'jd-secondary-button', () => prompt.modal.close());
        row.append(cancel, button('确认切换', 'jd-primary-button', () => {
            prompt.modal.close();
            void run(async () => {
                const version = await manager.apply(checked, target);
                notice.textContent = `已切换到 V${version}，请刷新酒馆。`;
                if (!modal.isConnected) notify(notice.textContent);
            });
        }));
        prompt.body.append(row); cancel.focus();
    }
    sync();
}
