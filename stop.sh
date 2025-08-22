#!/bin/bash

# TTS API 代理转发器停止服务脚本

set -e

echo "🛑 停止 TTS API 代理转发器服务"
echo "============================="
echo ""

# 检查是否在正确的目录
if [ ! -f "wrangler.toml" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

echo "🔄 正在停止服务..."

# 删除Worker部署
echo "删除Worker部署..."
if npx wrangler delete --force; then
    echo "✅ Worker已删除"
else
    echo "⚠️  Worker删除失败或不存在"
fi

echo ""
echo "✅ 服务已停止"
echo ""
echo "🔄 要恢复服务，请运行: npm run deploy"