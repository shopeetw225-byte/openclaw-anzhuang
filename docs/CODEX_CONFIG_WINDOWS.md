# 🔧 Windows 系统 GPT-5.2-Codex 中转站配置指南

> OpenClaw 集成 GPT-5.2-Codex API 配置

---

## 📋 配置选项

选择以下**任意一种**方式配置：

### **方案 A️⃣  - 环境变量配置（推荐，永久生效）**

适合：所有 Windows 用户，一次配置永久有效

#### 步骤 1: 打开环境变量编辑器

```powershell
# 按 Win + R，输入以下命令打开环境变量编辑器
sysdm.cpl
```

或直接在 PowerShell 运行：

```powershell
# 以管理员身份打开 PowerShell，运行此命令
Start-Process "sysdm.cpl"
```

#### 步骤 2: 添加环境变量

**图形界面操作**：

1. 弹出窗口 → "高级"标签页 → "环境变量"按钮
2. 点击"新建"（用户变量 或 系统变量）
3. 输入以下内容：

```
变量名：CODEX_API_URL
变量值：https://71newapi.71free.icu/v1

变量名：CODEX_MODEL
变量值：gpt-5.2-codex

变量名：CODEX_API_KEY
变量值：your-api-key-here
```

4. 点击"确定" → "确定" → "确定"

#### 步骤 3: 重启应用生效

```powershell
# 关闭所有 PowerShell 窗口，重新打开
# 环境变量才会生效

# 验证配置
echo $env:CODEX_API_URL
echo $env:CODEX_API_KEY
```

---

### **方案 B️⃣  - PowerShell 脚本配置（快速）**

适合：快速配置，无需图形界面

```powershell
# 以管理员身份运行 PowerShell，执行以下命令

# 设置环境变量（当前会话）
$env:CODEX_API_URL = "https://71newapi.71free.icu/v1"
$env:CODEX_MODEL = "gpt-5.2-codex"
$env:CODEX_API_KEY = "your-api-key-here"

# 永久设置（需要管理员权限）
[Environment]::SetEnvironmentVariable("CODEX_API_URL", "https://71newapi.71free.icu/v1", "User")
[Environment]::SetEnvironmentVariable("CODEX_MODEL", "gpt-5.2-codex", "User")
[Environment]::SetEnvironmentVariable("CODEX_API_KEY", "your-api-key-here", "User")

# 验证设置成功
Get-Item env:CODEX_*
```

---

### **方案 C️⃣  - .env 文件配置（项目级别）**

适合：单个项目使用，不影响全局

#### 步骤 1: 在项目根目录创建 .env 文件

```powershell
# 进入项目目录
cd C:\path\to\openclaw-anzhuang

# 创建 .env 文件
New-Item -Path ".env" -ItemType File -Force
```

#### 步骤 2: 编辑 .env 文件

使用记事本或代码编辑器打开 `.env`，添加：

```env
# GPT-5.2-Codex API 配置
CODEX_API_URL=https://71newapi.71free.icu/v1
CODEX_MODEL=gpt-5.2-codex
CODEX_API_KEY=your-api-key-here

# 可选配置
CODEX_TIMEOUT=30
CODEX_MAX_TOKENS=2048
CODEX_TEMPERATURE=0.7
CODEX_TOP_P=1.0
```

#### 步骤 3: 在应用中加载

**Node.js 项目**：

```javascript
// 在项目的 index.js 或 main.ts 顶部添加
require('dotenv').config();

// 然后使用
const apiUrl = process.env.CODEX_API_URL;
const apiKey = process.env.CODEX_API_KEY;
```

**Rust 项目**：

```rust
// 在 Cargo.toml 中添加依赖
[dependencies]
dotenv = "0.15"

// 在代码中使用
use dotenv::dotenv;
use std::env;

fn main() {
    dotenv().ok();
    let api_url = env::var("CODEX_API_URL").unwrap();
    let api_key = env::var("CODEX_API_KEY").unwrap();
}
```

---

### **方案 D️⃣  - 命令行参数配置（临时）**

适合：临时测试，不需要持久化

```powershell
# 直接传递参数启动应用
openclaw --codex-url "https://71newapi.71free.icu/v1" \
         --codex-key "your-api-key-here" \
         --codex-model "gpt-5.2-codex"

# 或使用 npm 启动开发服务器
npm run tauri dev -- \
  --codex-url "https://71newapi.71free.icu/v1" \
  --codex-key "your-api-key-here"
```

