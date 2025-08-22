interface Env {
  THIRD_PARTY_TTS_URL: string;
  THIRD_PARTY_GROUP_ID: string;
  THIRD_PARTY_TTS_KEY: string;
  PROXY_TOKENS: string;
  CORS_ORIGIN: string;
}

function logRequest(method: string, url: string, status: number, duration: number, error?: string): void {
  const timestamp = new Date().toISOString();
  const logData = {
    timestamp,
    method,
    url,
    status,
    duration: `${duration}ms`,
    ...(error && { error })
  };
  console.log(JSON.stringify(logData));
}

function handleCORS(request: Request, env: Env): Response | null {
  const origin = request.headers.get('Origin');

  // 严格模式：必须有Origin头且必须匹配CORS_ORIGIN
  if (!origin) {
    return new Response('Unauthorized: Origin header required', { status: 401 });
  }

  if (origin !== env.CORS_ORIGIN) {
    return new Response('Unauthorized: Invalid origin', { status: 401 });
  }

  // 处理预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: createSafeHeaders(env, {
        'Content-Type': 'text/plain',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Token',
        'Access-Control-Max-Age': '86400',
      }),
    });
  }

  return null;
}

function createUnsafeHeaders(additionalHeaders: Record<string, string> = {}): Record<string, string> {
  return { ...additionalHeaders };
}

function createSafeHeaders(env: Env, additionalHeaders: Record<string, string> = {}): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.CORS_ORIGIN,
    ...additionalHeaders
  };
}

function checkAuth(request: Request, env: Env): Response | null {
  const token = request.headers.get('X-Proxy-Token');

  if (!token) {
    return new Response('Unauthorized', {
      status: 401,
      headers: createUnsafeHeaders({ 'Content-Type': 'text/plain' })
    });
  }

  try {
    const validTokens: string[] = JSON.parse(env.PROXY_TOKENS);
    if (!Array.isArray(validTokens) || !validTokens.includes(token)) {
      return new Response('Unauthorized', {
        status: 401,
        headers: createUnsafeHeaders({ 'Content-Type': 'text/plain' })
      });
    }
  } catch (error) {
    // JSON解析失败，记录错误但不暴露给客户端
    console.error('Failed to parse PROXY_TOKENS:', error);
    return new Response('Unauthorized', {
      status: 401,
      headers: createUnsafeHeaders({ 'Content-Type': 'text/plain' })
    });
  }

  return null;
}

