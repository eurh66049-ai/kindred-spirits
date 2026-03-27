export default async (request: Request, context: any) => {
  const url = new URL(request.url);
  const userAgent = request.headers.get('user-agent') || '';
  
  // فحص ما إذا كان الطلب من social crawler فقط (لمعاينة المشاركة)
  // لا نعامل Googlebot أبداً - نتركه يرى التطبيق الحقيقي لتجنب Cloaking
  const isSocialCrawler = /facebookexternalhit|twitterbot|linkedinbot|whatsapp|telegram|discord|slack|LinkedInBot|facebot|WhatsApp/i.test(userAgent);
  const isViewSource = url.pathname.endsWith('/view-source') 
    || url.searchParams.has('view-source') 
    || url.searchParams.get('mode') === 'view-source' 
    || url.pathname.endsWith('/viez-source');
  
  // Google و Bing يجب أن يروا التطبيق الحقيقي
  const isSearchEngine = /googlebot|bingbot|yandexbot|duckduckbot|baiduspider/i.test(userAgent);
  
  console.log('User Agent:', userAgent);
  console.log('Is Social Crawler:', isSocialCrawler);
  console.log('Is Search Engine:', isSearchEngine);
  console.log('URL:', url.pathname);
  
  // محركات البحث ترى التطبيق الحقيقي - لا HTML ثابت
  if (isSearchEngine) {
    return context.next();
  }
  
  // إذا لم يكن social crawler أو وضع "view-source"، مرّر الطلب للتطبيق الرئيسي (SPA)
  if (!isSocialCrawler && !isViewSource) {
    return context.next();
  }


  try {
    // استخراج معرف الكتاب من الرابط - دعم URL المُرمز ومسار view-source
    const pathParts = url.pathname.split('/').filter(Boolean);
    let bookId = pathParts[pathParts.length - 1];
    // إذا كان آخر جزء هو view-source أو viez-source، استخدم الجزء السابق كمعرف الكتاب
    if (bookId === 'view-source' || bookId === 'viez-source') {
      bookId = pathParts[pathParts.length - 2] || '';
    }
    
    // فك ترميز URL إذا كان مُرمزاً
    try {
      bookId = decodeURIComponent(bookId);
    } catch (e) {
      console.log('Could not decode bookId:', bookId);
    }
    
    console.log('Extracted bookId:', bookId);
    
    if (!bookId) {
      return new Response('Book not found', { status: 404 });
    }

    // جلب بيانات الكتاب من Supabase
    const supabaseUrl = 'https://kydmyxsgyxeubhmqzrgo.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZG15eHNneXhldWJobXF6cmdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY0ODQ3NjQsImV4cCI6MjA2MjA2MDc2NH0.b-ckDfOmmf2x__FG5Snm9px8j4pqPke5Ra1RgoGEqP0';
    
    // البحث بـ slug أو ID - البحث أولاً بـ slug ثم بـ ID
    console.log('Searching for book with slug/ID:', bookId);
    
    // البحث بـ slug أولاً - بحث مرن يدعم URL encoding مختلف
    let searchUrl = `${supabaseUrl}/rest/v1/book_submissions?select=id,title,author,description,cover_image_url,category,slug,publication_year&status=eq.approved&slug=eq.${encodeURIComponent(bookId)}&limit=1`;
    let response = await fetch(searchUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Slug search response status:', response.status);
    let books = await response.json();
    
    // إذا لم نجد نتائج بـ slug، جرب البحث بـ slug مع ilike pattern
    if (!books || books.length === 0) {
      console.log('No book found with exact slug, trying flexible slug search...');
      
      // بحث مرن بـ slug
      const flexibleSlug = bookId.replace(/-/g, ' ').toLowerCase();
      searchUrl = `${supabaseUrl}/rest/v1/book_submissions?select=id,title,author,description,cover_image_url,category,slug,publication_year&status=eq.approved&slug=ilike.*${encodeURIComponent(flexibleSlug)}*&limit=1`;
      
      response = await fetch(searchUrl, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Flexible slug search response status:', response.status);
      books = await response.json();
    }
    
    // إذا لم نجد نتائج بـ slug، نبحث بـ ID
    if (!books || books.length === 0) {
      console.log('No book found with slug, trying ID search...');
      
      // محاولة البحث بـ ID
      try {
        const uuidBookId = bookId; // نحاول استخدام bookId كما هو أولاً
        searchUrl = `${supabaseUrl}/rest/v1/book_submissions?select=id,title,author,description,cover_image_url,category,slug,publication_year&status=eq.approved&id=eq.${uuidBookId}&limit=1`;
        
        response = await fetch(searchUrl, {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
        });
        
        console.log('ID search response status:', response.status);
        books = await response.json();
      } catch (e) {
        console.log('Error searching by ID:', e);
      }
    }
    
    // إذا لم نجد نتائج بـ ID أيضاً، نبحث بـ title+author
    if (!books || books.length === 0) {
      console.log('No book found with ID, trying title+author search...');
      
      // محاولة استخراج العنوان والمؤلف من slug
      const slugParts = bookId.split('-');
      if (slugParts.length >= 2) {
        // آخر جزء يُعتبر المؤلف والباقي العنوان
        const authorPart = slugParts[slugParts.length - 1];
        const titlePart = slugParts.slice(0, -1).join('-');
        
        console.log('Searching by title:', titlePart, 'and author:', authorPart);
        
        searchUrl = `${supabaseUrl}/rest/v1/book_submissions?select=id,title,author,description,cover_image_url,category,slug,publication_year&status=eq.approved&title=ilike.*${encodeURIComponent(titlePart.replace(/-/g, ' '))}*&author=ilike.*${encodeURIComponent(authorPart.replace(/-/g, ' '))}*&limit=1`;
        
        try {
          response = await fetch(searchUrl, {
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json'
            }
          });
          
          console.log('Title+Author search response status:', response.status);
          books = await response.json();
        } catch (e) {
          console.log('Error searching by title+author:', e);
        }
      }
    }
    
    if (!books || books.length === 0) {
      console.log('No books found for any search method:', bookId);
      return new Response('Book not found', { status: 404 });
    }

    const book = books[0];
    
    // إنشاء وصف مناسب
    const description = book.description && book.description.length > 0
      ? `${book.description.substring(0, 200)}...` 
      : `كتاب ${book.title} للمؤلف ${book.author} - اقرأ وحمّل مجاناً من منصة كتبي`;

    // استخدام نطاق ثابت للـ canonical URL لتجنب مشاكل الفهرسة
    const baseUrl = 'https://kotobi.xyz';
    const bookUrl = `${baseUrl}/book/${encodeURIComponent(book.slug || book.id)}`;
    const imageUrl = book.cover_image_url || `${baseUrl}/lovable-uploads/b1cd70fc-5c3b-47f2-bfe7-f200d836822e.png`;

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="canonical" href="${bookUrl}">
  
  <!-- Basic Meta Tags -->
  <title>${book.title} - ${book.author} | منصة كتبي</title>
  <meta name="description" content="${description}">
  <meta name="author" content="${book.author}">
  <meta name="keywords" content="${book.category}, كتب عربية, قراءة مجانية, ${book.author}, ${book.title}">
  
  <!-- Open Graph Meta Tags for Social Media -->
  <meta property="og:title" content="${book.title} - ${book.author}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="600">
  <meta property="og:image:height" content="800">
  <meta property="og:image:alt" content="غلاف كتاب ${book.title}">
  <meta property="og:url" content="${bookUrl}">
  <meta property="og:type" content="book">
  <meta property="og:site_name" content="منصة كتبي - المكتبة الرقمية العربية المجانية">
  <meta property="og:locale" content="ar_AR">
  
  <!-- Twitter Card Meta Tags -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${book.title} - ${book.author}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  
  <!-- Book-specific Schema.org structured data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Book",
    "name": "${book.title}",
    "author": {
      "@type": "Person",
      "name": "${book.author}"
    },
    "description": "${description}",
    "url": "${bookUrl}",
    "genre": "${book.category}",
    "inLanguage": "ar",
    "publisher": "منصة كتبي",
    "image": "${imageUrl}",
    "isAccessibleForFree": true,
    ${book.publication_year ? `"datePublished": "${book.publication_year}",` : ''}
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "USD",
      "availability": "https://schema.org/InStock"
    }
  }
  </script>
  
  <!-- No redirect; serve full HTML page -->
  
  <style>
    body {
      font-family: 'Cairo', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      text-align: center;
      padding: 50px 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
    }
    .container {
      max-width: 500px;
      background: rgba(255, 255, 255, 0.1);
      padding: 30px;
      border-radius: 20px;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .book-cover {
      max-width: 180px;
      height: auto;
      margin: 0 auto 20px;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      display: block;
    }
    .book-title {
      font-size: 24px;
      font-weight: bold;
      margin-bottom: 8px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
      line-height: 1.3;
    }
    .book-author {
      font-size: 18px;
      margin-bottom: 15px;
      opacity: 0.9;
    }
    .book-description {
      font-size: 14px;
      line-height: 1.5;
      margin-bottom: 15px;
      opacity: 0.8;
    }
  </style>
</head>
<body>
  <div class="container">
    <img src="${imageUrl}" 
         alt="غلاف كتاب ${book.title}" 
         class="book-cover"
         onerror="this.src='${url.origin}/lovable-uploads/b1cd70fc-5c3b-47f2-bfe7-f200d836822e.png';">
    <h1 class="book-title">${book.title}</h1>
    <h2 class="book-author">تأليف: ${book.author}</h2>
    <p class="book-description">${description}</p>
    
  </div>
</body>
</html>`;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
};