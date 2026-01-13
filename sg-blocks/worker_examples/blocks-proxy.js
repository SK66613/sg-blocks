
// worker_examples/blocks-proxy.js
export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/blocks/')) {
      return new Response('Not Found', { status: 404 });
    }

    const country = (request.cf && request.cf.country) || '';
    const ORIGIN_CF = 'https://mini-runtime.pages.dev/blocks/';
    const ORIGIN_GH = 'https://<org>.github.io/sg-blocks/'; // TODO: replace <org>

    const origin = /^(RU|BY|KZ)$/.test(country) ? ORIGIN_GH : ORIGIN_CF;
    const upstream = origin + url.pathname.slice('/blocks/'.length) + url.search;

    const r = await fetch(upstream, { method:'GET' });
    const resp = new Response(r.body, r);
    resp.headers.set('Cache-Control', 'public, max-age=600, s-maxage=600');
    resp.headers.set('Access-Control-Allow-Origin', '*');
    return resp;
  }
};
