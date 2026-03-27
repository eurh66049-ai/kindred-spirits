import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';

interface BookImageLoaderProps {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  onLoad?: () => void;
  onError?: () => void;
  priority?: boolean;
  fallbackSrc?: string;
  maxRetries?: number;
  hideRetryButton?: boolean;
  immediateLoad?: boolean;
  optimizedSrc?: string;
  preload?: boolean;
}

// Simplified - no complex queue needed, browser handles concurrent loads

// تحسين رابط Supabase - استخدام الرابط المباشر بدون تحويل
const getDirectImageUrl = (url: string): string => {
  if (!url || url === '/placeholder.svg') return url;
  return url;
};

const BookImageLoader: React.FC<BookImageLoaderProps> = ({ 
  src, 
  alt, 
  className = '',
  style,
  onLoad,
  onError,
  priority = false,
  fallbackSrc = '/placeholder.svg',
  maxRetries = 1,
  hideRetryButton = false,
  immediateLoad = true,
  optimizedSrc,
  preload = false
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [shouldLoad, setShouldLoad] = useState(priority || immediateLoad);

  // تحسين مصدر الصورة
  const processedSrc = useMemo(() => {
    const imageSource = optimizedSrc || src;
    
    if (!imageSource || imageSource === 'undefined' || imageSource === 'null' || imageSource.trim() === '') {
      return fallbackSrc;
    }
    
    // archive.org
    if (imageSource.includes('archive.org') && imageSource.includes('BookReader')) {
      return imageSource.includes('scale=') ? imageSource.replace(/scale=\d+/, 'scale=2') : imageSource;
    }
    
    // رفض روابط archive.org التالفة
    if (imageSource.includes('archive.org') && !imageSource.includes('BookReader') && !imageSource.includes('/download/')) {
      return fallbackSrc;
    }
    
    return getDirectImageUrl(imageSource);
  }, [src, optimizedSrc, fallbackSrc]);

  // Intersection Observer للتحميل الكسول
  useEffect(() => {
    if (priority || shouldLoad) return;
    
    observerRef.current = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setShouldLoad(true);
          observerRef.current?.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    
    if (imgRef.current?.parentElement) {
      observerRef.current.observe(imgRef.current.parentElement);
    }
    
    return () => observerRef.current?.disconnect();
  }, [priority, shouldLoad]);

  // No preload needed - browser handles priority via fetchpriority

  const handleImageLoad = useCallback(() => {
    setIsLoaded(true);
    setIsError(false);
    onLoad?.();
  }, [onLoad]);

  const handleImageError = useCallback((event: React.SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    
    if (retryCount < maxRetries && img.src !== fallbackSrc) {
      setRetryCount(prev => prev + 1);
      img.src = fallbackSrc;
      return;
    }
    
    setIsError(true);
    onError?.();
  }, [retryCount, maxRetries, fallbackSrc, onError]);

  return (
    <div className={`relative w-full h-full ${className}`} style={style}>
      <img
        ref={imgRef}
        src={shouldLoad ? processedSrc : undefined}
        data-src={processedSrc}
        alt={alt}
        width={200}
        height={267}
        className={`w-full h-full object-cover transition-opacity duration-200 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={handleImageLoad}
        onError={handleImageError}
        loading={priority ? 'eager' : 'lazy'}
        decoding={priority ? 'sync' : 'async'}
        // @ts-ignore - React 18 doesn't support fetchPriority natively
        fetchpriority={priority ? 'high' : 'low'}
      />
      
      {!isLoaded && !isError && (
        <div className="absolute inset-0 bg-muted/30 animate-pulse rounded-md" />
      )}
      
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted text-muted-foreground text-xs p-2 rounded-md">
          <div className="text-center">
            <div className="text-lg mb-1">📚</div>
            <div>غلاف الكتاب</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookImageLoader;
