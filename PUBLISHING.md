# 将现有 GitHub 仓库更新到 V1.4.2

仓库：[ayan-atelier/yantai-bookshelf](https://github.com/ayan-atelier/yantai-bookshelf)

本次上传包用于更新这个已经配置好发布流程的仓库，包含三位反馈者已验证的分类菜单与毛玻璃修复。

## 网页上传

1. 下载并解压 `yantai-bookshelf-v1.4.2-github.zip`。
2. 打开解压后的目录，应直接看到 `manifest.json`、`index.js`、`versions.json` 等文件，以及 `releases` 文件夹。
3. 打开仓库首页，确认分支为 `main`，点击 `Add file → Upload files`（添加文件 → 上传文件）。
4. 将解压目录里面的全部文件与 `releases` 文件夹一起拖进去。不要拖外面整层目录，也不要直接上传刚下载的 GitHub ZIP。`releases` 内的两个发布文件保留原样，不需要再次解压。
5. 检查上传列表：应有 `manifest.json`、`versions.json`、`releases/yantai-bookshelf-v1.4.2-helper.json`、`releases/yantai-bookshelf-v1.4.2.zip`，这些路径前面不能再有 `yantai-bookshelf-v1.4.2-github/`。
6. 提交说明填 `Publish bookshelf v1.4.2`，选择直接提交到 `main`，点击 `Commit changes`（提交更改）。

本包共有 12 个文件（包含 releases 中的 2 个）。同路径文件上传后替换现有文件。没有放进本包的旧版安装包会继续留在仓库，不需要先删除任何旧文件。

`.github` 已经在仓库中，本次没有修改发布流程，不需要重新上传它。无需重建仓库，也无需另外手动创建版本分支。

## 等待发布完成

打开 [Actions](https://github.com/ayan-atelier/yantai-bookshelf/actions)，查看本次提交触发的 `Prepare bookshelf versions`，等待绿色勾号。

流程会验证新版与旧版安装包，保留 `v1.4.0`、`v1.4.1`，新增固定版本分支 `v1.4.2`。如果显示红叉，打开该次运行的报错记录交给开发者，不要先宣布在线更新完成。

## 发布后检查

- 仓库根目录的 `manifest.json` 为 `1.4.2`，`versions.json` 的 `latest` 为 `1.4.2`。
- `releases` 中同时保留 1.4.0、1.4.1、1.4.2 各自的 ZIP 和助手 JSON。
- 原先使用 V1.4.1、且支持在线更新的用户，在书架“版本与更新”里检查，应能看到 V1.4.2。更新后刷新酒馆。
- V1.4.2 的上一兼容版本为 V1.4.1。
- 网址安装时仍使用原来的仓库链接，无需修改帖子里的安装网址。

使用兼容测试包的用户：测试包与正式版都标记 1.4.2，因此没有同版本升级提示。助手版重新导入正式 JSON；独立测试版停用测试扩展，再启用原来的网址安装版并更新。只启用一份书架。

GitHub 上传说明：[Adding a file to a repository](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)。