---

## 🧪 验证配置

### 验证环境变量已设置

```powershell
# PowerShell 验证
Get-ChildItem env:CODEX_*

# 应该显示：
# Name              Value
# ----              -----
# CODEX_API_URL     https://71newapi.71free.icu/v1
# CODEX_MODEL       gpt-5.2-codex
# CODEX_API_KEY     your-api-key-here
```

### 测试 API 连接

```powershell
# 使用 curl 测试连接（需要 Windows 10 1803+）
$headers = @{
    "Authorization" = "Bearer your-api-key-here"
    "Content-Type" = "application/json"
}

$body = @{
    "model" = "gpt-5.2-codex"
    "messages" = @(@{"role" = "user"; "content" = "Hello"})
    "temperature" = 0.7
} | ConvertTo-Json

curl -X POST `
  -H $headers `
  -Body $body `
  "https://71newapi.71free.icu/v1/chat/completions"

# 成功响应应该包含：
# "id": "chatcmpl-..."
# "choices": [...]
```

### 在应用中测试

```powershell
# 启动安装器
npm run tauri dev

# 或运行编译版本
.\OpenClaw_安装器_x64_zh-CN.exe

# 进入设置/配置界面
# 应该看到 Codex 配置选项
# 显示"连接成功"或"API Key 有效"
```

---

## 🔐 安全最佳实践

### ✅ 必做项

```powershell
# 1. 确保 .env 文件在 .gitignore 中
Add-Content -Path ".gitignore" -Value ".env"

# 2. 不要在代码中硬编码 API Key
# ❌ 错误：
const apiKey = "your-api-key-here"

# ✅ 正确：
const apiKey = process.env.CODEX_API_KEY

# 3. 使用强加密的密码
# 定期更换 API Key
```

### ⚠️ 安全警告

```
❌ 不要分享你的 API Key
❌ 不要上传 .env 文件到 GitHub
❌ 不要在公开场合输入 API Key
❌ 定期检查 API Key 使用情况
```

---

## 🐛 故障排查

### 问题 1: 环境变量未生效

```powershell
# 检查是否使用了正确的变量名
echo $env:CODEX_API_URL

# 如果为空，需要：
# 1. 重启 PowerShell
# 2. 重启应用
# 3. 或重启系统

# 查看所有环境变量
Get-ChildItem env: | Sort Name
```

### 问题 2: API 连接失败

```powershell
# 检查网络连接
Test-Connection "71newapi.71free.icu" -Count 1

# 检查 DNS 解析
Resolve-DnsName "71newapi.71free.icu"

# 检查 API 端点是否可访问
Invoke-WebRequest -Uri "https://71newapi.71free.icu/v1" -Method Get

# 查看详细错误
Invoke-WebRequest -Uri "https://71newapi.71free.icu/v1" -Method Get -Verbose
```

### 问题 3: API Key 无效

```powershell
# 检查 API Key 格式
$apiKey = $env:CODEX_API_KEY
Write-Host "API Key 长度：$($apiKey.Length) 字符"

# 如果长度过短，可能需要：
# 1. 检查是否正确复制
# 2. 检查是否包含空格
# 3. 重新获取 API Key
```

---

## 📝 配置文件位置汇总

| 配置方式 | 位置 | 生效范围 |
|---------|------|---------|
| 用户环境变量 | `%APPDATA%\...\Environment` | 当前用户所有应用 |
| 系统环境变量 | `HKEY_LOCAL_MACHINE\System\CurrentControlSet\Control\Session Manager\Environment` | 所有用户 |
| .env 文件 | 项目根目录 | 当前项目 |
| 命令行参数 | 启动命令 | 当前会话 |

---

## 🚀 快速配置命令（一键）

### 完全自动化配置脚本

将以下内容保存为 `setup-codex.ps1`：

```powershell
# setup-codex.ps1
param(
    [string]$ApiKey = "your-api-key-here"
)

# 以管理员身份运行
if (-NOT ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "需要管理员权限！" -ForegroundColor Red
    exit
}

