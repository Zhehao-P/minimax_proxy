wu#!/bin/bash

# TTS API 代理转发器配置脚本
# 问答式交互配置

set -e

echo "🚀 TTS API 代理转发器配置向导"
echo "=================================="
echo ""

# 生成随机token的函数
generate_token() {
    openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | xxd -p -c 32 | tr -d '\n'
}

# 检查是否在正确的目录
if [ ! -f "wrangler.toml" ]; then
    echo "❌ 错误: 请在项目根目录运行此脚本"
    exit 1
fi

echo "我将引导您完成环境配置，请逐步回答以下问题："
echo ""

# 问题1: 用户数量
echo "📋 问题 1/3: 需要多少个用户令牌？"
read -p "请输入用户数量 (默认: 3): " user_count
user_count=${user_count:-3}

# 验证输入
while ! [[ "$user_count" =~ ^[1-9][0-9]*$ ]]; do
    echo "❌ 请输入有效的正整数"
    read -p "请输入用户数量: " user_count
done

echo "✅ 将生成 $user_count 个用户令牌"
echo ""

# 测试模式选项
echo "🧪 是否启用测试模式？"
echo "测试模式会额外添加 'default_proxy_token' 令牌，方便使用测试脚本"
read -p "启用测试模式？(y/N): " test_mode
test_mode=${test_mode:-N}
echo ""

# 问题2: Group ID
echo "📋 问题 2/3: 第三方服务的Group ID"
read -p "请输入Group ID: " group_id

# 验证输入
while [ -z "$group_id" ]; do
    echo "❌ Group ID不能为空"
    read -p "请输入Group ID: " group_id
done

echo "✅ Group ID设置为: $group_id"
echo ""

# 问题3: API密钥
echo "📋 问题 3/3: 第三方TTS服务的API密钥"
read -s -p "请输入API密钥 (输入时不会显示): " tts_key
echo ""

# 验证输入
while [ -z "$tts_key" ]; do
    echo "❌ API密钥不能为空"
    read -s -p "请输入API密钥: " tts_key
    echo ""
done

echo "✅ API密钥已设置"
echo ""

# 生成令牌
echo "🔑 正在生成访问令牌..."
tokens=()

# 如果启用测试模式，先添加测试令牌
if [[ "$test_mode" =~ ^[Yy]$ ]]; then
    tokens+=("default_proxy_token")
    echo "测试Token: default_proxy_token"
fi

# 生成用户令牌
for ((i=1; i<=user_count; i++)); do
    token=$(generate_token)
    tokens+=("$token")
    echo "Token $i: $token"
done
echo ""

# 构造JSON数组
proxy_tokens_json="["
for ((i=0; i<${#tokens[@]}; i++)); do
    if [ $i -gt 0 ]; then
        proxy_tokens_json+=","
    fi
    proxy_tokens_json+="\"${tokens[$i]}\""
done
proxy_tokens_json+="]"

# 显示配置摘要
echo "📋 配置摘要："
echo "==============="
echo "用户数量: $user_count"
echo "测试模式: $([[ "$test_mode" =~ ^[Yy]$ ]] && echo "已启用" || echo "未启用")"
echo "Group ID: $group_id"
echo "API密钥: ${tts_key:0:8}..."
echo ""
echo "生成的令牌："
for ((i=0; i<${#tokens[@]}; i++)); do
    echo "  Token $((i+1)): ${tokens[$i]}"
done
echo ""

# 最终确认
read -p "确认应用以上配置？(y/N): " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "❌ 配置已取消"
    exit 0
fi

echo ""
echo "🔧 正在应用配置..."

# 设置密钥变量
echo ""
echo "🔑 正在设置密钥变量..."

echo "设置 PROXY_TOKENS..."
echo "$proxy_tokens_json" | npx wrangler secret put PROXY_TOKENS

echo "设置 THIRD_PARTY_GROUP_ID..."
echo "$group_id" | npx wrangler secret put THIRD_PARTY_GROUP_ID

echo "设置 THIRD_PARTY_TTS_KEY..."
echo "$tts_key" | npx wrangler secret put THIRD_PARTY_TTS_KEY

echo ""
echo "🎉 配置完成！"
echo "============="
echo ""

# 询问是否立即部署
read -p "是否立即部署到 Cloudflare Workers？(Y/n): " deploy_now
deploy_now=${deploy_now:-Y}

if [[ "$deploy_now" =~ ^[Yy]$ ]]; then
    echo ""
    echo "🚀 正在部署到 Cloudflare Workers..."
    echo "=================================="

    if npm run deploy; then
        echo ""
        echo "✅ 部署成功！"
    else
        echo ""
        echo "❌ 部署失败，请检查错误信息"
        echo "您可以稍后手动运行: npm run deploy"
    fi
else
    echo ""
    echo "⏭️ 跳过部署，您可以稍后手动运行: npm run deploy"
fi

echo ""
echo "🎉 设置完成！"
echo "============="
echo ""
# 读取 wrangler.toml 中的配置
cors_origin_config=$(grep "CORS_ORIGIN" wrangler.toml | sed 's/.*= *"\([^"]*\)".*/\1/' || echo "未配置")
tts_url_config=$(grep "THIRD_PARTY_TTS_URL" wrangler.toml | sed 's/.*= *"\([^"]*\)".*/\1/' || echo "未配置")

echo "📋 配置摘要："
echo "• 用户数量: $user_count"
echo "• 测试模式: $([[ "$test_mode" =~ ^[Yy]$ ]] && echo "已启用" || echo "未启用")"
echo "• CORS来源: $cors_origin_config"
echo "• TTS服务: $tts_url_config"
echo "• Group ID: $group_id"
echo "• API密钥: ✓ 已设置"
echo ""
echo "🔑 生成的访问令牌："
echo "=================="
for ((i=0; i<${#tokens[@]}; i++)); do
    echo "用户 $((i+1)): ${tokens[$i]}"
done
echo ""
echo "📝 令牌使用说明："
echo "• 在API请求中添加头部: X-Proxy-Token: <令牌>"
echo "• 每个用户使用不同的令牌"
echo "• 请妥善保管这些令牌"
echo ""
echo "🧪 测试命令："
if [[ "$test_mode" =~ ^[Yy]$ ]]; then
    echo "./test.sh [worker_url] default_proxy_token"
else
    echo "./test.sh [worker_url] ${tokens[0]}"
fi
echo ""
echo "🔒 安全提醒："
echo "• 不要在代码中硬编码令牌"
echo "• 定期轮换令牌以提高安全性"
echo "• 不要在日志中记录令牌内容"
