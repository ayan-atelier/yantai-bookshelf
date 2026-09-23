# 第一次上传到 GitHub

发布仓库：https://github.com/ayan-atelier/yantai-bookshelf

此包已把正式仓库地址写入独立版和助手版，版本清单的校验值也已重新生成。无需手动改代码。

## 网页上传

1. 解压 `yantai-bookshelf-v1.4.1-github.zip`，打开解压后的目录。应能看到 `manifest.json`、`index.js`、`versions.json` 等文件，以及 `.github` 和 `releases` 两个文件夹。
2. 用 `ayan-atelier` 登录 GitHub，打开上述仓库。空仓库点击 `uploading an existing file`（上传已有文件）；若已有文件，则点 `Add file → Upload files`（添加文件 → 上传文件）。
3. 把解压目录里面的所有文件和这两个文件夹一起拖入上传区域。选择的是目录里的内容，不是外面整层文件夹，也不是下载的 ZIP。上传列表里的路径应为 `manifest.json`、`releases/…`、`.github/workflows/publish-versions.yml`，前面没有额外的文件夹名。
4. 在提交说明里填 `Publish bookshelf v1.4.1`；分支选 `main`，点击 `Commit changes`（提交更改）。
5. 回到仓库，确认最外层能看到 `manifest.json`、`index.js`、`versions.json`、`.github` 和 `releases`。

`.github` 包含自动准备旧版本的流程，上传时需要一起带上。若电脑隐藏了这个文件夹，请开启文件管理器的隐藏文件显示；macOS Finder 可用 `Command + Shift + .`。完整上传包共 16 个文件，含文件夹内的文件。

## 上传后的确认

打开仓库上方的 `Actions`，找到 `Prepare bookshelf versions`。它会核对安装包与校验值，并从包内原始代码建立 `v1.4.0` 和 `v1.4.1` 两个固定版本分支。等待绿色勾号；若失败，打开失败记录，把错误页面交给开发者排查。

这个流程只创建新分支，已存在的版本会逐文件核对；同一版本号若被改过会停止，要求使用新版本号，不会强制覆盖旧分支。本次已在隔离的本地 Git 仓库验证；真实 GitHub Actions 仍需首次上传后确认。

发布成功后再验收联网功能：

- 独立版：用仓库网址安装，检查版本，退回 `v1.4.0`，再从酒馆扩展管理切回 `main`。
- 助手版：导入 `releases/yantai-bookshelf-v1.4.1-helper.json`，检查并回退，再重新导入 1.4.1。

1.4.0 原包还没有版本入口，回退前会提示。1.4.1 及后续版本保留入口。没有发布高于当前的版本时，检查结果应是已经为最新版，不会凭空出现新版。

## 后续发布

开发者更新版本号、保存新的独立包和助手包，并更新 `versions.json`。保留旧版包与版本分支，完成兼容检查后再上传。已经公开的版本号不重复使用；旧分支不随 `main` 改变。

本上传包包含书架程序、说明和发布流程。开发用的 `source.zip` 不需要上传；角色卡和聊天记录也无需上传。

GitHub 网页上传说明：https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository
