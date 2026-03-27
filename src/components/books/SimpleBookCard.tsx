
import React, { useState, useCallback, memo } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from '@/hooks/use-mobile';
import { AspectRatio } from "@/components/ui/aspect-ratio";
import BookImageLoader from './BookImageLoader';
import { getCategoryInArabic } from '@/utils/categoryTranslation';
import { createBookSlug } from '@/utils/bookSlug';
import { StarRating } from '@/components/ui/star-rating';
import { OptimizedStarRating } from './OptimizedStarRating';
import { DisplayOnlyIcon } from '@/components/icons/DisplayOnlyIcon';
// تم إزالة useBookReviewStats لتحسين الأداء
interface SimpleBookCardProps {
  id: string;
  title: string;
  author: string;
  cover_image?: string;
  category: string;
  optimized_cover_url?: string;
  created_at?: string;
  display_only?: boolean;
  publisher?: string;
  compact?: boolean;
  onNavigate?: (bookPath: string) => void;
  rating?: number;
  index?: number; // position in the grid for LCP priority
  bookStats?: {
    total_reviews: number;
    average_rating: number;
    rating_distribution: Record<string, number>;
  };
}

export const SimpleBookCard = memo(({ 
  id, 
  title, 
  author, 
  cover_image, 
  category,
  optimized_cover_url,
  created_at,
  display_only,
  publisher,
  onNavigate,
  compact = true,
  rating,
  index = 99,
  bookStats
}: SimpleBookCardProps) => {
  const [isHovered, setIsHovered] = useState(false);
  const isMobile = useIsMobile();

  // إنشاء slug للكتاب
  const slug = createBookSlug(title, author);
  const bookUrl = `/book/${slug}`;

  const validateCoverImage = useCallback(() => {
    // استخدام الصورة المحسّنة إذا كانت متوفرة
    if (optimized_cover_url && optimized_cover_url.trim() !== '') {
      return optimized_cover_url;
    }
    
    // إذا لم تكن هناك صورة أو كانت فارغة أو null
    if (!cover_image || cover_image === 'undefined' || cover_image === 'null' || cover_image.trim() === '') {
      return '/placeholder.svg';
    }
    
    return cover_image;
  }, [cover_image, optimized_cover_url]);

  const validCoverImage = validateCoverImage();
  const displayTitle = title || 'عنوان غير متوفر';
  const displayAuthor = author || 'مؤلف غير معروف';
  const displayCategory = getCategoryInArabic(category);

  // Check if book is new (published within last 15 days)
  const isNewBook = useCallback(() => {
    if (!created_at) return false;
    const publishedDate = new Date(created_at);
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    return publishedDate >= fifteenDaysAgo;
  }, [created_at]);

const showNewBadge = isNewBook();

const cardPadding = compact ? 'p-2' : 'p-3';
const contentSpacing = compact ? 'space-y-1.5' : 'space-y-2';
const imageMaxWidth = compact ? 'max-w-[130px]' : 'max-w-[180px]';
const imageObjectFit = compact ? 'object-contain' : 'object-cover';
const imageContainerBg = compact ? 'bg-muted' : '';
const titleFontSize = compact ? '15px' : '17px';
const authorFontSize = compact ? '13px' : '14px';

  return (
    <a href={bookUrl} className="block">
      <Card 
        className={`group relative overflow-hidden cursor-pointer bg-card text-card-foreground rounded-lg ${cardPadding} transition-all duration-200 hover:shadow-md border shadow-lg card-optimized touch-optimized`}
      >
      <CardContent className={`flex flex-col items-center p-0 ${contentSpacing}`}>
        {/* غلاف الكتاب بدون إطار */}
        <div className={`relative w-full ${imageMaxWidth}`}>
          <AspectRatio ratio={3/4.5}>
            <div className={`relative w-full h-full rounded-lg overflow-hidden shadow-xl ${imageContainerBg}`}>
              <BookImageLoader 
                src={validCoverImage}
                fallbackSrc="/placeholder.svg"
                alt={`غلاف كتاب ${displayTitle}`}
                className={`w-full h-full ${imageObjectFit}`}
                priority={index < 4}
              />
            </div>
          </AspectRatio>
          
          {/* شارة "جديد" في الزاوية العلوية اليسرى */}
          {showNewBadge && (
            <div className="absolute top-2 left-2">
              <div className="bg-primary text-primary-foreground text-xs px-2 py-1 rounded-full font-semibold shadow-md">
                جديد
              </div>
            </div>
          )}
        </div>
        
        {/* أيقونة العرض فقط أسفل الصورة مع مساحة إضافية */}
        {display_only && (
          <div className="w-full flex justify-center mt-2 mb-1">
            <DisplayOnlyIcon className="h-8 w-8 md:h-10 md:w-10" />
          </div>
        )}
        
        {/* عنوان الكتاب */}
        <h3 className="text-center text-card-foreground font-tajawal leading-tight max-w-full px-2 line-clamp-2" style={{ fontWeight: 400, fontSize: titleFontSize }} title={displayTitle}>
          {displayTitle}
        </h3>
        
        {/* اسم المؤلف */}
        <p className="text-center text-primary font-tajawal" style={{ fontWeight: 500, fontSize: authorFontSize }} title={displayAuthor}>
          {displayAuthor}
        </p>
        
        {/* اسم الناشر */}
        {publisher && (
          <p className="text-center text-muted-foreground font-tajawal text-xs" title={publisher}>
            الناشر: {publisher}
          </p>
        )}
        
        {/* نجوم التقييم */}
        <StarRatingWithData bookId={id} rating={rating} bookStats={bookStats} />
      </CardContent>
    </Card>
    </a>
  );
});

// مكون منفصل لعرض تقييم الكتاب - محسّن للأداء
const StarRatingWithData = memo(({ bookId, rating, bookStats }: { 
  bookId: string; 
  rating?: number;
  bookStats?: { total_reviews: number; average_rating: number; rating_distribution: Record<string, number>; } 
}) => {
  // استخدام البيانات المُمررة مباشرة بدلاً من استدعاء قاعدة البيانات مرة أخرى
  const finalRating = bookStats?.average_rating || rating || 0;
  const totalReviews = bookStats?.total_reviews || 0;
  
  return (
    <div className="flex justify-center">
      <StarRating
        rating={finalRating}
        totalReviews={totalReviews}
        size="sm"
        showRating={finalRating > 0}
        showReviewCount={totalReviews > 0}
        className="text-xs"
      />
    </div>
  );
});

StarRatingWithData.displayName = 'StarRatingWithData';
SimpleBookCard.displayName = 'SimpleBookCard';
