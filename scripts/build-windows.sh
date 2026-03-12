#!/bin/bash
# Windows 本地构建脚本

set -e

echo "🔨 OpenClaw 安装器 - Windows 构建脚本"
echo ""

# 检查环境
if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装，请先安装 Node.js"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo "❌ cargo 未安装，请先安装 Rust"
    exit 1
fi

# 获取版本号
VERSION=$(cat src-tauri/tauri.conf.json | grep -m 1 '"version"' | awk -F'"' '{print $4}')
echo "📦 版本: $VERSION"

# 清理旧的构建文件
echo ""
echo "🧹 清理旧的构建文件..."
rm -rf dist src-tauri/target/release/bundle

# 安装依赖
echo ""
echo "📥 安装 npm 依赖..."
npm ci --prefer-offline

# 构建前端
echo ""
echo "🏗️  构建 React 前端..."
npm run build

# 构建 Tauri 应用
echo ""
echo "⚙️  构建 Tauri 应用..."
npm run tauri build

# 显示产物信息
echo ""
echo "✅ 构建完成！"
echo ""
echo "📂 产物位置:"
echo "   - MSI 安装包: src-tauri/target/release/bundle/msi/"
echo "   - NSIS EXE:   src-tauri/target/release/bundle/nsis/"
echo ""

# 显示文件大小
BUNDLE_DIR="src-tauri/target/release/bundle"

echo "📊 文件大小:"
find "$BUNDLE_DIR" -type f \( -name "*.msi" -o -name "*.exe" \) | while read -r file; do
    size=$(du -h "$file" | cut -f1)
    name=$(basename "$file")
    echo "   - $name: $size"
done

echo ""
echo "💡 下一步:"
echo "   1. 测试安装包: 双击 MSI 文件进行安装"
echo "   2. 验证 Windows 路径（WSL/PowerShell/NSSM）"
echo "   3. 检查管理员权限检查是否正常"
echo "   4. 签名 MSI 文件（如需要，参考 WINDOWS_BUILD.md）"
echo "   5. 上传到 GitHub Release（使用版本标签）"
echo ""
echo "ℹ️  更多信息参考: docs/WINDOWS_BUILD.md"
