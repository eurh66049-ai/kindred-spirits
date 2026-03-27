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
    // استخراج اسم المؤلف من الرابط - دعم URL المُرمز ومسار view-source
    const pathParts = url.pathname.split('/').filter(Boolean);
    let authorParam = pathParts[pathParts.length - 1];
    // إذا كان آخر جزء هو view-source أو viez-source، استخدم الجزء السابق كمعرف المؤلف
    if (authorParam === 'view-source' || authorParam === 'viez-source') {
      authorParam = pathParts[pathParts.length - 2] || '';
    }
    
    // فك ترميز URL إذا كان مُرمزاً
    try {
      authorParam = decodeURIComponent(authorParam);
    } catch (e) {
      console.log('Could not decode authorParam:', authorParam);
    }
    
    console.log('Extracted authorParam:', authorParam);
    
    if (!authorParam) {
      return new Response('Author not found', { status: 404 });
    }

    // جلب بيانات المؤلف من Supabase
    const supabaseUrl = 'https://kydmyxsgyxeubhmqzrgo.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZG15eHNneXhldWJobXF6cmdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY0ODQ3NjQsImV4cCI6MjA2MjA2MDc2NH0.b-ckDfOmmf2x__FG5Snm9px8j4pqPke5Ra1RgoGEqP0';
    
    // البحث بـ slug أو name - البحث أولاً بـ slug ثم بـ name
    console.log('Searching for author with slug/name:', authorParam);
    
    // استخدام RPC function المحسنة أولاً (نفس ما يستخدمه الموقع)
    let searchUrl = `${supabaseUrl}/rest/v1/rpc/get_complete_author_data`;
    let response = await fetch(searchUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ p_author_name: authorParam })
    });

    console.log('RPC get_complete_author_data response status:', response.status);
    let authorDataArray = [];
    
    if (response.ok) {
      authorDataArray = await response.json();
    }
    
    let authors = [];
    if (authorDataArray && authorDataArray.length > 0) {
      // تحويل بيانات RPC إلى تنسيق مشابه لجدول authors
      const rpcAuthor = authorDataArray[0];
      authors = [{
        id: rpcAuthor.author_id,
        name: rpcAuthor.author_name || rpcAuthor.name,
        bio: rpcAuthor.profile_bio || rpcAuthor.bio,
        avatar_url: rpcAuthor.profile_avatar || rpcAuthor.avatar_url,
        books_count: rpcAuthor.books_count,
        followers_count: rpcAuthor.followers_count,
        country_name: rpcAuthor.country_name,
        social_links: rpcAuthor.social_links,
        website: rpcAuthor.website,
        slug: rpcAuthor.slug,
        // حفظ البيانات الإضافية للاستخدام لاحقاً
        profile_bio: rpcAuthor.profile_bio,
        profile_avatar: rpcAuthor.profile_avatar
      }];
      console.log('Found author via RPC:', authors[0].name);
    }
    
    // إذا فشل RPC، استخدم البحث التقليدي
    if (!authors || authors.length === 0) {
      console.log('RPC failed, falling back to direct table query...');
      searchUrl = `${supabaseUrl}/rest/v1/authors?select=*&slug=eq.${encodeURIComponent(authorParam)}&limit=1`;
      response = await fetch(searchUrl, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });
    
      console.log('Slug search response status:', response.status);
      authors = await response.json();
    
    // إذا لم نجد نتائج بـ slug، جرب البحث بـ slug مع ilike pattern
    if (!authors || authors.length === 0) {
      console.log('No author found with exact slug, trying flexible slug search...');
      
      // بحث مرن بـ slug - استخدام بحث أكثر دقة
      const flexibleSlug = authorParam.replace(/-/g, ' ').toLowerCase();
      searchUrl = `${supabaseUrl}/rest/v1/authors?select=*&slug=ilike.${encodeURIComponent(flexibleSlug)}&limit=5`;
      
      response = await fetch(searchUrl, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Flexible slug search response status:', response.status);
      const flexibleResults = await response.json();
      
      // البحث عن أفضل تطابق في النتائج
      if (flexibleResults && flexibleResults.length > 0) {
        authors = flexibleResults.filter(a => 
          a.slug === authorParam || 
          a.slug === flexibleSlug ||
          a.slug?.toLowerCase() === authorParam.toLowerCase()
        );
        if (authors.length === 0) {
          authors = flexibleResults.slice(0, 1); // استخدم أول نتيجة كحل أخير
        }
      }
    }
    
    // إذا لم نجد نتائج بـ slug، نبحث بـ name (exact match)
    if (!authors || authors.length === 0) {
      console.log('No author found with slug, trying exact name search...');
      
      searchUrl = `${supabaseUrl}/rest/v1/authors?select=*&name=eq.${encodeURIComponent(authorParam)}&limit=1`;
      
      response = await fetch(searchUrl, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Exact name search response status:', response.status);
      authors = await response.json();
    }
    
    // إذا لم نجد نتائج بـ exact name، نبحث بـ name مع ilike
    if (!authors || authors.length === 0) {
      console.log('No author found with exact name, trying flexible name search...');
      
      // بحث مرن بـ name - تحويل الشرطات لمساحات وإزالة الأحرف الخاصة
      const flexibleName = authorParam.replace(/-/g, ' ').replace(/[^\u0600-\u06FF\u0750-\u077Fa-zA-Z0-9\s]/g, '');
      searchUrl = `${supabaseUrl}/rest/v1/authors?select=*&name=ilike.${encodeURIComponent(flexibleName)}&limit=10`;
      
      response = await fetch(searchUrl, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('Flexible name search response status:', response.status);
      const nameResults = await response.json();
      
      // البحث عن أفضل تطابق - أعط الأولوية للتطابق الدقيق
      if (nameResults && nameResults.length > 0) {
        // ابحث عن تطابق دقيق أولاً
        authors = nameResults.filter(a => 
          a.name === authorParam || 
          a.name === flexibleName ||
          a.name.toLowerCase() === authorParam.toLowerCase() ||
          a.name.toLowerCase() === flexibleName.toLowerCase()
        );
        
        // إذا لم نجد تطابق دقيق، استخدم النتيجة الأولى فقط
        if (authors.length === 0) {
          // تأكد من أن النتيجة الأولى تحتوي على جزء من الاسم المطلوب
          const firstResult = nameResults[0];
          if (firstResult.name.includes(flexibleName) || flexibleName.includes(firstResult.name)) {
            authors = [firstResult];
          }
        }
      }
    }

    }
    
    if (!authors || authors.length === 0) {
      console.log('No author found for any search method:', authorParam);
      return new Response('Author not found', { status: 404 });
    }
    
    const author = authors[0];
    
    // Log author data for debugging
    console.log('Found author:', {
      name: author.author_name || author.name,
      bio: author.profile_bio || author.bio,
      avatar_url: author.profile_avatar || author.avatar_url,
      books_count: author.books_count,
      followers_count: author.followers_count
    });

    // Prefer profile data over author table data (same logic as website)
    const authorName = author.author_name || author.name;
    const authorBio = author.profile_bio || author.bio;
    const authorAvatar = author.profile_avatar || author.avatar_url;

    // Generate author description - use bio if available, otherwise create default
    const description = authorBio && authorBio.trim() 
      ? (authorBio.length > 160 ? `${authorBio.substring(0, 160)}...` : authorBio)
      : `اكتشف أعمال ${authorName} واقرأ كتبه مجاناً على منصة كتبي - المكتبة الرقمية العربية المجانية.`;

    const authorUrl = `${url.origin}/author/${encodeURIComponent(author.slug || authorName)}`;
    
    // Use author's actual avatar if available, otherwise use default
    const imageUrl = authorAvatar && authorAvatar.trim() 
      ? (authorAvatar.startsWith('http') ? authorAvatar : `${url.origin}${authorAvatar}`)
      : `${url.origin}/default-author-avatar.png`;
    
    // جلب كتب المؤلف لإضافتها للـ Schema - استخدام الاسم الصحيح
    let authorBooks = [];
    try {
      const authorNameForBooks = author.name;
      const booksResponse = await fetch(`${supabaseUrl}/rest/v1/book_submissions?select=title,slug,id&status=eq.approved&author=eq.${encodeURIComponent(authorNameForBooks)}&limit=10`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (booksResponse.ok) {
        authorBooks = await booksResponse.json();
      }
    } catch (e) {
      console.log('Could not fetch author books:', e);
    }

    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="canonical" href="${authorUrl}">
  
  <!-- Basic Meta Tags -->
  <title>${author.name} | منصة كتبي - المكتبة الرقمية العربية</title>
  <meta name="description" content="${description}">
  <meta name="author" content="${author.name}">
  <meta name="keywords" content="${author.name}, مؤلف, كتب عربية, منصة كتبي, قراءة مجانية${author.country_name ? ', ' + author.country_name : ''}${authorBooks.length > 0 ? ', ' + authorBooks.map(b => b.title).join(', ') : ''}">
  
  <!-- Open Graph Meta Tags for Social Media -->
  <meta property="og:title" content="${author.name} - مؤلف عربي">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <meta property="og:image:width" content="400">
  <meta property="og:image:height" content="400">
  <meta property="og:image:alt" content="صورة المؤلف ${author.name}">
  <meta property="og:url" content="${authorUrl}">
  <meta property="og:type" content="profile">
  <meta property="og:site_name" content="منصة كتبي - المكتبة الرقمية العربية المجانية">
  <meta property="og:locale" content="ar_AR">
  
  <!-- Profile specific Open Graph -->
  <meta property="profile:first_name" content="${author.name.split(' ')[0] || author.name}">
  <meta property="profile:last_name" content="${author.name.split(' ').slice(1).join(' ') || ''}">
  <meta property="profile:username" content="${author.name}">
  
  <!-- Twitter Card Meta Tags -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${author.name} - مؤلف عربي">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${imageUrl}">
  
  <!-- Author specific Schema.org structured data -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": "${author.name}",
    "description": "${description.replace(/"/g, '\\"')}",
    "url": "${authorUrl}",
    "image": "${imageUrl}",
    "jobTitle": "مؤلف",
    "worksFor": {
      "@type": "Organization",
      "name": "منصة كتبي"
    },
    "sameAs": [
      ${[
        author.website,
        author.social_links?.facebook ? `https://facebook.com/${author.social_links.facebook}` : null,
        author.social_links?.twitter ? `https://twitter.com/${author.social_links.twitter}` : null,
        author.social_links?.instagram ? `https://instagram.com/${author.social_links.instagram}` : null,
        author.social_links?.linkedin ? `https://linkedin.com/in/${author.social_links.linkedin}` : null,
        author.social_links?.youtube ? `https://youtube.com/c/${author.social_links.youtube}` : null
      ].filter(Boolean).map(link => `"${link}"`).join(', ')}
    ],
    ${author.country_name ? `"nationality": "${author.country_name}",` : ''}
    ${author.email ? `"email": "${author.email}",` : ''}
    "knowsAbout": ["الأدب العربي", "الكتابة", "النشر"],
    "award": "${author.books_count || 0} كتاب منشور",
    "interactionStatistic": {
      "@type": "InteractionCounter",
      "interactionType": "https://schema.org/FollowAction",
      "userInteractionCount": "${author.followers_count || 0}"
    }${authorBooks.length > 0 ? `,
    "mainEntity": [
      ${authorBooks.map(book => `{
        "@type": "Book",
        "name": "${book.title}",
        "author": "${author.name}",
        "url": "${url.origin}/book/${book.slug || book.id}"
      }`).join(', ')}
    ]` : ''}
  }
  </script>
  
  <!-- Article structured data for SEO -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "mainEntity": {
      "@type": "Person",
      "name": "${author.name}",
      "description": "${description.replace(/"/g, '\\"')}",
      "image": "${imageUrl}",
      "url": "${authorUrl}"
    },
    "breadcrumb": {
      "@type": "BreadcrumbList",
      "itemListElement": [
        {
          "@type": "ListItem",
          "position": 1,
          "name": "الرئيسية",
          "item": "${url.origin}"
        },
        {
          "@type": "ListItem",
          "position": 2,
          "name": "المؤلفون",
          "item": "${url.origin}/authors"
        },
        {
          "@type": "ListItem",
          "position": 3,
          "name": "${author.name}",
          "item": "${authorUrl}"
        }
      ]
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
      max-width: 600px;
      background: rgba(255, 255, 255, 0.1);
      padding: 40px;
      border-radius: 20px;
      backdrop-filter: blur(10px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.2);
    }
    .author-avatar {
      width: 150px;
      height: 150px;
      border-radius: 50%;
      margin: 0 auto 20px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
      object-fit: cover;
      display: block;
    }
    .author-name {
      font-size: 32px;
      font-weight: bold;
      margin-bottom: 10px;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3);
      line-height: 1.3;
    }
    .author-stats {
      font-size: 18px;
      margin-bottom: 20px;
      opacity: 0.9;
      display: flex;
      justify-content: center;
      gap: 20px;
      flex-wrap: wrap;
    }
    .stat-item {
      background: rgba(255, 255, 255, 0.2);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
    }
    .author-bio {
      font-size: 16px;
      line-height: 1.6;
      margin-bottom: 20px;
      opacity: 0.8;
      text-align: right;
      max-height: 120px;
      overflow: hidden;
    }
    .social-links {
      display: flex;
      justify-content: center;
      gap: 15px;
      margin-top: 20px;
      flex-wrap: wrap;
    }
    .social-link {
      background: rgba(255, 255, 255, 0.2);
      padding: 8px 12px;
      border-radius: 15px;
      font-size: 12px;
      text-decoration: none;
      color: white;
      transition: background 0.3s;
    }
    .social-link:hover {
      background: rgba(255, 255, 255, 0.3);
    }
    .loading-text {
      font-size: 14px;
      opacity: 0.7;
      animation: pulse 2s infinite;
      margin-top: 20px;
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.7; }
      50% { opacity: 1; }
    }
  </style>
