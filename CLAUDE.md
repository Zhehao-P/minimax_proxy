# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Third-Party API Proxy Forwarder** (第三方服务API代理转发) built on Cloudflare Workers. The **primary mission** is to implement a forwarding service that **absolutely never exposes third-party domain names**. Users/frontend only call our `/api` endpoints, our server forwards to third-party services, and **streams audio bytes directly back** to the frontend.

**Current Status**: ✅ **Production Ready** - Deployed and tested with comprehensive security validation

**Core Constraints from Specification:**
- **Internal testing only**: No caching, no complex retry logic, simple API call statistics
- **Direct forwarding only**: Receive `POST /api` → assemble third-party request → **stream audio back directly**
- **Zero third-party exposure**: Response must NEVER contain third-party domains or upstream URLs
- **No persistence**: No file storage, no object storage, zero persistence by default
- **Minimal dependencies**: Single-file implementation on Cloudflare Workers
- **Complete logging**: Log ALL requests (time/status/duration), never log request body content
- **Security**: Third-party keys only exist as environment variables, lightweight access token (`X-Proxy-Token`)

## Architecture

**Primary Use Case**: TTS Service Forwarding (MiniMax API implementation)
- **Single Worker Architecture**: All functionality is contained in `src/worker.ts` (~275 lines)
- **Core Endpoint**: `POST /api/tts` - Dedicated MiniMax TTS service with specific parameter mapping
- **Request Mapping**: Transforms our API contract to third-party API format (MiniMax TTS)
- **Smart Audio Handling**:
  - If upstream returns **audio stream**: Direct streaming back
  - If upstream returns **JSON with audio URL**: Server fetches URL content and streams audio back
- **Simplified Architecture**: Removed dynamic service support, focused on single MiniMax TTS implementation

## Common Development Commands

```bash
# Install dependencies
npm install

# Local development (with hot reload)
npm run dev

# Deploy to Cloudflare Workers
npm run deploy

# Deploy to production environment
npm run deploy:prod

# Type checking
npx tsc --noEmit

# View live logs
npx wrangler tail

# Test the API
./test.sh [worker_url] [proxy_token]
```

## Key Configuration

Configuration is split between `wrangler.toml` (public vars) and **Wrangler Secrets** (sensitive data). **Required environment variables** per specification:

**Public Variables** (`wrangler.toml`):
- **`CORS_ORIGIN`**: Allowed frontend domain (e.g., `https://your-frontend-domain.com`)
- **`THIRD_PARTY_TTS_URL`**: Third-party TTS base URL (`https://api.minimax.chat/v1/t2a_v2`)
- **`TTS_PARAMETER_MAPPING`**: JSON template for parameter mapping (see Parameter Mapping section)

**Secret Variables** (Wrangler Secrets - use `npx wrangler secret put <NAME>`):
- **`THIRD_PARTY_GROUP_ID`**: Third-party GroupId (injected as query parameter)
- **`THIRD_PARTY_TTS_KEY`**: Third-party API key (used as `Authorization: Bearer <key>`)
- **`PROXY_TOKENS`**: JSON array of valid access tokens (e.g., `["token1","token2","token3"]`) - frontend sends one as `X-Proxy-Token` header

**Current Deployment**: `https://tts-api-proxy.zpengpzh.workers.dev`

## API Contract (Primary TTS Service)

**`POST /api/tts`** - Our API contract:
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

**Request Mapping to Third-Party (MiniMax TTS)**:
```typescript
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
```

**Response**: `Content-Type: audio/*` - Direct audio stream for browser/`<audio>` playback

## Parameter Mapping Configuration

The TTS service uses a configurable JSON template system for parameter mapping. This allows easy modification of how our API parameters map to third-party service parameters.

### Template Format

The `TTS_PARAMETER_MAPPING` environment variable contains a JSON template with placeholder variables:

- **`{{parameter_name}}`**: Direct parameter substitution
- **`{{parameter_name:default_value}}`**: Parameter with default value if not provided

