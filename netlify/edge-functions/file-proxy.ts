export default async (request: Request, context: any) => {
  const url = new URL(request.url);
  const originalPath = url.pathname;

  // Expect paths like: /f/bucket-name/path/to/file.pdf
  const parts = originalPath.split('/').filter(Boolean);
  if (parts.length < 3 || parts[0] !== 'f') {
    return new Response(JSON.stringify({ error: 'Invalid path. Use /f/<bucket>/<path>' }), {
      status: 400,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*'
      }
    });
  }

  const bucket = parts[1];
  const filePath = parts.slice(2).join('/');

  // Rebuild Supabase public URL and forward all query params
  const supabaseBase = 'https://kydmyxsgyxeubhmqzrgo.supabase.co/storage/v1/object/public';
  const targetUrl = `${supabaseBase}/${bucket}/${filePath}${url.search}`;

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        'accept': request.headers.get('accept') || '*/*'
      }
    });

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'File not found' }), {
        status: upstream.status,
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*'
        }
      });
    }

    // Clone headers and enforce long cache
    const headers = new Headers(upstream.headers);
    const contentType = headers.get('content-type') || 'application/octet-stream';
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    headers.set('access-control-allow-origin', '*');
    headers.set('x-proxied-by', 'netlify-file-proxy');

    return new Response(upstream.body, {
      status: 200,
      headers
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: 'Proxy failure', message: err?.message || 'unknown' }), {
      status: 500,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*'
      }
    });
  }
};