# 设置环境变量
[Environment]::SetEnvironmentVariable("CODEX_API_URL", "https://71newapi.71free.icu/v1", "User")
[Environment]::SetEnvironmentVariable("CODEX_MODEL", "gpt-5.2-codex", "User")
[Environment]::SetEnvironmentVariable("CODEX_API_KEY", $ApiKey, "User")

Write-Host "✅ 环境变量已设置成功！" -ForegroundColor Green
Write-Host ""
Write-Host "CODEX_API_URL: https://71newapi.71free.icu/v1" -ForegroundColor Cyan
Write-Host "CODEX_MODEL: gpt-5.2-codex" -ForegroundColor Cyan
Write-Host "CODEX_API_KEY: $(if ($ApiKey.Length -gt 10) { $ApiKey.Substring(0, 10) + "..." } else { "***" })" -ForegroundColor Cyan
Write-Host ""
Write-Host "请重启 PowerShell 或应用使配置生效" -ForegroundColor Yellow
```

运行脚本：

```powershell
# 以管理员身份运行 PowerShell

# 允许脚本执行
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# 运行脚本
.\setup-codex.ps1 -ApiKey "your-api-key-here"
```

---

## 📚 应用集成示例

### Node.js/TypeScript 集成

```typescript
// src/services/codex.ts
import dotenv from 'dotenv';

dotenv.config();

const CODEX_CONFIG = {
  apiUrl: process.env.CODEX_API_URL || 'https://71newapi.71free.icu/v1',
  model: process.env.CODEX_MODEL || 'gpt-5.2-codex',
  apiKey: process.env.CODEX_API_KEY,
  timeout: parseInt(process.env.CODEX_TIMEOUT || '30'),
  maxTokens: parseInt(process.env.CODEX_MAX_TOKENS || '2048'),
};

export async function callCodexAPI(messages: Array<{role: string, content: string}>) {
  const response = await fetch(`${CODEX_CONFIG.apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CODEX_CONFIG.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CODEX_CONFIG.model,
      messages,
      temperature: 0.7,
      max_tokens: CODEX_CONFIG.maxTokens,
    }),
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}
```

### Rust 集成

```rust
// src/services/codex.rs
use reqwest::Client;
use serde_json::json;

pub struct CodexConfig {
    pub api_url: String,
    pub api_key: String,
    pub model: String,
}

impl CodexConfig {
    pub fn from_env() -> Self {
        Self {
            api_url: std::env::var("CODEX_API_URL")
                .unwrap_or_else(|_| "https://71newapi.71free.icu/v1".to_string()),
            api_key: std::env::var("CODEX_API_KEY")
                .expect("CODEX_API_KEY not set"),
            model: std::env::var("CODEX_MODEL")
                .unwrap_or_else(|_| "gpt-5.2-codex".to_string()),
        }
    }
}

pub async fn call_codex_api(config: &CodexConfig, message: &str) -> Result<String, Box<dyn std::error::Error>> {
    let client = Client::new();
    let response = client
        .post(&format!("{}/chat/completions", config.api_url))
        .bearer_auth(&config.api_key)
        .json(&json!({
            "model": config.model,
            "messages": [{
                "role": "user",
                "content": message
            }],
            "temperature": 0.7,
        }))
        .send()
        .await?;

    let data: serde_json::Value = response.json().await?;
    Ok(data["choices"][0]["message"]["content"].as_str().unwrap_or("").to_string())
}
```

---

## ✅ 完成检查清单

- [ ] API URL 已设置：`https://71newapi.71free.icu/v1`
- [ ] Model 已设置：`gpt-5.2-codex`
- [ ] API Key 已设置（替换为真实的 Key）
- [ ] 环境变量已生效（重启后验证）
- [ ] API 连接已测试成功
- [ ] 应用能正常使用 Codex API
- [ ] .env 文件在 .gitignore 中
- [ ] API Key 安全妥善保管

---

## 🆘 需要帮助？

| 问题 | 解决方案 |
|------|---------|
| 找不到环境变量编辑器 | 按 Win + R，输入 `sysdm.cpl` |
| 权限不足 | 以管理员身份运行 PowerShell |
| 连接失败 | 检查网络，测试 DNS 解析 |
| API Key 无效 | 检查 Key 格式，重新复制一遍 |
| 仍未解决 | 查看日志，提交 GitHub Issue |

---

**配置完成后，OpenClaw 将能够调用 GPT-5.2-Codex API！** 🎉