</head>
<body>
  <div class="container">
    <img src="${imageUrl}" 
         alt="صورة المؤلف ${author.name}" 
         class="author-avatar"
         onerror="this.src='${url.origin}/default-author-avatar.png';">
    <h1 class="author-name">${author.name}</h1>
    <div class="author-stats">
      <div class="stat-item">📚 ${author.books_count || 0} كتاب</div>
      <div class="stat-item">👥 ${author.followers_count || 0} متابع</div>
      ${author.country_name ? `<div class="stat-item">🌍 ${author.country_name}</div>` : ''}
    </div>
    ${author.bio ? `<div class="author-bio">${author.bio.substring(0, 200)}${author.bio.length > 200 ? '...' : ''}</div>` : ''}
    
    ${author.website || (author.social_links && Object.keys(author.social_links).length > 0) ? 
      `<div class="social-links">
        ${author.website ? `<a href="${author.website}" class="social-link" target="_blank">🌐 الموقع الشخصي</a>` : ''}
        ${author.social_links?.facebook ? `<a href="https://facebook.com/${author.social_links.facebook}" class="social-link" target="_blank">📘 فيسبوك</a>` : ''}
        ${author.social_links?.twitter ? `<a href="https://twitter.com/${author.social_links.twitter}" class="social-link" target="_blank">🐦 تويتر</a>` : ''}
        ${author.social_links?.instagram ? `<a href="https://instagram.com/${author.social_links.instagram}" class="social-link" target="_blank">📷 إنستغرام</a>` : ''}
        ${author.social_links?.linkedin ? `<a href="https://linkedin.com/in/${author.social_links.linkedin}" class="social-link" target="_blank">💼 لينكدإن</a>` : ''}
        ${author.social_links?.youtube ? `<a href="https://youtube.com/c/${author.social_links.youtube}" class="social-link" target="_blank">📺 يوتيوب</a>` : ''}
      </div>` : ''
    }
    
    <p class="loading-text">جاري التوجيه إلى صفحة المؤلف...</p>
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