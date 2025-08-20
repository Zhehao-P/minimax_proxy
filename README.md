# TTS API 代理转发器

基于 Cloudflare Workers 的 MiniMax TTS API 代理服务，隐藏第三方服务细节，提供统一的 TTS 接口。

## 功能特性

- 🔒 **安全代理**：完全隐藏第三方 API 域名和密钥
- 🚀 **流式传输**：直接流式返回音频数据，无需中转存储
- 🛡️ **访问控制**：轻量级 Token 认证 + CORS 保护
- ⚡ **高性能**：基于 Cloudflare Workers 边缘计算
- 📦 **零依赖**：单文件部署，无需复杂配置

## API 接口

### POST /api/tts

将文本转换为语音

**请求头：**
```
Content-Type: application/json
X-Proxy-Token: your_access_token
```

**请求体：**
```json
{
  "text": "需要合成的文本",
  "voice": "Boyan_new_platform",
  "format": "mp3",
  "sample_rate": 32000,
  "speed": 1,
  "pitch": 0,
  "vol": 1,
  "language": "auto"
}
```

**响应：**
- 成功：返回音频文件流（Content-Type: audio/*）
- 失败：返回错误信息（JSON格式）

## 部署步骤

### 1. 准备环境

```bash
# 克隆项目
git clone <repository_url>
cd api_forward

# 安装依赖
npm install
```

### 2. 配置环境变量

项目使用 Wrangler Secrets 来安全管理敏感信息。`wrangler.toml` 只包含非敏感配置：

```toml
name = "tts-api-proxy"
main = "src/worker.ts"
compatibility_date = "2024-01-01"

# 启用日志
[observability]
enabled = true

[vars]
CORS_ORIGIN = "https://your-frontend-domain.com"
THIRD_PARTY_TTS_URL = "https://api.minimax.chat/v1/t2a_v2"
```

**设置敏感变量为 Secrets：**

```bash
# 设置 MiniMax API 密钥
npx wrangler secret put THIRD_PARTY_TTS_KEY
# 提示时输入你的真实 MiniMax API Key

# 设置 MiniMax Group ID  
npx wrangler secret put THIRD_PARTY_GROUP_ID
# 提示时输入你的真实 Group ID

# 设置访问令牌（运行 test.sh 必须设为：default_proxy_token）
npx wrangler secret put PROXY_TOKEN
# 提示时输入：default_proxy_token （如果要使用测试脚本的话）
```

**常用 Secrets 管理命令：**

```bash
# 查看所有 secrets
npx wrangler secret list

# 修改 secret 值（重新设置同名 secret）
npx wrangler secret put PROXY_TOKEN

# 删除 secret
npx wrangler secret delete PROXY_TOKEN
```

### 3. 登录 Cloudflare

```bash
npx wrangler login
```

### 4. 部署到 Cloudflare Workers

```bash
npm run deploy
```

部署完成后会显示访问地址，例如：
```
https://tts-api-proxy.your-subdomain.workers.dev
```

### 5. 测试部署

```bash
./test.sh https://your-worker-url.workers.dev your_proxy_token
```

## 实现原理

### 架构设计

```
前端应用 → Cloudflare Workers → MiniMax TTS API
```

### 核心实现

1. **请求转换**：将前端 API 格式转换为 MiniMax API 格式
2. **认证代理**：使用环境变量中的密钥代理第三方 API 认证
3. **响应处理**：
   - 直接音频流：透传给前端
   - JSON含音频URL：服务端获取音频后流式返回
4. **安全防护**：Token 认证 + CORS 限制 + 错误信息过滤

### 请求映射

前端请求 → MiniMax API 请求：

```typescript
// 前端发送
{
  "text": "hello",
  "voice": "Boyan_new_platform",
  "format": "mp3"
}

// 转换为 MiniMax 格式
{
  "model": "speech-2.5-hd-preview",
  "text": "hello",
  "timber_weights": [{"voice_id": "Boyan_new_platform", "weight": 100}],
  "voice_setting": {...},
  "audio_setting": {...}
}
```

## 环境变量说明

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `PROXY_TOKEN` | 前端访问令牌 | `my_secret_token` |
| `CORS_ORIGIN` | 允许的前端域名 | `https://app.example.com` |
| `THIRD_PARTY_TTS_URL` | MiniMax TTS API 地址 | `https://api.minimax.chat/v1/t2a_v2` |
| `THIRD_PARTY_GROUP_ID` | MiniMax GroupId | `your_group_id` |
| `THIRD_PARTY_TTS_KEY` | MiniMax API 密钥 | `eyJhbGciOi...` |

## 使用示例

```javascript
// 前端调用示例
const response = await fetch('https://your-worker.workers.dev/api/tts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Proxy-Token': 'your_access_token'
  },
  body: JSON.stringify({
    text: '你好，这是一个测试',
    voice: 'Boyan_new_platform',
    format: 'mp3'
  })
});

// 获取音频数据
const audioBlob = await response.blob();
const audioUrl = URL.createObjectURL(audioBlob);

// 播放音频
const audio = new Audio(audioUrl);
audio.play();
```

## 项目结构

```
├── src/
│   └── worker.ts          # 核心业务逻辑
├── wrangler.toml          # Cloudflare Workers 配置
├── package.json           # 项目依赖
├── test.sh               # 测试脚本
└── README.md             # 项目文档
```

## 开发命令

```bash
# 本地开发
npm run dev

# 部署到生产环境
npm run deploy

# 运行测试
./test.sh [worker_url] [proxy_token]
```
