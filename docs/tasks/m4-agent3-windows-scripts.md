# M4 Agent 3 任务：Windows PowerShell 安装脚本（WSL/Node/OpenClaw/NSSM）

## 你的角色
你负责实现 Windows 下的安装脚本（`.ps1`），供后端 `run_install` 调用，并保证输出包含进度关键字（用于进度条/日志）。

## 项目位置
`/Users/openclawcn/openclaw-anzhuang/`

## 文件所有权（只修改这些文件）
- `scripts/windows/install-wsl.ps1`（新建）
- `scripts/windows/install-node-windows.ps1`（新建）
- `scripts/windows/install-openclaw.ps1`（新建）
- `scripts/windows/install-nssm.ps1`（新建）
- `scripts/windows/register-service-nssm.ps1`（新建）
- `docs/milestones/M4.md`（只在末尾追加你的日志区块）

## 工作规则
- 不修改任何现有脚本（`scripts/*.sh`、`scripts/diagnose.sh` 等）
- 只写脚本文件；本机是 macOS，**不要求实际执行成功**，但脚本内容要可落地在 Windows 10/11
- 所有脚本统一使用 **UTF-8**（无 BOM 也可）

---

## 进度关键词（必须输出这些子串，供后端推断进度）

这些关键词会被后端按行匹配，你只需要在关键步骤 `Write-Output`/`Write-Host`：

- `Checking Node`
- `Installing Node`
- `npm install -g openclaw`
- `openclaw gateway start`
- `gateway listening`
- `Done`

> 说明：WSL/NSSM 的关键词后端可能会额外补充；但以上必须出现，避免进度条一直卡住。

---

## 任务 1：`scripts/windows/install-wsl.ps1`

目标：启用 WSL2（必要时触发 UAC），并尽量安装 Ubuntu distro。

要求（MVP）：
- 检测是否管理员：
  - 如果不是管理员：用 `Start-Process -Verb RunAs` 重新以管理员执行自身脚本，然后退出（这样会触发 UAC）
- 启用功能（示例二选一）：
  - 优先：`wsl --install -d Ubuntu`（Windows 11/新 Win10 支持）
  - 兼容：`dism.exe /online /enable-feature ... /norestart` 开启 WSL 与 VirtualMachinePlatform，然后 `wsl --set-default-version 2`
- 如果系统提示需要重启：输出明确提示（例如 `REBOOT_REQUIRED`），并 `exit 0`（让上层把它当作“已完成该步骤但需重启”）
- 输出中至少包含一次 `Done`（表示此脚本阶段结束）

建议输出示例：
- `Write-Output "Installing WSL"`（可选）
- `Write-Output "Done"`

---

## 任务 2：`scripts/windows/install-node-windows.ps1`

目标：安装/确保 Node.js 20+（建议 22），优先无管理员方案；不行再走管理员方案。

要求：
- 先输出 `Checking Node`
- 如果已有 Node 且主版本 >= 20：直接输出 “已满足” 并结束
- 否则输出 `Installing Node` 并执行安装（建议实现优先级）：
  1) 如果有 `winget`：安装 Node（优先尝试 Node 22，失败则安装 LTS）
  2) 否则：下载 Node MSI 并静默安装（需要管理员时给出提示/自提权）
- 结束时再次打印 `node -v`（或错误提示）并输出 `Done`

---

## 任务 3：`scripts/windows/install-openclaw.ps1`

目标：安装 OpenClaw 并启动 Gateway，验证端口监听。

要求：
- 输出 `npm install -g openclaw` 后执行安装（用系统 `npm`）
- 输出 `openclaw gateway start` 后启动（`openclaw gateway start`）
- 检测端口 18789（建议 `Test-NetConnection 127.0.0.1 -Port 18789` 或 `netstat -ano`）
  - 若监听成功：输出 `gateway listening`
- 末尾输出 `Done`

---

## 任务 4：NSSM 安装与服务注册

### 4-1) `scripts/windows/install-nssm.ps1`

目标：把 `nssm.exe` 下载到用户目录，供后端与注册脚本使用。

约定安装路径（必须一致）：
- `"$HOME\\.openclaw\\bin\\nssm.exe"`

要求：
- 创建目录 `"$HOME\\.openclaw\\bin"`
- 下载 NSSM zip 并解压，把正确架构的 `nssm.exe` 放到上述路径
- 输出下载/落盘路径
- 末尾输出 `Done`

**必须使用以下固定 URL 和解压逻辑（不要让 agent 自己猜 URL）：**
```powershell
$NssmUrl   = "https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip"
$ZipPath   = "$env:TEMP\nssm.zip"
$ExtractTo = "$env:TEMP\nssm-extract"
Invoke-WebRequest -Uri $NssmUrl -OutFile $ZipPath -UseBasicParsing
Expand-Archive -Path $ZipPath -DestinationPath $ExtractTo -Force
# x64 目录固定为 win64
$NssmExe = Join-Path $ExtractTo "nssm-2.24-101-g897c7ad\win64\nssm.exe"
$Dest = "$HOME\.openclaw\bin"
New-Item -ItemType Directory -Force -Path $Dest | Out-Null
Copy-Item $NssmExe -Destination "$Dest\nssm.exe" -Force
```
> 备用方案（nssm.cc 不可访问时）：`winget install nssm` 或改用 `sc.exe create openclaw-gateway ...` 直接注册 Windows 原生服务（无需 NSSM）。

### 4-2) `scripts/windows/register-service-nssm.ps1`

目标：用 NSSM 注册 Windows 服务 `openclaw-gateway`（开机自启）。

要求：
- 服务名固定：`openclaw-gateway`
- 找到 `nssm.exe`：
  - 优先 `$HOME\\.openclaw\\bin\\nssm.exe`，否则尝试 `Get-Command nssm.exe`
- 找到 `openclaw` 命令：
  - `Get-Command openclaw` 获取路径；如果是 `.cmd`，用 `cmd.exe /c` 包装
- 注册并设置为自动启动（`SERVICE_AUTO_START`）
- 设置 stdout/stderr 日志到 `"$HOME\\.openclaw\\logs\\windows-service.log"`（目录不存在则创建）
- 末尾输出 `Done`

---

## 自检（在 macOS 上做静态检查即可）

至少确认文件存在，并包含关键字符串：

```bash
cd /Users/openclawcn/openclaw-anzhuang
rg -n \"Checking Node|Installing Node|npm install -g openclaw|openclaw gateway start|gateway listening|Done\" scripts/windows/*.ps1
```

如果你的环境安装了 `pwsh`（可选），可以做语法解析：

```bash
pwsh -NoProfile -File scripts/windows/install-wsl.ps1
```

---

## 完成后记录到里程碑文档

在 `docs/milestones/M4.md` 末尾追加：

```
---
## Agent 3 执行日志（Windows PowerShell 脚本）

### 自检 [填入日期时间]
命令: rg 关键字检查（可选：pwsh -NoProfile -File）
结果: ✅ 通过 / ❌ 不通过

✅ 完成时间: [填入]
完成说明: 新增 install-wsl/node/openclaw/nssm 脚本，关键字齐全，供 run_install 调用
```

