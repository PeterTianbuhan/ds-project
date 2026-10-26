# DS Project

一个模仿 Claude Projects 的 **DeepSeek Harness 本地插件**：在一个主对话里思考，把独立任务交给并行线程，共享项目记忆。

主对话负责理解、调度和汇报；子线程可以讨论、研究或处理实际工作。线程之间能传递消息、回报结果，你也可以随时进入某条线程继续聊。

**试用版 · 已验证环境：macOS + DeepSeek Harness 0.2.1-rc.3。** 这是社区插件，非 Anthropic 或 DeepSeek 官方产品。

## 安装

先安装并配置好 DeepSeek Harness，确认普通会话能正常使用模型。插件沿用宿主的模型、账号、工具与权限，无需填写另一份 API Key。

1. 从 [Releases](https://github.com/PeterTianbuhan/ds-project/releases) 下载 `ds-project-0.8.8.tgz` 到下载目录。
2. 等正在执行的任务结束，然后安装：

```sh
dsh plugin --profile desktop add "$HOME/Downloads/ds-project-0.8.8.tgz"
```

如果 macOS 终端找不到 `dsh`，使用桌面 App 自带的 CLI：

```sh
"/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh" plugin --profile desktop add "$HOME/Downloads/ds-project-0.8.8.tgz"
```

3. 重启 DeepSeek Harness，点击左侧 **项目**，新建项目并选择本机工作目录。

使用 `dsh web` 时，将安装命令中的 `--profile desktop` 改为 `--profile web`，再重启对应服务。安装在哪个 profile，就在哪个 profile 使用。

更新也使用同一条 `plugin add` 命令，换成新版本文件，之后重启 DSH。若正在使用 DS Bot 的 Bot 模式，需要先回到 DSH 原生界面，才能看到侧栏项目入口。

## 怎么用

在主对话里说你想做什么。简单问题直接聊，需要调查或操作的事情由协调者安排线程。第一次打开空项目会有一次简短开场，选择目录不会自动要求它扫描仓库。

- **主对话 + 线程**：主入口保留在左侧，右侧查看线程和继续追问；中间分隔线可拖动。
- **线程通信**：简洁模式显示派发、转发与回报卡片。点击线程名打开对应对话，展开查看完整消息。
- **简洁 / 全部展示**：默认显示正文、待办、成果、提问和审批，隐藏推理与全部工具调用，包括失败的调用。选择“全部展示 · DSH”查看原始过程。会话级错误仍显示。
- **模型与权限**：直接复用 DSH 原生输入框、模型选择器、附件和权限控件。模型跟随会话，新线程继承发起会话的模型选择。
- **线程状态**：按 Waiting on you / Working / Idle / Resolved 分组。左侧圆圈可多选，支持批量 Resolve / Reopen；运行中的线程先用输入框的停止按钮停止。
- **记忆**：直接说“记住”或“忘记”；点击项目名称进入设置，查看和编辑项目指令、`MEMORY.md` 及主题记忆文件。
- **Library**：引用本机文件或文件夹，导入资料、添加链接、查看线程成果。支持目录层级和任意文件类型；文本、图片可预览，其他文件可下载或通过原生文件卡片打开。

项目设置里可以改名称、图标、颜色、目标和工作目录，查看记忆与用量。删除项目有二次确认，永久删除插件的项目记录与内部资料；不会删除你选定的工作目录或原始引用文件。DSH 保存的底层执行日志独立保留。

## 本地运行与限制

- 主会话与子会话使用同一个 base 工作目录，沿用 DSH 原生工作区和权限。Library 引用不是权限白名单；插件没有额外的读取沙箱。
- 当前最多同时运行 **3 条工作线程**，主会话独立，其他任务排队。所有线程都有项目调度工具。
- 主会话每轮带入最多 24 条、24,000 **字符**预算的近期记录，以及近期线程动态和共享记忆；历史消息整条纳入，不截断单条正文。旧记录仍可搜索。子会话沿用 DSH 的上下文压缩。
- 项目数据默认保存在 `~/.dsh/ds-project/`，会话日志由 DSH 管理。未提供云同步、团队隔离或云端常驻执行。发给模型的内容仍经你配置的模型服务处理。
- 协调者在工具目录和执行入口均受限，只负责沟通与调度。表达规范要求清晰简洁，并跟随用户常用语言；模型仍可能长时间执行而不主动汇报。
- 不同线程可能同时修改同一工作目录；插件不会自动为它们创建 Git worktree。
- 文件导入上限为单个 8 MB，文本预览上限 500 KB；本机引用没有这个导入大小限制。
- 原生 `present` 文件卡片保留系统应用打开功能，内嵌侧栏文件预览尚未接通。
- 尚未接入 PR 生命周期的 Ready for review / Landing，也没有一周无活动自动结项。
- Windows、Linux 和其他 DSH 版本尚未实机验收。插件依赖 DSH 的原生扩展接口及部分语义 DOM，宿主升级后可能需要适配。

## 开发

Node.js 22.12+。源码不包含 DSH 宿主，也不需要把本机 DSH 或个人数据提交到仓库。

```sh
git clone https://github.com/PeterTianbuhan/ds-project.git
cd ds-project
npm ci --legacy-peer-deps
npm run package
npm test
```

测试包含静态页面的服务验收，因此先构建打包，再运行测试。

生成的 `ds-project-0.8.8.tgz` 可按上述方式安装。`private: true` 仅用于防止误发到 npm；源码与 GitHub Release 公开。

- `host/`：线程调度、上下文、记忆、资料及 API。
- `index.js`、`cordis.patch.yml`：DSH 插件和会话模板。
- `src/client.jsx`：原生侧栏与会话扩展；两侧均复用 `conversation.content`。
- `src/`：项目列表、设置、Library 与线程视图。
- `test/`：独立单元／集成测试，不调用真实模型。

[机制说明](docs/research.md) · [界面与本地适配](docs/design.md) · [更新记录](CHANGELOG.md)

## 反馈与许可

在 [Issues](https://github.com/PeterTianbuhan/ds-project/issues) 提交问题，附上插件版本、DSH 版本、系统、复现步骤及简洁／全部展示模式。分享截图和日志前请移除账号、令牌、个人对话和私有文件内容。

源码使用 [MIT License](LICENSE)。编译 UI 所用依赖的许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
