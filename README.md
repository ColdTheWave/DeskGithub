# DeskGitHub

一个基于 Electron + React 的跨平台 GitHub 桌面客户端。登录 GitHub 账号后解锁完整功能，支持中英文界面切换、深浅色主题、系统代理以及本地 Git 仓库管理。

> 本项目由 AI 协助开发完成。

> 未登录时可浏览公开数据（受限模式）；通过 GitHub Device Flow 登录后可使用私有仓库、通知、提交代码等完整功能。

## 功能特性

### 浏览与协作
- **Dashboard**：关注动态、热门仓库、快捷入口
- **仓库详情**：Code / Commits / Issues / Pull Requests / Events / Discussions / Actions / Releases / Projects / Insights / Security 多标签页
- **代码浏览**：目录树、文件预览、Markdown 渲染、语法高亮、文件历史
- **Issue / PR**：详情、评论、标签、指派人、Reactions、代码评审与 Diff、Compare 对比、上传附件
- **Wiki**：查看、编辑、新建与删除页面
- **搜索结果**：仓库、用户、Issue 全局搜索（`⌘K` / `Ctrl+K`）

### 账号与个人内容
- **通知中心**：未读/全部通知管理
- **Gists**：查看、创建、编辑代码片段（公开/私密）
- **用户与组织主页**：资料、仓库列表、贡献者
- **Commit 详情**：提交信息与文件变更

### 本地 Git
- 克隆仓库、查看状态与提交历史、分支切换
- 暂存并提交、Push / Pull、Diff 统计
- 在文件管理器中打开仓库目录

### 桌面体验
- 中英文界面实时切换
- 深色 / 浅色主题
- 系统托盘、单实例运行、原生菜单
- 代理设置：系统代理 / 直连 / 手动（HTTP、HTTPS、SOCKS5），支持代理连通性测试
- Token 使用系统钥匙串加密存储（Electron `safeStorage`）

## 技术栈

- **运行时**：Electron 45
- **前端**：React 19、TypeScript、Vite 8
- **构建**：esbuild（主进程 / preload 打包）、electron-builder（安装包）
- **UI**：原生 CSS、lucide-react 图标
- **内容渲染**：marked + highlight.js + DOMPurify

## 环境要求

- Node.js 20 及以上（推荐 20 LTS）
- npm 9 及以上
- 本地已安装 `git`（使用「本地 Git」功能时需要）
- macOS / Windows / Linux

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式（Vite + Electron 热更新）
npm run dev

# 类型检查
npm run typecheck
```

## 构建与打包

```bash
# 构建产物（dist/ + dist-electron/）
npm run build

# 构建并以生产模式启动
npm start

# 打包当前平台安装包（输出到 release/）
npm run dist

# 指定平台
npm run dist:mac     # macOS：dmg + zip
npm run dist:win     # Windows：nsis + portable
npm run dist:linux   # Linux：AppImage + deb
```

也可以直接双击根目录下的脚本（macOS）：

- `一键打包.command`：按当前系统自动选择目标平台
- `打包-Mac.command` / `打包-Windows.command` / `打包-Linux.command`

> Windows / Linux 安装包建议在对应系统上打包。

## GitHub 登录配置

DeskGitHub 使用 **OAuth Device Flow** 登录，需要你自己的 GitHub OAuth App：

1. 打开 GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. 勾选 **Enable Device Flow**
3. 复制 **Client ID**，填入 DeskGitHub 的登录弹窗
4. 按提示在浏览器中打开授权页面并输入设备码

申请权限范围：`repo`、`read:user`、`notifications`、`read:org`、`gist`、`workflow`、`user:follow`、`project`、`read:packages`、`delete_repo`、`write:discussion`。

Client ID 与登录 Token 仅保存在本机，不会上传到任何第三方服务器。

## 项目结构

```
deskgithub/
├── electron/            # 主进程
│   ├── main.ts          # 窗口、菜单、托盘、IPC 注册
│   ├── preload.ts       # 安全桥接（contextBridge）
│   ├── auth.ts          # Device Flow 登录与 Token 加密存储
│   ├── github.ts        # GitHub API 代理请求
│   ├── git.ts           # 本地 git 命令封装
│   ├── extras.ts        # Actions 日志、制品、Release 资源、Wiki
│   └── proxy.ts         # 代理配置
├── src/                 # 渲染进程（React）
│   ├── App.tsx          # 路由入口
│   ├── components/      # 通用组件（Shell、Modal、Markdown 等）
│   ├── lib/             # API、状态、i18n、类型
│   └── pages/           # 页面（Dashboard、Repos、Issues、Gists、Local 等）
├── scripts/             # 构建辅助脚本
├── build/               # 应用图标等打包资源
├── index.html
├── vite.config.ts
└── package.json
```

## 安全说明

- 渲染进程启用 `contextIsolation`、禁用 `nodeIntegration`，并开启 `sandbox`
- 所有 GitHub 请求经由主进程转发，Token 不暴露给页面
- Token 通过 `safeStorage` 加密后写入用户数据目录
- 外部链接统一交给系统浏览器打开

## Buy Me a Coffee

如果这个项目对你有帮助，欢迎请我喝杯咖啡 ☕
![Buy Me a Coffee](qr-code.jpg)


## 许可证

MIT
