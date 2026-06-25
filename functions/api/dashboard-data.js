const RAW_DASHBOARD_DATA_URL = 'https://raw.githubusercontent.com/shata733-source/testpack-data/main/dashboard_data.js';

export async function onRequestGet(context) {
  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/dashboard-data-cache/dashboard_data.js', context.request.url).toString(), context.request);

  let cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  const upstream = await fetch(RAW_DASHBOARD_DATA_URL, {
    cf: { cacheTtl: 60, cacheEverything: true },
    headers: { 'accept': 'application/javascript,text/javascript,*/*' }
  });

  if (!upstream.ok) {
    return new Response('// dashboard_data.js load failed: HTTP ' + upstream.status, {
      status: upstream.status,
      headers: {
        'content-type': 'application/javascript; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  }

  const body = await upstream.text();
  const response = new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=300',
      'x-ccc-source': 'github-dashboard-data-proxy',
      'x-ccc-cache-seconds': '60'
    }
  });

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
