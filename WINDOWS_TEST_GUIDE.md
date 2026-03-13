# 🪟 Windows 测试指南

## 📋 准备工作

### 代码推送到 GitHub

```bash
# 1. 添加远程仓库（如果还没有）
git remote add origin https://github.com/YOUR_USERNAME/openclaw-anzhuang.git

# 2. 推送代码
git push -u origin main

# 3. 查看提交
# https://github.com/YOUR_USERNAME/openclaw-anzhuang/commits/main
```

### 获取最新代码

在 Windows 上：

```powershell
# 克隆仓库
git clone https://github.com/YOUR_USERNAME/openclaw-anzhuang.git
cd openclaw-anzhuang

# 或更新已有仓库
git pull origin main
```

---

## 🔨 本地构建

### 前置要求

- Windows 10 / Windows 11 (x64)
- Node.js 20+ https://nodejs.org/
- Rust https://rustup.rs/
- Visual Studio Build Tools 2022 (C++ 工作负载)
  https://visualstudio.microsoft.com/downloads/

### 构建步骤

```powershell
# 1. 进入项目目录
cd openclaw-anzhuang

# 2. 安装依赖
npm install

# 3. 构建 MSI 和 EXE
npm run tauri build

# 4. 查看产物
# src-tauri/target/release/bundle/msi/*.msi
# src-tauri/target/release/bundle/nsis/*.exe
```

---

## ✅ 测试场景

### 场景 1️⃣ : WSL2 已安装 + 有 Ubuntu

**环境**：
```
wsl -l -v
NAME      STATE           VERSION
Ubuntu    Running         2
```

**预期流程**：
```
安装器检测 → WSL available + has Ubuntu
           → 直接运行 install-linux.sh
           → 在 WSL Ubuntu 中安装 OpenClaw
           → ✅ 安装完成
```

**验证点**：
- [ ] 检测到 WSL 和 Ubuntu
- [ ] 跳过 WSL/Ubuntu 安装步骤
- [ ] 直接进入 Linux 安装路径
- [ ] 安装完成后 Gateway 运行正常

---

### 场景 2️⃣ : WSL2 已安装 + 无 Ubuntu

**环境**：
```
wsl -l -v
NAME           STATE           VERSION
(无其他发行版)
```

**预期流程**：
```
安装器检测 → WSL available + no Ubuntu
           → 运行 install-ubuntu.ps1
           → 安装 Ubuntu 到 WSL
           → 系统可能需要重启
           → 点击"重试"继续
           → 运行 install-linux.sh
           → ✅ 安装完成
```

**验证点**：
- [ ] 检测到 WSL 但无 Ubuntu
- [ ] 自动运行 Ubuntu 安装脚本
- [ ] 正确提示是否需要重启
- [ ] 重启后能从断点继续

---

### 场景 3️⃣ : WSL2 未安装

**环境**：
```
wsl.exe 命令不存在
或 wsl --version 报错
```

**预期流程**：
```
安装器检测 → WSL needs_install
           → 运行 install-wsl.ps1
           → 启用 WSL 功能
           → 系统需要重启
           → 重启后 WSL2 可用
           → 点击"重试"继续
           → 自动检测 Ubuntu 安装情况
           → 继续安装流程
           → ✅ 安装完成
```

**验证点**：
- [ ] 检测到 WSL 未安装
- [ ] 自动运行 WSL 安装脚本
- [ ] 正确显示重启提示
- [ ] 重启后能继续安装

---

### 场景 4️⃣ : Windows 家庭版（不支持 WSL）

**环境**：
```
Windows 10/11 Home Edition
WSL 功能不可用
```

**预期流程**：
```
安装器检测 → WSL unsupported
           → 降级到 PowerShell 路径
           → 运行 install-node-windows.ps1
           → 运行 install-openclaw.ps1
           → 运行 install-nssm.ps1
           → 运行 register-service-nssm.ps1
           → 注册 Windows 服务
           → ✅ 安装完成
```

**验证点**：
- [ ] 检测到 WSL 不支持
- [ ] 自动切换到 PowerShell 路径
- [ ] Node.js 安装成功
- [ ] npm 全局安装成功
- [ ] Gateway 作为 Windows 服务运行
- [ ] 开机自启生效

---

### 场景 5️⃣ : 非管理员运行

**环境**：
```
未以管理员身份运行安装器
```

**预期流程**：
```
启动安装器 → 检测非管理员
           → Welcome 页面显示警告
           → "一键安装"按钮被禁用
           → 提示信息：请右键以管理员身份运行
```

**验证点**：
- [ ] Welcome 页面显示管理员权限警告
- [ ] 安装按钮被禁用（不可点击）
- [ ] 警告信息清晰易懂
- [ ] 右键以管理员身份运行后正常

---

### 场景 6️⃣ : 磁盘空间不足

**环境**：
```
C: 盘剩余空间 < 512 MB
```

**预期流程**：
```
启动安装器 → 检测磁盘空间
           → Welcome 页面显示磁盘警告
           → "一键安装"按钮被禁用
           → 提示信息：磁盘空间不足
```

