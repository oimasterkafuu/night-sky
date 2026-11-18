import { assets } from './assets.mjs';

const security = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'geolocation=()'
};

export default {
  fetch(request) {
    const head = request.method === 'HEAD';
    if (request.method !== 'GET' && !head) {
      return new Response('Method Not Allowed', {
        status: 405, headers: { ...security, Allow: 'GET, HEAD' }
      });
    }

    const { pathname } = new URL(request.url);
    if (pathname === '/api/time') {
      return new Response(head ? null : JSON.stringify({ unixMs: Date.now() }), {
        headers: {
          ...security, 'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, max-age=0', 'CDN-Cache-Control': 'no-store'
        }
      });
    }

    const asset = assets.get(pathname);
    if (!asset) return new Response(head ? null : 'Not Found', { status: 404, headers: security });

    const acceptsGzip = (request.headers.get('Accept-Encoding') || '').split(',').some(entry => {
      const [coding, quality = ''] = entry.trim().toLowerCase().split(/\s*;\s*/);
      return coding === 'gzip' && !/^q\s*=\s*0(?:\.0+)?$/.test(quality);
    });
    const headers = {
      ...security, 'Content-Type': asset.type, Vary: 'Accept-Encoding',
      'Cache-Control': pathname === '/' ? 'no-cache' : 'public, max-age=300'
    };
    if (acceptsGzip) {
      return new Response(head ? null : Uint8Array.from(atob(asset.gzip), c => c.charCodeAt(0)), {
        headers: { ...headers, 'Content-Encoding': 'gzip' }, encodeBody: 'manual'
      });
    }
    if (head) return new Response(null, { headers });
    const gzip = Uint8Array.from(atob(asset.gzip), c => c.charCodeAt(0));
    const plain = new Response(gzip).body.pipeThrough(new DecompressionStream('gzip'));
    return new Response(plain, { headers });
  }
};
