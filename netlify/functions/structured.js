'use strict';

const HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};

function json(statusCode, body) {
  return { statusCode, headers: HEADERS, body: JSON.stringify(body) };
}

function route(event) {
  const path = String(event && event.path || '').replace(/^\/api\/structured/, '').replace(/^\/\.netlify\/functions\/structured/, '') || '/';
  const method = String(event && event.httpMethod || 'GET').toUpperCase();
  return { path, method };
}

exports.handler = async function handler(event) {
  const r = route(event);
  if (r.method !== 'GET') return json(405, { ok: false, error: 'Method not allowed' });

  if (r.path === '/' || r.path === '/health') {
    return json(200, {
      ok: true,
      service: 'structured-runtime',
      mode: 'scaffold',
      dataAvailable: false,
      dataGate: 'locked',
      reason: 'Production structured endpoint is reachable, but no private structured data source is configured. Do not cut over UI defaults.',
      endpoints: ['/api/structured/health', '/api/structured/counts', '/api/structured/jobs'],
    });
  }

  if (r.path === '/counts' || r.path === '/jobs') {
    return json(503, {
      ok: false,
      service: 'structured-runtime',
      mode: 'scaffold',
      dataAvailable: false,
      error: 'STRUCTURED_DATA_SOURCE_NOT_CONFIGURED',
      detail: 'This endpoint intentionally refuses population data until a private structured data source and cutover approval are configured.',
    });
  }

  return json(404, { ok: false, error: 'Not found', path: r.path });
};
