# 第三方服务API 代理转发实现（以TTS 服务转发器为例）

> 目标：实现一个第三方API代理转发，且绝不暴露第三方域名的服务。用户/前端只调用我们的 `/api`，由我们服务端去调用第三方接口，以TTS的实现为例，并将**音频字节流**直接回传给前端。  
> 范围：内部测试用；**无缓存、无复杂重试、有简单接口调用统计**。

---

## 使命 & 边界

- **仅做转发与回传**：接收 `POST /api` → 我们组装第三方请求 → 请求第三方 → **直接把音频流回传**（或第三方返回 JSON+URL 时，由我们服务端拉取该 URL 的内容并回传音频流）。
- **不暴露第三方**：响应中**不得出现第三方域名**或上游直链。
- **无缓存**：不落地文件、不写对象存储；默认零持久化。
- **最少依赖**：优先 **Vercel Functions（Node 平台）** 或 **Cloudflare Workers（Node 兼容）** 二选一；单文件实现。
- **日志最小化**：仅记录时间/状态码/耗时；不记录正文（text/prompt）。
- **安全**：第三方密钥仅在服务端以**环境变量**存在；对我们的端点增加一个轻量访问令牌（`X-Proxy-Token`）。
- **CORS**：仅允许我们的前端域名；不开放 `*`。
- 收到请求后，将请求体映射成第三方 API（MiniMax TTS）的格式，并发起调用。
- 如果上游直接返回音频流，则直接将字节流回传给客户端。
---

## 平台
- **二选一**：Cloudflare Workers 或 Vercel Functions（Node 环境）。
- 部署后必须有一个可直接访问的 HTTPS 地址作为 API base。

## 任务要求（你需要完成）

1. **实现接口，以minimax的TTS 语音合成服务为例**
   - `POST /api/tts`  
     - 请求体（我们这层的契约）：
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
     - 行为：
       - 将上述参数映射为第三方 API 需要的结构（已给出样例字段）
       - 在查询参数中注入 `GroupId`
       - 在请求头中注入 `Authorization: Bearer <api_key>`
       - 向第三方发起请求
       - 若第三方返回 **音频流**：**直接流式回传**（`Content-Type` 保持一致）
       - 若第三方返回 **JSON 且包含音频 URL**：由我们服务端**请求该 URL**，拿到音频字节后**流式回传**  
     - 响应：`Content-Type: audio/*`，支持浏览器或 `<audio>` 直接播放  
     - 错误：保持合理状态码（`401/405/502` 等），不泄露敏感数据

2. **支持基础鉴权与 CORS**
   - 请求头包含 `X-Proxy-Token`，需与环境变量一致方可访问（未提供时返回 401）
   - CORS 允许的域名来自环境变量 `CORS_ORIGIN`

3. **README 文档**
   - 部署步骤（Vercel 或 Workers，任选其一并写清）
   - 环境变量说明
   - `curl` 与前端 `fetch` 示例
   - 已知限制与注意事项
   - 用户调用我方API接口用例

---

## 环境变量（必须）

- `THIRD_PARTY_TTS_URL`：第三方 TTS 基础地址（如：`https://api.minimax.chat/v1/t2a_v2`）
- `THIRD_PARTY_GROUP_ID`：第三方 `GroupId`
- `THIRD_PARTY_TTS_KEY`：第三方 `api_key`（Bearer）
- `PROXY_TOKEN`：我们自用的轻量访问令牌（前端以 `X-Proxy-Token` 携带）
- `CORS_ORIGIN`：允许的前端域名（如 `https://movie.example.com`），多个域名可先不做，单值即可

---

## 请求映射（参考）

将我们的入参映射为第三方示例结构（Node/TS 伪代码）：
```ts
const requestBody = {
  model: 'speech-2.5-hd-preview',
  text: body.text,
  timber_weights: [{ voice_id: body.voice, weight: 100 }],
  voice_setting: {
    voice_id: body.voice,
    speed: body.speed ?? 1,
    pitch: body.pitch ?? 0,
    vol: body.vol ?? 1,
    latex_read: false
  },
  audio_setting: {
    sample_rate: body.sample_rate ?? 32000,
    bitrate: 128000,
    format: body.format ?? 'mp3'
  },
  language_boost: body.language ?? 'auto'
};
