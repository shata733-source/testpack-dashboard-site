const DEFAULT_DASHBOARD_DATA_URL = 'https://raw.githubusercontent.com/shata733-source/testpack-data/main/dashboard_data.js';

function jsResponse(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600',
      ...extraHeaders
    }
  });
}

export async function onRequestGet(context) {
  const originUrl = String(context.env.DASHBOARD_DATA_URL || DEFAULT_DASHBOARD_DATA_URL);
  const reqUrl = new URL(context.request.url);
  // Normalize the cache key so client cache-busting query strings do not destroy edge cache hits.
  const cacheKey = new Request(reqUrl.origin + reqUrl.pathname, context.request);
  const cache = caches.default;

  try {
    const cached = await cache.match(cacheKey);
    if (cached) {
      const h = new Headers(cached.headers);
      h.set('x-dashboard-data-cache', 'HIT');
      return new Response(cached.body, { status: cached.status, headers: h });
    }
  } catch (_) {}

  try {
    const upstream = await fetch(originUrl, {
      headers: {
        'accept': 'application/javascript,text/javascript,*/*;q=0.8',
        'user-agent': 'CCC-Dashboard-Cloudflare-Proxy/1.0'
      },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!upstream.ok) {
      return jsResponse(`console.warn(${JSON.stringify('dashboard_data.js upstream failed: HTTP ' + upstream.status)});`, upstream.status, { 'x-dashboard-data-cache': 'UPSTREAM_ERROR' });
    }
    const body = await upstream.text();
    const resp = jsResponse(body, 200, {
      'x-dashboard-data-cache': 'MISS',
      'x-dashboard-data-source': 'github-raw-proxy'
    });
    try { context.waitUntil(cache.put(cacheKey, resp.clone())); } catch (_) {}
    return resp;
  } catch (e) {
    return jsResponse(`console.warn(${JSON.stringify('dashboard_data.js proxy error: ' + (e && e.message ? e.message : String(e))) });`, 500, { 'x-dashboard-data-cache': 'ERROR' });
  }
}
