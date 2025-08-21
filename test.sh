#!/bin/bash

# TTS API 代理转发器测试脚本
# 使用方法: ./test.sh [worker_url]

DEFAULT_WORKER_URL="https://tts-api-proxy.your-subdomain.workers.dev"
WORKER_URL=${1:-$DEFAULT_WORKER_URL}

PROXY_TOKEN="default_proxy_token"
CORS_ORIGIN="https://your-frontend-domain.com"

echo "🚀 TTS API 代理转发器测试脚本"
echo "=================================="
echo "Worker URL: $WORKER_URL"
echo "Proxy Token: $PROXY_TOKEN"
echo ""

# 测试计数器
PASSED_TESTS=0
TOTAL_TESTS=0

# 测试 1: 缺少Origin头 (CORS验证)
echo "📋 测试 1: 缺少Origin头 (CORS验证)"
echo "POST $WORKER_URL/api/tts (无Origin头)"
response=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Proxy-Token: $PROXY_TOKEN" \
  -d '{"text": "test"}' \
  "$WORKER_URL/api/tts")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)
echo "$body"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
if [ "$http_code" = "401" ]; then
    echo "✅ 测试通过: 正确拒绝无Origin请求"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "❌ 测试失败: 期望401，实际$http_code"
fi
echo ""

# 测试 2: 错误的Origin头 (CORS验证)
echo "📋 测试 2: 错误的Origin头 (CORS验证)"
echo "POST $WORKER_URL/api/tts (错误Origin)"
response=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Origin: https://malicious-site.com" \
  -H "Content-Type: application/json" \
  -H "X-Proxy-Token: $PROXY_TOKEN" \
  -d '{"text": "test"}' \
  "$WORKER_URL/api/tts")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)
echo "$body"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
if [ "$http_code" = "401" ]; then
    echo "✅ 测试通过: 正确拒绝错误Origin"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "❌ 测试失败: 期望401，实际$http_code"
fi
echo ""

# 测试 3: 缺少认证令牌 (身份验证)
echo "📋 测试 3: 缺少认证令牌 (身份验证)"
echo "POST $WORKER_URL/api/tts (无 X-Proxy-Token)"
response=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Origin: $CORS_ORIGIN" \
  -H "Content-Type: application/json" \
  -d '{"text": "test"}' \
  "$WORKER_URL/api/tts")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)
echo "$body"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
if [ "$http_code" = "401" ]; then
    echo "✅ 测试通过: 正确拒绝无认证请求"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "❌ 测试失败: 期望401，实际$http_code"
fi
echo ""

# 测试 4: 错误的认证令牌 (身份验证)
echo "📋 测试 4: 错误的认证令牌 (身份验证)"
echo "POST $WORKER_URL/api/tts (错误的 X-Proxy-Token)"
response=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Origin: $CORS_ORIGIN" \
  -H "Content-Type: application/json" \
  -H "X-Proxy-Token: wrong_token" \
  -d '{"text": "test"}' \
  "$WORKER_URL/api/tts")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)
echo "$body"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
if [ "$http_code" = "401" ]; then
    echo "✅ 测试通过: 正确拒绝错误token"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "❌ 测试失败: 期望401，实际$http_code"
fi
echo ""

# 测试 5: 错误的HTTP方法 (方法验证)
echo "📋 测试 5: 错误的HTTP方法 (方法验证)"
echo "GET $WORKER_URL/api/tts (GET方法)"
response=$(curl -s -w "\n%{http_code}" \
  -X GET \
  -H "Origin: $CORS_ORIGIN" \
  -H "X-Proxy-Token: $PROXY_TOKEN" \
  "$WORKER_URL/api/tts")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)
echo "$body"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
if [ "$http_code" = "405" ]; then
    echo "✅ 测试通过: 正确拒绝GET方法"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "❌ 测试失败: 期望405，实际$http_code"
fi
echo ""

# 测试 6: 未知路径 (路由验证)
echo "📋 测试 6: 未知路径 (路由验证)"
echo "GET $WORKER_URL/"
response=$(curl -s -w "\n%{http_code}" \
  -H "Origin: $CORS_ORIGIN" \
  -H "X-Proxy-Token: $PROXY_TOKEN" \
  "$WORKER_URL/")
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | head -n -1)
echo "$body"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
if [ "$http_code" = "404" ]; then
    echo "✅ 测试通过: 正确返回404"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "❌ 测试失败: 期望404，实际$http_code"
fi
echo ""

# 测试 7: 完整的 TTS 请求 (功能测试)
echo "📋 测试 7: 完整的 TTS 请求 (功能测试)"
echo "POST $WORKER_URL/api/tts (完整参数)"
curl -s -w "\n状态码: %{http_code}\n耗时: %{time_total}s\n" \
  -X POST \
  -H "Origin: $CORS_ORIGIN" \
  -H "Content-Type: application/json" \
  -H "X-Proxy-Token: $PROXY_TOKEN" \
  -d '{
    "text": "test text input",
    "voice": "Boyan_new_platform",
    "format": "mp3",
    "sample_rate": 32000,
    "speed": 1,
    "pitch": 0,
    "vol": 1,
    "language": "auto"
  }' \
  --output test_output.mp3 \
  "$WORKER_URL/api/tts"

# 检查输出文件
if [ -f "test_output.mp3" ]; then
    file_size=$(stat -c%s "test_output.mp3" 2>/dev/null || stat -f%z "test_output.mp3" 2>/dev/null || echo "unknown")
    file_type=$(file test_output.mp3 2>/dev/null || echo "unknown")

    # 检查是否是音频文件
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    if [[ "$file_type" == *"Audio"* ]] || [[ "$file_type" == *"audio"* ]] || [[ "$file_type" == *"MPEG"* ]]; then
        echo "✅ 音频文件已保存: test_output.mp3 (大小: $file_size bytes)"
        echo "📁 文件类型: $file_type"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo "❌ 返回的不是音频文件 (大小: $file_size bytes)"
        echo "📁 文件类型: $file_type"
        echo "📄 响应内容:"
        cat test_output.mp3
    fi
else
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo "❌ 未生成音频文件"
fi

echo ""

echo "🎉 测试完成！"
echo "=================================="

# 统计测试结果
FAILED_TESTS=$((TOTAL_TESTS - PASSED_TESTS))
echo "📊 测试总结:"
echo "总测试数: $TOTAL_TESTS"
echo "✅ 通过: $PASSED_TESTS"
echo "❌ 失败: $FAILED_TESTS"

if [ $FAILED_TESTS -eq 0 ]; then
    echo "🎉 所有测试通过！"
else
    echo "⚠️  有 $FAILED_TESTS 个测试失败，请检查配置"
fi

echo ""
echo "生成的文件:"
ls -la test_*.mp3 2>/dev/null || echo "未生成任何文件"
