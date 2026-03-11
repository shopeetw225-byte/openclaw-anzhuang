# M5 Agent 4 任务：Tauri 安装器自更新（tauri-plugin-updater 配置）

## 你的角色
你负责让 **安装器本身**（.dmg/.msi/.AppImage）能通过 Tauri updater 插件自动检查并更新到 GitHub Releases 上的新版本。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `src-tauri/Cargo.toml`（追加 tauri-plugin-updater 依赖）
- `src-tauri/tauri.conf.json`（追加 plugins.updater 配置段）
- `docs/milestones/M5.md`（只在末尾追加你的日志区块）

## 工作规则
- 执行 cargo 命令前：`export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"`
- 不修改任何 .rs 文件（Rust 侧注册由 Agent 1 完成）
- 不修改前端代码

---

## 背景：Tauri v2 Updater 工作原理

```
安装器启动
    ↓
调用 tauri-plugin-updater 检查 endpoint 的 latest.json
    ↓
JSON 中有新版本 → 弹出对话框或由前端控制更新流程
    ↓
下载新安装包 → 安装替换 → 重启
```

GitHub Releases 的 `latest.json` 由 Tauri CI（M6 Agent 5 配置的 release.yml）在发布时自动生成并上传。

---

## 任务 1：Cargo.toml 追加依赖

在 `[dependencies]` 区块末尾追加：

```toml
tauri-plugin-updater = "2"
```

完整 dependencies 区块示例（保持所有已有依赖不变，仅追加）：

```toml
[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-opener = "2"
tauri-plugin-updater = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
tokio = { version = "1", features = ["full"] }
```

---

## 任务 2：tauri.conf.json 追加 plugins.updater 配置

在 `tauri.conf.json` 的 JSON 根对象末尾追加 `"plugins"` 字段（注意与已有 `"bundle"` 字段并列）：

```json
"plugins": {
  "updater": {
    "pubkey": "PLACEHOLDER_PUBKEY",
    "endpoints": [
      "https://github.com/openclaw/openclaw-anzhuang/releases/latest/download/latest.json"
    ]
  }
}
```

> **说明**：
> - `pubkey` 是 Tauri updater 签名验证的公钥。生产环境需要用 `tauri signer generate` 生成密钥对，把私钥存为 GitHub Secrets（`TAURI_SIGNING_PRIVATE_KEY`），公钥填入此处。开发阶段先填 `"PLACEHOLDER_PUBKEY"`，CI 会在打包时替换。
> - `endpoints` 指向 GitHub Releases 上自动生成的 `latest.json`（M6 CI 发布时上传）。
> - 不需要配置 `dialog: true`，前端可以自行控制更新 UI（通过 Rust 侧的 tauri-plugin-updater API）。

完整 tauri.conf.json 最终结构（只展示需要修改/追加的部分）：

```json
{
  "$schema": "...",
  "productName": "OpenClaw 安装器",
  ...
  "bundle": {
    ...
  },
  "plugins": {
    "updater": {
      "pubkey": "PLACEHOLDER_PUBKEY",
      "endpoints": [
        "https://github.com/openclaw/openclaw-anzhuang/releases/latest/download/latest.json"
      ]
    }
  }
}
```

---

## 任务 3：验证 Cargo.toml 更改可编译

```bash
export PATH="/Users/openclawcn/.cargo/bin:/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin:$PATH"
cd /Users/openclawcn/openclaw-anzhuang/src-tauri
cargo fetch   # 拉取新依赖（需联网）
cargo check
```

> 如果网络不可用，`cargo check` 可能因无法下载 tauri-plugin-updater 而失败。此时：
> 1. 记录错误信息
> 2. 在日志中注明"需联网执行 cargo fetch"
> 3. 验证 Cargo.toml 语法正确即可（不算 CI 失败）

---

## 生成签名密钥（可选，开发阶段备忘）

```bash
# 需要 tauri-cli 已安装
cargo tauri signer generate -w ~/.tauri/openclaw-installer.key
# 输出：
#   私钥路径：~/.tauri/openclaw-installer.key
#   公钥：dW50cnVzdGVkIGNvbW1lbnQ6...（base64）
# 把公钥填入 tauri.conf.json 的 pubkey 字段
# 把私钥内容存为 GitHub Secret: TAURI_SIGNING_PRIVATE_KEY
```

> 开发阶段跳过，M6 正式发布时执行。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M5.md` 末尾追加：

```
---
## Agent 4 执行日志（Tauri Updater 配置）

### 测试 [填入日期时间]
命令: cargo fetch && cargo check（或仅验证 Cargo.toml 语法）
结果: ✅ 通过 / ⚠️ 需联网下载依赖（Cargo.toml 语法正确）

✅ 完成时间: [填入]
完成说明: Cargo.toml 追加 tauri-plugin-updater = "2"；tauri.conf.json 追加 plugins.updater（endpoint 指向 GitHub Releases latest.json，pubkey 占位待 M6 生成）
```
