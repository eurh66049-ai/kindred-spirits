export default async (request: Request, context: any) => {
  const url = new URL(request.url);
  const originalPath = url.pathname;

  // Expect paths like: /i/bucket-name/path/to/image.jpg
  const parts = originalPath.split('/').filter(Boolean);
  if (parts.length < 3 || parts[0] !== 'i') {
    return new Response(JSON.stringify({ error: 'Invalid path. Use /i/<bucket>/<path>' }), {
      status: 400,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*'
      }
    });
  }

  const bucket = parts[1];
  const filePath = parts.slice(2).join('/');

  // Parse optimization parameters
  const width = url.searchParams.get('width') || '200';
  const height = url.searchParams.get('height') || '300';
  const quality = url.searchParams.get('quality') || '45';
  const resize = url.searchParams.get('resize') || 'cover';
  const format = url.searchParams.get('format') || 'webp';

  // استخدام Supabase Image Transformation API للتحسين الفعلي
  const supabaseBase = 'https://kydmyxsgyxeubhmqzrgo.supabase.co/storage/v1';
  
  // بناء رابط التحويل المحسن
  const transformParams = new URLSearchParams({
    width,
    height,
    resize,
    quality,
    format
  });
  
  // استخدام render/image للتحسين الفعلي
  const targetUrl = `${supabaseBase}/render/image/public/${bucket}/${filePath}?${transformParams.toString()}`;

  try {
    const upstream = await fetch(targetUrl, {
      headers: {
        'accept': `image/${format}, image/webp, image/*`,
        'user-agent': 'Kotobi-Image-Proxy/1.0'
      }
    });

    // إذا فشل التحويل، جرب الرابط الأصلي
    if (!upstream.ok) {
      const fallbackUrl = `${supabaseBase}/object/public/${bucket}/${filePath}`;
      const fallbackResponse = await fetch(fallbackUrl, {
        headers: { 'accept': 'image/*' }
      });
      
      if (!fallbackResponse.ok) {
        return new Response(JSON.stringify({ error: 'Image not found' }), {
          status: 404,
          headers: {
            'content-type': 'application/json',
            'access-control-allow-origin': '*'
          }
        });
      }
      
      const fallbackHeaders = new Headers(fallbackResponse.headers);
      fallbackHeaders.set('cache-control', 'public, max-age=2592000, stale-while-revalidate=86400');
      fallbackHeaders.set('access-control-allow-origin', '*');
      fallbackHeaders.set('x-proxied-by', 'netlify-image-proxy-fallback');
      
      return new Response(fallbackResponse.body, {
        status: 200,
        headers: fallbackHeaders
      });
    }

    // Headers محسنة للتخزين المؤقت الطويل
    const headers = new Headers();
    headers.set('content-type', `image/${format}`);
    headers.set('cache-control', 'public, max-age=31536000, immutable');
    headers.set('access-control-allow-origin', '*');
    headers.set('x-proxied-by', 'netlify-image-proxy-optimized');
    headers.set('vary', 'Accept');

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