**验证点**：
- [ ] 显示磁盘空间警告
- [ ] 安装按钮被禁用
- [ ] 清理磁盘后可正常安装

---

## 🧪 功能测试

### PowerShell 脚本执行

```powershell
# 1. 手动测试 install-node-windows.ps1
cd scripts/windows
.\install-node-windows.ps1

# 2. 检查 Node.js 安装
node -v
npm -v

# 3. 手动测试 install-openclaw.ps1
.\install-openclaw.ps1

# 4. 检查 OpenClaw 安装
openclaw --version
openclaw -h
```

### NSSM 服务管理

```powershell
# 1. 检查服务状态
nssm status openclaw-gateway

# 2. 启动服务
nssm start openclaw-gateway

# 3. 停止服务
nssm stop openclaw-gateway

# 4. 查看服务日志
Get-Content "~\.openclaw\logs\windows-service.log"

# 5. 移除服务
nssm remove openclaw-gateway confirm
```

### Gateway 验证

```bash
# 检查 Gateway 是否运行
curl http://localhost:18789/health

# 或在安装器中
# Welcome 页面 → Gateway 状态应显示"运行中"
```

---

## 📊 错误处理测试

### 测试网络错误提示

```powershell
# 1. 断开网络连接
# 2. 启动安装器
# 3. 尝试安装
# 4. 应该显示网络错误提示和解决方案
```

### 测试 WSL 错误

```powershell
# 1. 禁用 WSL 功能
# 2. 或删除 Ubuntu
# 3. 启动安装器
# 4. 检查错误提示是否清晰
```

### 测试权限错误

```powershell
# 1. 以普通用户运行
# 2. 应该显示权限不足提示
# 3. 右键以管理员运行后正常
```

---

## 📋 测试清单

### 基础功能
- [ ] MSI 文件能正常安装
- [ ] 安装后应用能启动
- [ ] Welcome 页面显示系统信息
- [ ] 系统信息检测正确

### WSL 路径
- [ ] 场景 1：WSL + Ubuntu 正常流程
- [ ] 场景 2：WSL + no Ubuntu 自动安装
- [ ] 场景 3：No WSL 自动安装
- [ ] install-ubuntu.ps1 脚本可用

### PowerShell 路径
- [ ] 场景 4：Windows 家庭版正常安装
- [ ] install-node-windows.ps1 成功
- [ ] install-openclaw.ps1 成功
- [ ] install-nssm.ps1 成功
- [ ] 服务注册成功

### 权限和空间
- [ ] 场景 5：非管理员检查正常
- [ ] 场景 6：磁盘空间检查正常
- [ ] 管理员身份后正常安装

### 错误处理
- [ ] 网络错误提示友好
- [ ] WSL 错误提示有解决方案
- [ ] 权限错误提示清晰
- [ ] 脚本执行失败有日志

### 卸载验证
- [ ] 通过控制面板可以卸载
- [ ] 卸载干净，无残留文件
- [ ] 服务正确移除
- [ ] 可重新安装

---

## 📸 截图和日志

### 收集信息用于反馈

```powershell
# 1. 导出系统信息
systeminfo > system-info.txt

# 2. 导出 WSL 状态
wsl -l -v > wsl-status.txt

# 3. 收集应用日志
Copy-Item "$HOME\.openclaw\logs\*" -Destination "./logs/" -Recurse

# 4. 收集安装日志
# 在安装器中右键复制日志
```

### 反馈到 GitHub Issues

包含以下信息：
- [ ] Windows 版本（10/11）
- [ ] 系统信息输出
- [ ] WSL 状态
- [ ] 复现步骤
- [ ] 截图或视频
- [ ] 应用日志
- [ ] 错误信息

---

## 🚀 快速测试流程

### 5 分钟快速验证

```powershell
# 1. 打开安装器
Start-Process "OpenClaw_安装器_x64_zh-CN.msi"

# 2. 完成安装向导
# 点击"下一步" → "安装" → "完成"

# 3. 启动应用
# 开始菜单 → OpenClaw 安装器

# 4. 检查 Welcome 页面
# 应显示系统信息和环境检测

# 5. 点击"一键安装"
# 观看安装进度，等待完成

# 6. 验证 Gateway
# Welcome 页面 → Gateway 应显示"运行中"
```

---

## 📞 问题反馈

遇到问题请：

1. **收集日志**
   ```powershell
   # 日志位置
   ~/.openclaw/logs/
   ```

2. **创建 GitHub Issue**
   - 标题：[Windows] 简述问题
   - 描述：详细步骤 + 日志
   - 标签：windows, bug, help-wanted

3. **提供系统信息**
   ```powershell
   $PSVersionTable
   [System.Environment]::OSVersion
   wsl --version
   ```

---

## ✅ 测试完成

所有测试通过后：

- [ ] 功能完整
- [ ] 错误处理正确
- [ ] 用户体验良好
- [ ] 文档完整
- [ ] 准备发布

**下一步**：
1. 创建 GitHub Release
2. 上传 MSI 文件
3. 发布版本公告
4. 监控用户反馈

---

**文档更新**: 2026-03-12
**状态**: 📦 准备测试
