# M6 Agent 5 任务：GitHub Actions Release CI（三平台并行构建 + 发布）

## 你的角色
你负责创建 **正式发布 CI 流水线**：push tag `v*` 时触发，在 macOS/Linux/Windows 三个 runner 上并行构建安装包，并发布到 GitHub Releases。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `.github/workflows/release.yml`（新建）
- `docs/milestones/M6.md`（只在末尾追加你的日志区块）

## 工作规则
- 不修改已有的 `m3-linux.yml` 和 `m4-windows.yml`（它们是开发期 CI，不做发布）
- release.yml 使用 `tauri-apps/tauri-action@v0`（官方 Tauri CI Action，会自动处理三平台打包）
- 代码签名相关的 secrets 先以占位注释说明，不填真实值（开发阶段）

---

## 任务：新建 .github/workflows/release.yml

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

# 允许 workflow 向 GitHub Releases 上传文件
permissions:
  contents: write

jobs:
  # ── macOS (universal: arm64 + x86_64) ─────────────────────────────────────
  build-macos:
    runs-on: macos-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          # 同时编译 arm64 和 x86_64，生成 universal binary
          targets: aarch64-apple-darwin,x86_64-apple-darwin

      - name: Install JS dependencies
        run: npm ci

      - name: Build & Publish (macOS universal)
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # 代码签名（开发阶段留空，正式发布时填入 Apple Developer secrets）
          # APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          # APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          # APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          # APPLE_ID: ${{ secrets.APPLE_ID }}
          # APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          # APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
          # Tauri Updater 签名私钥（M5 生成后填入）
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'OpenClaw 安装器 ${{ github.ref_name }}'
          releaseBody: |
            ## OpenClaw 安装器 ${{ github.ref_name }}

            ### 下载
            | 平台 | 文件 |
            |------|------|
            | macOS (Apple Silicon + Intel) | `OpenClaw_安装器_*_universal.dmg` |
            | Linux (Debian/Ubuntu) | `open-claw_*_amd64.deb` |
            | Linux (通用) | `open-claw_*_amd64.AppImage` |
            | Windows (NSIS) | `OpenClaw_安装器_*_x64-setup.exe` |
            | Windows (MSI) | `OpenClaw_安装器_*_x64_en-US.msi` |

            ### 安装说明
            - **macOS**：下载 .dmg，拖入 Applications。首次打开如遇安全提示，前往「系统设置 → 隐私与安全性」允许。
            - **Linux**：deb 包用 `sudo dpkg -i` 安装；AppImage 赋权后直接运行。
            - **Windows**：下载 .exe 或 .msi，双击安装。如遇 SmartScreen 提示，点"更多信息 → 仍要运行"。
          releaseDraft: false
          prerelease: false
          args: --target universal-apple-darwin

  # ── Linux (x86_64) ────────────────────────────────────────────────────────
  build-linux:
    runs-on: ubuntu-22.04
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Install system dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libwebkit2gtk-4.1-dev \
            libayatana-appindicator3-dev \
            librsvg2-dev \
            patchelf

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install JS dependencies
        run: npm ci

      - name: Build & Publish (Linux)
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'OpenClaw 安装器 ${{ github.ref_name }}'
          releaseBody: ''   # macOS job 已写正文，这里留空避免重复覆盖
          releaseDraft: false
          prerelease: false
          args: --bundles deb,appimage

  # ── Windows (x64) ─────────────────────────────────────────────────────────
  build-windows:
    runs-on: windows-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Install JS dependencies
        run: npm ci

      - name: Build & Publish (Windows)
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
          # Windows 代码签名（开发阶段留空，EV 证书获取后填入）
          # WINDOWS_CERTIFICATE_THUMBPRINT: ${{ secrets.WINDOWS_CERTIFICATE_THUMBPRINT }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: 'OpenClaw 安装器 ${{ github.ref_name }}'
          releaseBody: ''
          releaseDraft: false
          prerelease: false
          args: --bundles nsis,msi
```

---

## 发布流程说明

1. 本地打 tag：`git tag v0.2.0 && git push origin v0.2.0`
2. 三个 job 并行启动（约 15-20 分钟）
3. 构建完成后，各平台安装包自动上传到 GitHub Releases 的 `v0.2.0` 版本
4. `tauri-apps/tauri-action` 同时生成 `latest.json`（供 M5 Tauri Updater 端点使用）

---

## 需要配置的 GitHub Secrets

在 repo → Settings → Secrets → Actions 中添加：

| Secret 名 | 说明 | 何时配置 |
|-----------|------|---------|
| `TAURI_SIGNING_PRIVATE_KEY` | Updater 签名私钥（M5 Agent 4 生成） | M5 完成后 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码（无密码则留空字符串） | M5 完成后 |
| `APPLE_CERTIFICATE` 等 | macOS 代码签名（base64 编码的 .p12） | 正式发布前 |
| `WINDOWS_CERTIFICATE_THUMBPRINT` | Windows EV 证书 | 正式发布前（可先跳过） |

> 开发阶段没有这些 secrets 时，构建仍然可以成功，只是包没有签名（macOS 用户需手动在安全设置中允许；Windows 用户会看到 SmartScreen 提示）。

---

## 测试验证

在 macOS 上无法直接运行 workflow，做静态检查：

```bash
cd /Users/openclawcn/openclaw-anzhuang

# 验证 YAML 语法（需要安装 python-yaml 或 yq）
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" && echo "YAML 语法正确"

# 检查关键字段存在
grep -n "tauri-apps/tauri-action" .github/workflows/release.yml
grep -n "GITHUB_TOKEN" .github/workflows/release.yml
grep -n "universal-apple-darwin\|deb,appimage\|nsis,msi" .github/workflows/release.yml
```

成功标准：YAML 可解析，三平台关键字均出现。

---

## 完成后记录到里程碑文档

在 `docs/milestones/M6.md` 末尾追加：

```
---
## Agent 5 执行日志（Release CI）

### 测试 [填入日期时间]
命令: python3 yaml 语法验证 + grep 关键字
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: 新建 release.yml，三平台（macOS universal + Linux deb/appimage + Windows nsis/msi）并行构建，tauri-apps/tauri-action 自动发布到 GitHub Releases，secrets 占位说明齐全
```
