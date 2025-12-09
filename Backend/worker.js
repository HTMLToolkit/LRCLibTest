// LRCLIB API Proxy
// Proxies /api/* requests to lrclib.net to avoid CORS issues


const LRCLIB_API = 'https://lrclib.net/api';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    // Proxy API requests
    if (path.startsWith('/api/') || path === '/api') {
      return handleApiProxy(request, url);
    }

    // Root path - show info
    if (path === '/' || path === '') {
      return new Response(JSON.stringify({
        name: 'LRCGetter Backend',
        description: 'API proxy for LRCLIB to avoid CORS issues',
        frontend: 'https://htmltoolkit.github.io/LRCLibTest/',
        endpoints: [
          'GET /api/get?track_name=...&artist_name=...&album_name=...&duration=...',
          'GET /api/get-cached?track_name=...&artist_name=...&album_name=...&duration=...',
          'GET /api/get/{id}',
          'GET /api/search?q=...&track_name=...&artist_name=...&album_name=...',
          'POST /api/request-challenge',
          'POST /api/publish'
        ],
        source: 'https://lrclib.net/api'
      }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin':  '*',
        },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

function handleCors() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Publish-Token, Accept',
      'Access-Control-Max-Age': '86400',
    },
  });
}

async function handleApiProxy(request, url) {
  // Build the target URL
  const apiPath = url.pathname.replace(/^\/api/, '');
  const targetUrl = LRCLIB_API + apiPath + url.search;

  // Clone headers, removing Cloudflare-specific ones
  const headers = new Headers();
  for (const [key, value] of request.headers) {
    const lowerKey = key.toLowerCase();
    if (! ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'cdn-loop'].includes(lowerKey)) {
      headers.set(key, value);
    }
  }

  // Add User-Agent for LRCLIB
  headers.set('User-Agent', 'LRCGetter/1.0 (https://htmltoolkit.github.io/LRCLibTest/)');

  // Make the proxied request
  const proxyRequest = new Request(targetUrl, {
    method: request.method,
    headers:  headers,
    body: request.method !== 'GET' && request.method !== 'HEAD' ?request.body : undefined,
  });

  try {
    const response = await fetch(proxyRequest);

    // Create response with CORS headers
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    responseHeaders.set('Access-Control-Allow-Headers', 'Content-Type, X-Publish-Token, Accept');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Proxy error', message: error.message }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}