async function handleTTSService(request: Request, env: Env): Promise<Response> {
  const startTime = Date.now();

  try {
    if (request.method !== 'POST') {
      const duration = Date.now() - startTime;
      logRequest(request.method, '/api/tts', 405, duration);
      return new Response('Method not allowed', {
        status: 405,
        headers: createSafeHeaders(env, { 'Content-Type': 'text/plain' })
      });
    }

    const body = await request.json();

    const requestBody = {
      model: 'speech-2.5-hd-preview',
      text: body.text,
      timber_weights: [{ voice_id: body.voice || 'Boyan_new_platform', weight: 100 }],
      voice_setting: {
        voice_id: body.voice || 'Boyan_new_platform',
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

    const url = new URL(env.THIRD_PARTY_TTS_URL);
    url.searchParams.set('GroupId', env.THIRD_PARTY_GROUP_ID);

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.THIRD_PARTY_TTS_KEY}`,
        'Content-Type': 'application/json',
        'User-Agent': 'TTS-Proxy-Service/1.0',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logRequest(request.method, '/api/tts', response.status, Date.now() - startTime, errorText);
      return new Response('TTS service error', {
        status: 502,
        headers: createSafeHeaders(env, { 'Content-Type': 'text/plain' })
      });
    }

    const contentType = response.headers.get('Content-Type');

    if (contentType && contentType.startsWith('audio/')) {
      // 修复：直接流式转发，不等待完整下载
      const duration = Date.now() - startTime;
      logRequest(request.method, '/api/tts', 200, duration);

      return new Response(response.body, {
        status: 200,
        headers: createSafeHeaders(env, {
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        })
      });
    } else if (contentType && contentType.includes('application/json')) {
      try {
        // 先克隆响应以避免流被消费
        const responseClone = response.clone();
        const jsonResponse = await responseClone.json();

        // 检查MiniMax业务层错误
        if (jsonResponse.base_resp && jsonResponse.base_resp.status_code !== 0) {
          const duration = Date.now() - startTime;
          logRequest(request.method, '/api/tts', 502, duration, 'Third-party service error');
          return new Response('TTS service error', {
            status: 502,
            headers: createSafeHeaders(env, { 'Content-Type': 'text/plain' })
          });
        }

        // 处理不同的音频数据格式
        if (jsonResponse.audio_url || jsonResponse.file_url || jsonResponse.download_url) {
          // 直接音频URL的情况
          const contentUrl = jsonResponse.audio_url || jsonResponse.file_url || jsonResponse.download_url;
          const contentResponse = await fetch(contentUrl);

          if (!contentResponse.ok) {
            const duration = Date.now() - startTime;
            logRequest(request.method, '/api/tts', 502, duration, 'Failed to fetch audio content');
            return new Response('TTS service error', {
              status: 502,
              headers: createSafeHeaders(env, { 'Content-Type': 'text/plain' })
            });
          }

          const audioContentType = contentResponse.headers.get('Content-Type') || 'audio/mpeg';
          const duration = Date.now() - startTime;
          logRequest(request.method, '/api/tts', 200, duration);

          return new Response(contentResponse.body, {
            status: 200,
            headers: createSafeHeaders(env, {
              'Content-Type': audioContentType,
              'Cache-Control': 'no-cache, no-store, must-revalidate'
            })
          });
        } else if (jsonResponse.data && jsonResponse.data.audio) {
          // MiniMax格式：data.audio包含十六进制编码的音频数据，解码后流式回传
          try {
            const hexAudio = jsonResponse.data.audio;
            // 将hex字符串转换为字节数组
            const audioBytes = new Uint8Array(hexAudio.length / 2);
            for (let i = 0; i < hexAudio.length; i += 2) {
              audioBytes[i / 2] = parseInt(hexAudio.substr(i, 2), 16);
            }

            const duration = Date.now() - startTime;
            logRequest(request.method, '/api/tts', 200, duration);

            // 直接流式回传音频二进制数据
            return new Response(audioBytes, {
              status: 200,
              headers: createSafeHeaders(env, {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-cache, no-store, must-revalidate'
              })
            });
          } catch (hexError) {
            const duration = Date.now() - startTime;
            logRequest(request.method, '/api/tts', 502, duration, 'Failed to decode hex audio data');
            return new Response('TTS service error', {
              status: 502,
              headers: createSafeHeaders(env, { 'Content-Type': 'text/plain' })
            });
          }
        }

        // 如果是其他JSON响应但没有业务错误，记录响应内容用于调试
        const duration = Date.now() - startTime;
        const debugInfo = `JSON response without audio URL. Keys: ${Object.keys(jsonResponse).join(', ')}`;
        logRequest(request.method, '/api/tts', 502, duration, debugInfo);
        return new Response('TTS service error', {
          status: 502,
          headers: createSafeHeaders(env, { 'Content-Type': 'text/plain' })
        });

      } catch (jsonError) {
        // JSON解析失败，尝试作为二进制内容流式返回
        const duration = Date.now() - startTime;
        logRequest(request.method, '/api/tts', 200, duration);

        return new Response(response.body, {
          status: 200,
          headers: createSafeHeaders(env, {
            'Content-Type': contentType || 'application/octet-stream',
            'Cache-Control': 'no-cache'
          })
        });
      }
    } else {
      // 修复：对于其他类型也使用流式传输
      const duration = Date.now() - startTime;
      logRequest(request.method, '/api/tts', 200, duration);

      return new Response(response.body, {
        status: 200,
        headers: createSafeHeaders(env, {
          'Content-Type': contentType || 'application/octet-stream',
          'Cache-Control': 'no-cache'
        })
      });
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logRequest(request.method, '/api/tts', 500, duration, errorMessage);

    return new Response('TTS service error', {
      status: 500,
      headers: createSafeHeaders(env, { 'Content-Type': 'text/plain' })
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const startTime = Date.now();

    try {
      const corsResponse = handleCORS(request, env);
      if (corsResponse) {
        const duration = Date.now() - startTime;
        logRequest(request.method, new URL(request.url).pathname, corsResponse.status, duration);
        return corsResponse;
      }

      const authResponse = checkAuth(request, env);
      if (authResponse) {
        const duration = Date.now() - startTime;
        logRequest(request.method, new URL(request.url).pathname, authResponse.status, duration);
        return authResponse;
      }

      const url = new URL(request.url);

      if (url.pathname === '/api/tts') {
        return await handleTTSService(request, env);
      }

      const duration = Date.now() - startTime;
      logRequest(request.method, url.pathname, 404, duration);

      return new Response('Not Found', {
        status: 404,
        headers: createSafeHeaders(env, { 'Content-Type': 'text/plain' })
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logRequest(request.method, request.url, 500, duration, errorMessage);
      return new Response('Internal server error', {
        status: 500,
        headers: createSafeHeaders(env, { 'Content-Type': 'text/plain' })
      });
    }
  },
};
