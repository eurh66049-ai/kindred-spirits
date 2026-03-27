import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Database {
  public: {
    Tables: {
      book_submissions: {
        Row: {
          id: string
          title: string
          author: string
          description: string
          cover_image_url: string | null
          category: string
          created_at: string
          slug: string | null
        }
      }
    }
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const bookSlug = url.pathname.split('/book/')[1]

    if (!bookSlug) {
      return new Response('Book not found', { status: 404 })
    }

    // Initialize Supabase client
    const supabaseUrl = 'https://kydmyxsgyxeubhmqzrgo.supabase.co'
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5ZG15eHNneXhldWJobXF6cmdvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY0ODQ3NjQsImV4cCI6MjA2MjA2MDc2NH0.b-ckDfOmmf2x__FG5Snm9px8j4pqPke5Ra1RgoGEqP0'
    
    const supabase = createClient<Database>(supabaseUrl, supabaseKey)

    // Get book details from database
    const { data: book, error } = await supabase
      .from('book_submissions')
      .select('id, title, author, description, cover_image_url, category, created_at, slug')
      .eq('status', 'approved')
      .or(`slug.eq.${bookSlug},id.eq.${bookSlug}`)
      .single() as { data: { id: string; title: string; author: string; description: string; cover_image_url: string | null; category: string; created_at: string; slug: string | null } | null; error: any }

    if (error || !book) {
      console.log('Book not found:', error)
      return new Response('Book not found', { status: 404 })
    }

    // Generate HTML with Open Graph meta tags
    const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  
  <!-- Basic Meta Tags -->
  <title>${book.title} - ${book.author} | منصة كتبي</title>
  <meta name="description" content="${book.description.substring(0, 160)}...">
  
  <!-- Open Graph Meta Tags for Social Media -->
  <meta property="og:title" content="${book.title} - ${book.author}">
  <meta property="og:description" content="${book.description.substring(0, 200)}...">
  <meta property="og:image" content="${book.cover_image_url || '/lovable-uploads/b1cd70fc-5c3b-47ac-ba45-cc3236f7c840.png'}">
  <meta property="og:url" content="${url.href}">
  <meta property="og:type" content="book">
  <meta property="og:site_name" content="منصة كتبي - المكتبة الرقمية العربية المجانية">
  <meta property="og:locale" content="ar_AR">
  
  <!-- Twitter Card Meta Tags -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${book.title} - ${book.author}">
  <meta name="twitter:description" content="${book.description.substring(0, 200)}...">
  <meta name="twitter:image" content="${book.cover_image_url || '/lovable-uploads/b1cd70fc-5c3b-47ac-ba45-cc3236f7c840.png'}">
  
  <!-- Additional Meta Tags -->
  <meta name="author" content="${book.author}">
  <meta name="keywords" content="${book.category}, كتب عربية, قراءة مجانية, ${book.author}, ${book.title}">
  
  <!-- Redirect to main app -->
  <script>
    // Redirect to the actual app after a short delay to allow crawlers to read meta tags
    setTimeout(function() {
      window.location.href = '${url.origin}/book/${book.slug || book.id}';
    }, 100);
  </script>
</head>
<body style="font-family: Arial, sans-serif; text-align: center; padding: 50px; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    <img src="${book.cover_image_url || '/lovable-uploads/b1cd70fc-5c3b-47ac-ba45-cc3236f7c840.png'}" 
         alt="غلاف كتاب ${book.title}" 
         style="max-width: 200px; height: auto; margin-bottom: 20px; border-radius: 8px;">
    <h1 style="color: #333; margin-bottom: 10px;">${book.title}</h1>
    <h2 style="color: #666; margin-bottom: 20px; font-weight: normal;">تأليف: ${book.author}</h2>
    <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">${book.description.substring(0, 300)}...</p>
    <p style="color: #888; font-size: 14px;">جاري توجيهك إلى صفحة الكتاب...</p>
  </div>
</body>
</html>`

    return new Response(html, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    })

  } catch (error) {
    console.error('Error:', error)
    return new Response('Internal Server Error', { 
      status: 500,
      headers: corsHeaders 
    })
  }
})