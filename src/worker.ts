interface Env {
  THIRD_PARTY_TTS_URL: string;
  THIRD_PARTY_GROUP_ID: string;
  THIRD_PARTY_TTS_KEY: string;
  PROXY_TOKEN: string;
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
      headers: {
        'Access-Control-Allow-Origin': env.CORS_ORIGIN,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Proxy-Token',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  return null;
}

function checkAuth(request: Request, env: Env): Response | null {
  const token = request.headers.get('X-Proxy-Token');

  if (!token || token !== env.PROXY_TOKEN) {
    return new Response('Unauthorized', {
      status: 401,
      headers: {
        'Access-Control-Allow-Origin': env.CORS_ORIGIN,
        'Content-Type': 'text/plain',
      }
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
        headers: {
          'Access-Control-Allow-Origin': env.CORS_ORIGIN,
          'Content-Type': 'text/plain',
        }
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
        headers: {
          'Access-Control-Allow-Origin': env.CORS_ORIGIN,
          'Content-Type': 'text/plain',
        }
      });
    }

    const contentType = response.headers.get('Content-Type');

    if (contentType && contentType.startsWith('audio/')) {
      const audioBuffer = await response.arrayBuffer();
      const duration = Date.now() - startTime;
      logRequest(request.method, '/api/tts', 200, duration);

      return new Response(audioBuffer, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': env.CORS_ORIGIN,
          'Content-Type': contentType,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    } else if (contentType && contentType.includes('application/json')) {
      try {
        const jsonResponse = await response.json();

        if (jsonResponse.audio_url || jsonResponse.file_url || jsonResponse.download_url) {
          const contentUrl = jsonResponse.audio_url || jsonResponse.file_url || jsonResponse.download_url;
          const contentResponse = await fetch(contentUrl);

          if (!contentResponse.ok) {
            throw new Error('Failed to fetch audio content');
          }

          const contentBuffer = await contentResponse.arrayBuffer();
          const audioContentType = contentResponse.headers.get('Content-Type') || 'audio/mpeg';
          const duration = Date.now() - startTime;
          logRequest(request.method, '/api/tts', 200, duration);

          return new Response(contentBuffer, {
            status: 200,
            headers: {
              'Access-Control-Allow-Origin': env.CORS_ORIGIN,
              'Content-Type': audioContentType,
              'Cache-Control': 'no-cache, no-store, must-revalidate',
            },
          });
        }

        const duration = Date.now() - startTime;
        logRequest(request.method, '/api/tts', 200, duration);

        return new Response(JSON.stringify(jsonResponse), {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': env.CORS_ORIGIN,
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
          },
        });

      } catch (jsonError) {
        const responseData = await response.arrayBuffer();
        const duration = Date.now() - startTime;
        logRequest(request.method, '/api/tts', 200, duration);

        return new Response(responseData, {
          status: 200,
          headers: {
            'Access-Control-Allow-Origin': env.CORS_ORIGIN,
            'Content-Type': contentType || 'application/octet-stream',
            'Cache-Control': 'no-cache',
          },
        });
      }
    } else {
      const responseData = await response.arrayBuffer();
      const duration = Date.now() - startTime;
      logRequest(request.method, '/api/tts', 200, duration);

      return new Response(responseData, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': env.CORS_ORIGIN,
          'Content-Type': contentType || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        },
      });
    }

  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logRequest(request.method, '/api/tts', 500, duration, errorMessage);

    return new Response('TTS service error', {
      status: 500,
      headers: {
        'Access-Control-Allow-Origin': env.CORS_ORIGIN,
        'Content-Type': 'text/plain',
      }
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
        headers: {
          'Access-Control-Allow-Origin': env.CORS_ORIGIN,
          'Content-Type': 'text/plain',
        }
      });

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logRequest(request.method, request.url, 500, duration, errorMessage);

      return new Response('Internal server error', {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
        }
      });
    }
  },
};