### Example Configuration

```json
{
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
}
```

### Updating Parameter Mapping

1. Edit `TTS_PARAMETER_MAPPING` in `wrangler.toml`
2. Use `{{parameter_name}}` for required parameters
3. Use `{{parameter_name:default}}` for optional parameters with defaults
4. Deploy changes with `npm run deploy`

### Available Input Parameters

Based on the `TTSRequest` interface:
- `text` (required): Text to synthesize
- `voice`: Voice model ID
- `format`: Audio format (mp3, wav, etc.)
- `sample_rate`: Audio sample rate
- `speed`: Speech speed multiplier
- `pitch`: Pitch adjustment
- `vol`: Volume level
- `language`: Language detection/boost setting

## API Design Patterns

- **Single Route**: `POST /api/tts` (dedicated MiniMax TTS implementation)
- **Authentication**: All requests require `X-Proxy-Token` header (401 if missing/wrong)
- **CORS**: Strict single-origin checking from `CORS_ORIGIN` environment variable (401 if missing/wrong Origin)
- **Request Processing Order** (validated by tests):
  1. CORS validation → 401 for missing/invalid Origin
  2. Token authentication → 401 for missing/invalid token
  3. HTTP method validation → 405 for non-POST methods
  4. Route validation → 404 for unknown paths
  5. Business logic execution
- **Error Handling**: 502 for third-party errors, 500 for internal errors, never expose third-party details

## Code Architecture Details

### Core Functions
- `handleTTSService()` - Dedicated MiniMax TTS proxy logic with parameter mapping
- `handleCORS()` - CORS preflight and strict origin validation (returns 401 for failures)
- `checkAuth()` - Proxy token validation (returns 401 for failures)
- `logRequest()` - Structured logging for ALL requests (including errors)

### Response Handling Strategy (per specification)
1. **Direct Audio Streams**: Stream bytes directly back with proper Content-Type headers
2. **JSON with Audio URLs**: Server fetches from `audio_url`/`file_url`/`download_url` and streams audio back
3. **Standard JSON**: Returns as-is with CORS headers (for non-audio services)
4. **Other Types**: Direct passthrough with appropriate headers

### Critical Implementation Details
- **GroupId Injection**: `THIRD_PARTY_GROUP_ID` is injected as query parameter for TTS requests
- **Authorization Header**: `Authorization: Bearer ${THIRD_PARTY_TTS_KEY}` for third-party requests
- **Zero Domain Exposure**: Responses never contain third-party URLs or domain information
- **Complete Logging**: Logs timestamp, method, URL, status, duration for ALL requests - never request body content
- **Consistent Error Codes**: CORS and authentication failures both return 401 for security consistency

### Environment Interface
The `Env` interface defines all required environment variables for the dedicated MiniMax TTS implementation.

## Testing

The comprehensive test script `test.sh` covers **7 test scenarios** following request processing order:
- **CORS validation** (2 tests): missing Origin header, invalid Origin header → 401
- **Authentication** (2 tests): missing token, invalid token → 401
- **HTTP method validation** (1 test): GET method on POST endpoint → 405
- **Route validation** (1 test): unknown path → 404
- **Functional testing** (1 test): complete TTS request with audio output validation


## Security Considerations (Critical Requirements)

**Per specification - these are mandatory:**
- **Never expose third-party domains**: Responses must NEVER contain third-party service URLs or domain names
- **Environment-only secrets**: Third-party keys exist ONLY as environment variables, never in code or responses
- **Lightweight access control**: `X-Proxy-Token` header required for all API access (401 if missing/wrong)
- **Single-origin CORS**: Strictly enforce `CORS_ORIGIN` environment variable, never allow `*`
- **Generic error messages**: All errors return generic messages to prevent information leakage about upstream services
- **No content logging**: Never log request body content (text/prompts), only metadata (time/status/duration)

**Mission-critical constraint**: This service must be a "black box" that completely hides the existence and details of third-party services from clients.
