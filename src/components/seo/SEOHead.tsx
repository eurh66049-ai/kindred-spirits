import { Helmet } from 'react-helmet-async';

interface SEOHeadProps {
  title?: string;
  description?: string;
  keywords?: string;
  canonical?: string;
  ogImage?: string;
  ogType?: 'website' | 'article' | 'book' | 'profile';
  structuredData?: object;
  noindex?: boolean;
  author?: string;
  publishedTime?: string;
  modifiedTime?: string;
}

export const SEOHead = ({
  title = 'منصة كتبي - المكتبة الرقمية العربية المجانية',
  description = 'اكتشف آلاف الكتب العربية المجانية في منصة كتبي. قم بقراءة وتحميل الكتب في جميع المجالات - أدب، علوم، تاريخ، فلسفة والمزيد.',
  keywords = 'كتب عربية مجانية, مكتبة رقمية, قراءة اونلاين, تحميل كتب, أدب عربي, كتب PDF',
  canonical,
  ogImage = '/lovable-uploads/b1cd70fc-5c3b-47ac-ba45-cc3236f7c840.png',
  ogType = 'website',
  structuredData,
  noindex = false,
  author,
  publishedTime,
  modifiedTime
}: SEOHeadProps) => {
  const currentUrl = canonical || (typeof window !== 'undefined' ? window.location.href : 'https://kotobi.xyz');
  const fullImageUrl = ogImage.startsWith('http') ? ogImage : `https://kotobi.xyz${ogImage}`;

  return (
    <Helmet>
      {/* Basic Meta Tags */}
      <title>{title}</title>
      <meta name="description" content={description} />
      <meta name="keywords" content={keywords} />
      {author && <meta name="author" content={author} />}
      
      {/* Canonical URL */}
      {canonical && <link rel="canonical" href={canonical} />}
      
      {/* Open Graph Meta Tags */}
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={fullImageUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:image:alt" content={title} />
      <meta property="og:url" content={currentUrl} />
      <meta property="og:type" content={ogType} />
      <meta property="og:site_name" content="منصة كتبي - المكتبة الرقمية العربية المجانية" />
      <meta property="og:locale" content="ar_AR" />
      
      {/* Twitter Card Meta Tags */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={fullImageUrl} />
      <meta name="twitter:site" content="@kotobi_app" />
      
      {/* Article specific meta tags */}
      {publishedTime && <meta property="article:published_time" content={publishedTime} />}
      {modifiedTime && <meta property="article:modified_time" content={modifiedTime} />}
      {author && <meta property="article:author" content={author} />}
      
      {/* Mobile optimization */}
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0" />
      <meta name="format-detection" content="telephone=no" />
      
      {/* Robots meta */}
      {noindex && <meta name="robots" content="noindex, nofollow" />}
      {!noindex && <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1" />}
      
      {/* Language and direction - التوجه محدد في index.html */}
      
      {/* Structured Data */}
      {structuredData && (
        <script type="application/ld+json">
          {JSON.stringify(structuredData)}
        </script>
      )}
      
      {/* Favicon and Apple Touch Icons */}
      <link rel="icon" href="/favicon.png" type="image/png" />
      <link rel="apple-touch-icon" sizes="180x180" href="/favicon.png" />
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon.png" />
      <link rel="icon" type="image/png" sizes="16x16" href="/favicon.png" />
      
      {/* Theme color for mobile browsers */}
      <meta name="theme-color" content="#2563eb" />
      <meta name="msapplication-TileColor" content="#2563eb" />
      
      {/* Performance hints */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://kydmyxsgyxeubhmqzrgo.supabase.co" />
      <link rel="dns-prefetch" href="//fonts.gstatic.com" />
    </Helmet>
  );
};