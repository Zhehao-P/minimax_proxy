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

## 快速开始

### 1. 准备环境

```bash
# 克隆项目
git clone <repository_url>
cd minimax_proxy

# 安装依赖
npm install
```

### 2. 登录 Cloudflare 账号

```bash
npx wrangler login
```

按提示在浏览器中登录您的 Cloudflare 账号。

### 3. 一键启动服务

运行交互式配置脚本，它会引导您完成所有配置并自动部署：

```bash
./setup.sh
```

脚本会依次询问：
- 需要多少个用户令牌？
- 前端域名（CORS设置）
- TTS服务URL（默认MiniMax）
- Group ID
- API密钥

配置完成后会自动：
- 生成指定数量的访问令牌
- 设置所有环境变量
- 部署到 Cloudflare Workers
- 显示服务地址和令牌列表

### 4. 停止服务

需要停止服务时，运行：

```bash
./stop.sh
```

### 5. 测试服务

使用生成的令牌测试服务：

```bash
./test.sh <worker_url> <proxy_token>
```

示例：
```bash
./test.sh https://your-worker-url.workers.dev your_generated_token
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

## 参数映射配置

TTS 服务使用可配置的 JSON 模板系统进行参数映射。这样可以轻松修改我们的 API 参数如何映射到第三方服务参数。

### 模板格式

`TTS_PARAMETER_MAPPING` 环境变量包含带有占位符变量的 JSON 模板：

- **`{{参数名}}`**：直接参数替换
- **`{{参数名:默认值}}`**：带默认值的参数（如果未提供则使用默认值）

### 配置示例

在 `wrangler.toml` 中的 `TTS_PARAMETER_MAPPING` 配置：

```json
{
  "template": {
    "model": "speech-2.5-hd-preview",
    "text": "{{text}}",
    "timber_weights": [
      {
        "voice_id": "{{voice:Boyan_new_platform}}",
        "weight": 100
      }
    ],
    "voice_setting": {
      "voice_id": "{{voice:Boyan_new_platform}}",
      "speed": "{{speed:1}}",
      "pitch": "{{pitch:0}}",
      "vol": "{{vol:1}}",
      "latex_read": false
    },
    "audio_setting": {
      "sample_rate": "{{sample_rate:32000}}",
      "bitrate": 128000,
      "format": "{{format:mp3}}"
    },
    "language_boost": "{{language:auto}}"
  },
  "number_fields": ["voice_setting.speed", "voice_setting.pitch", "voice_setting.vol", "audio_setting.sample_rate"]
}
```

### 可用的输入参数

基于 `TTSRequest` 接口定义：

| 参数 | 类型 | 必需 | 说明 | 示例 |
|------|------|------|------|------|
| `text` | string | ✅ | 需要合成的文本 | "你好世界" |
| `voice` | string | ❌ | 语音模型ID | "Boyan_new_platform" |
| `format` | string | ❌ | 音频格式 | "mp3", "wav" |
| `sample_rate` | number | ❌ | 采样率 | 32000, 24000 |
| `speed` | number | ❌ | 语音速度倍数 | 1, 1.2, 0.8 |
| `pitch` | number | ❌ | 音调调整 | 0, 0.1, -0.1 |
| `vol` | number | ❌ | 音量级别 | 1, 0.8, 1.2 |
| `language` | string | ❌ | 语言检测/增强 | "auto", "zh", "en" |

### 更新参数映射

1. 编辑 `wrangler.toml` 中的 `TTS_PARAMETER_MAPPING`
2. 在 `template` 部分配置参数映射：
   - 对必需参数使用 `{{参数名}}`
   - 对可选参数使用 `{{参数名:默认值}}`
3. 在 `number_fields` 数组中指定需要转换为数字类型的字段路径
4. 使用 `npm run deploy` 部署更改

### 数字类型转换

使用点号路径来指定需要转换为数字的字段：
- `"voice_setting.speed"` - voice_setting对象中的speed字段
- `"audio_setting.sample_rate"` - audio_setting对象中的sample_rate字段

### 映射示例

**前端请求**:
```json
{
  "text": "你好世界",
  "voice": "Boyan_new_platform", 
  "speed": 1.2,
  "format": "wav"
}
```

**经过模板处理后的第三方API请求**:
```json
{
  "model": "speech-2.5-hd-preview",
  "text": "你好世界",
  "timber_weights": [
    {
      "voice_id": "Boyan_new_platform",
      "weight": 100
    }
  ],
  "voice_setting": {
    "voice_id": "Boyan_new_platform",
    "speed": 1.2,
    "pitch": 0,
    "vol": 1,
    "latex_read": false
  },
  "audio_setting": {
    "sample_rate": 32000,
    "bitrate": 128000,
    "format": "wav"
  },
  "language_boost": "auto"
}
```

## 配置文件说明

`setup.sh` 脚本会自动更新 `wrangler.toml` 中的公共变量：

```toml
[vars]
CORS_ORIGIN = "https://your-frontend-domain.com"
THIRD_PARTY_TTS_URL = "https://api.minimax.chat/v1/t2a_v2"
TTS_PARAMETER_MAPPING = """JSON模板配置"""
```

这些变量可以在部署后直接查看，其他敏感信息（如API密钥和访问令牌）使用 Wrangler Secrets 安全存储。

## 使用示例

### JavaScript/前端调用

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

### curl 命令行调用

```bash
# 基础TTS调用，保存为音频文件
curl -X POST https://your-worker.workers.dev/api/tts \
  -H "Content-Type: application/json" \
  -H "Origin: https://your-frontend-domain.com" \
  -H "X-Proxy-Token: your_access_token" \
  -d '{
    "text": "你好，这是一个测试",
    "voice": "Boyan_new_platform",
    "format": "mp3",
    "sample_rate": 32000,
    "speed": 1,
    "pitch": 0,
    "vol": 1,
    "language": "auto"
  }' \
  --output audio.mp3

# 使用测试脚本（如果启用了测试模式）
./test.sh https://your-worker.workers.dev default_proxy_token
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

