import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { 
  ArrowRight, 
  BookOpen, 
  Home, 
  ZoomIn, 
  ZoomOut,
  Download,
  Settings,
  Moon,
  Sun,
  Maximize,
  RotateCcw
} from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { toast } from 'sonner';
import { useBookDetails } from '@/hooks/useBookDetails';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { throttle, calculateVisiblePage } from '@/utils/scrollUtils';
import PDFMemoryManager from '@/utils/pdfMemoryManager';
import * as pdfjsLib from 'pdfjs-dist';
import { saveReadingProgress, getBookReadingProgress } from '@/utils/readingProgressUtils';
import BookReaderAssistant from './BookReaderAssistant';
import { useReaderFingerprint } from '@/hooks/useReaderFingerprint';
import ReaderHints from './ReaderHints';
import PageJumpDialog from './PageJumpDialog';
import ReaderChatPanel from './ReaderChatPanel';

// تعيين مسار العامل
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;

const PDFJSReader = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { book, loading, error } = useBookDetails(id!);
  const { user } = useAuth();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const memoryManager = useRef(PDFMemoryManager.getInstance());
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(() => {
    // تحديد المقياس الأولي بناء على دقة الشاشة
    const devicePixelRatio = window.devicePixelRatio || 1;
    const screenWidth = window.screen.width;
    
    // للشاشات عالية الدقة أو كبيرة الحجم
    if (devicePixelRatio >= 2 || screenWidth >= 1920) {
      return 1.8; // جودة عالية للشاشات الكبيرة
    } else if (screenWidth >= 1366) {
      return 1.5; // جودة متوسطة-عالية
    } else {
      return 1.2; // الجودة القياسية للشاشات الصغيرة
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [renderedPages, setRenderedPages] = useState<{ [key: number]: HTMLCanvasElement }>({});
  const [showControls, setShowControls] = useState(false);
  const [currentVisiblePage, setCurrentVisiblePage] = useState(1);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [pdfDarkMode, setPdfDarkMode] = useState(false);
  const [scrollLocked, setScrollLocked] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [savedPage, setSavedPage] = useState<number | null>(null);
  const hasScrolledToSavedPage = useRef(false);
  const isScrollingRef = useRef(false);
  const lastScrollTimeRef = useRef(0);
  const targetPageRef = useRef(1);
  const isInitialNavigationRef = useRef(false);
  const [pdfTextContent, setPdfTextContent] = useState<string>('');

  // بصمة القارئ - تتبع سلوك القراءة المجهول
  const { hints: readerHints, handleScroll: fingerprintHandleScroll, handleInteraction } = useReaderFingerprint({
    bookId: book?.id || '',
    currentPage: currentVisiblePage,
    enabled: !!book?.id && !isLoading
  });

  // كاش خفيف لنص الصفحات عند الطلب (لمنع إعادة استخراج نفس الصفحة)
  const pageTextCacheRef = useRef<Map<number, string>>(new Map());

  // تنظيف/تطبيع نص PDF (خصوصاً العربية) لتقليل المشاكل مثل: "ح س ا م" أو مسافات/رموز غريبة
  const normalizeExtractedPdfText = (input: string) => {
    const base = (input ?? '')
      .replace(/\r/g, '')
      .replace(/[\u0000-\u001f]/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // دمج تسلسل أحرف عربية متباعدة بمسافات: (ح س ا م) => (حسام)
    const collapsed = base.replace(
      /(?:[\u0600-\u06FF]\s){2,}[\u0600-\u06FF]/g,
      (m) => m.replace(/\s+/g, '')
    );

    return collapsed.replace(/[ \t]+/g, ' ').trim();
  };

  const extractTextFromTextContent = (textContent: any) => {
    const items = (textContent?.items || []) as any[];
    let raw = '';

    for (const item of items) {
      const s = (item?.str ?? '').toString();
      if (!s) continue;
      raw += s;
      raw += item?.hasEOL ? '\n' : ' ';
    }

    return normalizeExtractedPdfText(raw);
  };

  // استخراج نص صفحات محددة عند الطلب (مفيد لسؤال: ماذا يوجد في صفحة X)
  const getPagesText = useCallback(
    async (pages: number[]) => {
      if (!pdfDoc) return '';

      const max = pdfDoc.numPages || Number.POSITIVE_INFINITY;
      const uniquePages = Array.from(new Set(pages))
        .map((p) => Math.trunc(p))
        .filter((p) => p >= 1 && p <= max);

      let out = '';

      for (const pageNumber of uniquePages) {
        const cached = pageTextCacheRef.current.get(pageNumber);
        if (typeof cached === 'string') {
          out += `\n--- صفحة ${pageNumber} ---\n${cached}`;
          continue;
        }

        try {
          const page = await pdfDoc.getPage(pageNumber);
          const textContent = await page.getTextContent({ normalizeWhitespace: true });
          const pageText = extractTextFromTextContent(textContent);

          pageTextCacheRef.current.set(pageNumber, pageText);
          out += `\n--- صفحة ${pageNumber} ---\n${pageText}`;

          try {
            page.cleanup?.();
          } catch {
            // ignore
          }
        } catch (err) {
          console.warn(`⚠️ تعذر استخراج نص الصفحة ${pageNumber} عند الطلب`, err);
          pageTextCacheRef.current.set(pageNumber, '');
          out += `\n--- صفحة ${pageNumber} ---\n`;
        }
      }

      return out;
    },
    [pdfDoc]
  );

  // جلب التقدم المحفوظ من قاعدة البيانات أو localStorage
  useEffect(() => {
    const fetchSavedProgress = async () => {
      if (!book?.id) return;

      let page: number | null = null;

      // أولوية لبيانات السحابة للمستخدم المسجّل
      if (user) {
        try {
          const { data, error } = await supabase
            .from('reading_history')
            .select('current_page')
            .eq('user_id', user.id)
            .eq('book_id', book.id)
            .single();

          if (!error && data) {
            console.log('تم جلب التقدم المحفوظ من Supabase - الصفحة:', data.current_page);
            page = data.current_page;
          }
        } catch (err) {
          console.log('لا يوجد تقدم محفوظ في Supabase لهذا الكتاب');
        }
      }

      // في حال عدم وجود تقدم في السحابة، نستخدم localStorage
      if (!page) {
        const localProgress = getBookReadingProgress(book.id);
        if (localProgress?.currentPage && localProgress.currentPage > 1) {
          console.log('تم جلب التقدم المحفوظ من localStorage - الصفحة:', localProgress.currentPage);
          page = localProgress.currentPage;
        }
      }

      if (page && page > 1) {
        setSavedPage(page);
      }
    };

    fetchSavedProgress();
  }, [user, book?.id]);

  useEffect(() => {
    if (book?.book_file_url) {
      loadPDF(book.book_file_url);
    }
  }, [book?.book_file_url]);

  useEffect(() => {
    if (pdfDoc && totalPages > 0) {
      // رسم الصفحات الأولى فقط عند التحميل
      renderInitialPages();
    }
  }, [pdfDoc, totalPages]);

  // الانتقال إلى الصفحة المحفوظة بعد رسم الصفحات
  useEffect(() => {
    if (pdfDoc && totalPages > 0 && savedPage && savedPage > 1 && !hasScrolledToSavedPage.current && containerRef.current) {
      // تحميل الصفحة المحفوظة والصفحات المجاورة أولاً
      const loadSavedPageAndScroll = async () => {
        console.log(`🔄 تحميل الصفحة المحفوظة ${savedPage} والصفحات المجاورة...`);
        
        // تفعيل علامة الانتقال الأولي لتعطيل نظام منع السحب السريع
        isInitialNavigationRef.current = true;
        
        // تحديد الصفحات التي يجب تحميلها
        const pagesToLoad = [savedPage];
        if (savedPage > 1) pagesToLoad.push(savedPage - 1);
        if (savedPage < totalPages) pagesToLoad.push(savedPage + 1);
        
        // تحميل كل الصفحات المطلوبة
        await Promise.all(pagesToLoad.map(pageNum => renderSinglePage(pageNum)));
        
        // الانتظار قليلاً للتأكد من اكتمال الرسم
        setTimeout(() => {
          const pageElement = containerRef.current?.querySelector(`.pdf-page:nth-child(${savedPage})`) as HTMLElement;
          if (pageElement) {
            // تحديث الصفحة المرئية قبل التمرير
            setCurrentVisiblePage(savedPage);
            targetPageRef.current = savedPage;
            
            pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            hasScrolledToSavedPage.current = true;
            toast.success(`تم العودة إلى الصفحة ${savedPage}`);
            console.log(`✅ تم الانتقال إلى الصفحة المحفوظة ${savedPage}`);
            
            // تعطيل علامة الانتقال الأولي بعد اكتمال التمرير
            setTimeout(() => {
              isInitialNavigationRef.current = false;
            }, 1000);
          } else {
            console.error(`❌ فشل في العثور على عنصر الصفحة ${savedPage}`);
            isInitialNavigationRef.current = false;
          }
        }, 300);
      };
      
      loadSavedPageAndScroll();
    }
  }, [pdfDoc, totalPages, savedPage]);

  // إعادة رسم الصفحات المرئية عند تغيير المقياس
  useEffect(() => {
    if (pdfDoc && scale) {
      rerenderVisiblePages();
    }
  }, [scale]);

  // حفظ تقدم القراءة تلقائياً
  useEffect(() => {
    if (book && currentVisiblePage && totalPages > 0) {
      const saveProgressDebounced = setTimeout(() => {
        saveReadingProgress(
          book.id,
          currentVisiblePage,
          totalPages,
          book.title,
          book.author,
          book.cover_image_url
        );
      }, 2000); // حفظ بعد 2 ثانية من التوقف

      return () => clearTimeout(saveProgressDebounced);
    }
  }, [currentVisiblePage, book, totalPages]);

  const loadPDF = async (url: string) => {
    try {
      setIsLoading(true);
      setLoadingProgress(15);
      console.log('تحميل PDF من:', url);
      
      const loadingTask = pdfjsLib.getDocument(url);
      
      // تحديث شريط التقدم أثناء التحميل - تحسين السرعة
      loadingTask.onProgress = (progress: any) => {
        if (progress.total && progress.loaded) {
          // تحسين حساب النسبة المئوية لجعلها أسرع
          const basePercent = (progress.loaded / progress.total) * 85; // 0-85%
          const finalPercent = Math.min(Math.max(basePercent + 15, 15), 100); // 15-100%
          setLoadingProgress(Math.round(finalPercent));
          
          console.log('📈 تقدم التحميل:', {
            loaded: progress.loaded,
            total: progress.total,
            percent: Math.round(finalPercent)
          });
        } else {
          // إذا لم تكن هناك معلومات دقيقة، استخدم تقدم تقريبي سريع
          setLoadingProgress(prev => Math.min(prev + 5, 90));
        }
      };
      
      const pdf = await loadingTask.promise;
      setLoadingProgress(95);
      
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      console.log('تم تحميل PDF بنجاح - عدد الصفحات:', pdf.numPages);
      
      // استخراج نص PDF للمساعد الذكي (أول 20 صفحة)
      extractPdfText(pdf);
      
      setLoadingProgress(100);
      toast.success('تم تحميل الكتاب بنجاح');
    } catch (error) {
      console.error('خطأ في تحميل PDF:', error);
      toast.error('فشل في تحميل الكتاب');
      setLoadingProgress(0);
    } finally {
      setTimeout(() => setIsLoading(false), 200); // تقليل وقت التأخير لسرعة أكبر
    }
  };

  // استخراج نص PDF للمساعد الذكي - جميع الصفحات (مع تحمل أخطاء الصفحات الفردية)
  const extractPdfText = async (pdf: any) => {
    let fullText = '';

    try {
      const totalPdfPages = pdf.numPages;
      console.log(`📖 بدء استخراج نص جميع صفحات PDF (${totalPdfPages} صفحة)...`);

      for (let i = 1; i <= totalPdfPages; i++) {
        try {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent({ normalizeWhitespace: true });
          const pageText = extractTextFromTextContent(textContent);

          // نخزن في الكاش أيضاً لتسريع الأسئلة اللاحقة عن نفس الصفحة
          pageTextCacheRef.current.set(i, pageText);

          fullText += `\n--- صفحة ${i} ---\n${pageText}`;

          // بعض نسخ pdfjs توفر cleanup لتخفيف الذاكرة
          try {
            page.cleanup?.();
          } catch {
            // ignore
          }
        } catch (pageError) {
          console.warn(`⚠️ تعذر استخراج نص الصفحة ${i}، سيتم تجاوزها`, pageError);
          pageTextCacheRef.current.set(i, '');
          fullText += `\n--- صفحة ${i} ---\n`;
        }
      }

      console.log(`✅ تم استخراج نص صفحات PDF (${totalPdfPages} صفحة) - الطول: ${fullText.length} حرف`);
    } catch (error) {
      console.error('خطأ في استخراج نص PDF:', error);
    } finally {
      // حتى لو حصلت أخطاء في بعض الصفحات، نحفظ ما تم استخراجه
      if (fullText) setPdfTextContent(fullText);
    }
  };

  const renderPage = async (pageNumber: number): Promise<HTMLCanvasElement | null> => {
    if (!pdfDoc) return null;

    try {
      const page = await pdfDoc.getPage(pageNumber);
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');

      // حساب المقياس مع مراعاة دقة الجهاز لأفضل جودة
      const devicePixelRatio = window.devicePixelRatio || 1;
      const displayScale = scale * devicePixelRatio;
      
      const viewport = page.getViewport({ scale: displayScale });
      
      // ضبط حجم الكانفاس للدقة العالية
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // ضبط CSS size لعرض صحيح
      canvas.style.height = `${viewport.height / devicePixelRatio}px`;
      canvas.style.width = `${viewport.width / devicePixelRatio}px`;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
        // تحسين جودة الرسم
        enableWebGL: true,
        renderInteractiveForms: false, // تحسين الأداء
        optionalContentConfigPromise: null // تحسين الأداء
      };

      await page.render(renderContext).promise;
      
      // تحسين جودة الصورة
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      
      return canvas;
    } catch (error) {
      console.error('خطأ في رسم الصفحة:', error);
      return null;
    }
  };

  // نظام تحميل 5 صفحات - Chunk Loading
  const CHUNK_SIZE = 5;
  const loadedChunksRef = useRef<Set<number>>(new Set());
  
  // تحميل مجموعة من الصفحات (chunk)
  const loadChunk = async (chunkIndex: number) => {
    if (!pdfDoc || loadedChunksRef.current.has(chunkIndex)) return;
    
    loadedChunksRef.current.add(chunkIndex);
    
    const startPage = chunkIndex * CHUNK_SIZE + 1;
    const endPage = Math.min(startPage + CHUNK_SIZE - 1, totalPages);
    
    console.log(`📦 تحميل المجموعة ${chunkIndex}: الصفحات ${startPage} - ${endPage}`);
    
    const loadedPages: { [key: number]: HTMLCanvasElement } = {};
    
    for (let i = startPage; i <= endPage; i++) {
      const canvas = await renderPage(i);
      if (canvas) {
        loadedPages[i] = canvas;
        console.log(`تم تحميل الصفحة ${i}`);
      }
    }
    
    setRenderedPages(prev => ({ ...prev, ...loadedPages }));
    console.log(`✅ تم تحميل المجموعة ${chunkIndex} بنجاح`);
  };
  
  const renderInitialPages = async () => {
    if (!pdfDoc || totalPages === 0) return;
    console.log(`بدء تحميل أول ${Math.min(CHUNK_SIZE, totalPages)} صفحة...`);
    
    // تحميل المجموعة الأولى فقط (5 صفحات)
    await loadChunk(0);
  };

  // رسم صفحة واحدة بشكل منفصل مع استخدام مدير الذاكرة
  const renderSinglePage = async (pageNumber: number) => {
    if (!pdfDoc || !id) return;

    // التحقق من وجود الصفحة في مدير الذاكرة أولاً
    const existingCanvas = memoryManager.current.getPage(id, pageNumber);
    if (existingCanvas) {
      setRenderedPages(prev => ({
        ...prev,
        [pageNumber]: existingCanvas
      }));
      console.log(`تم استرجاع الصفحة ${pageNumber} من الذاكرة`);
      return;
    }

    // رسم الصفحة إذا لم تكن موجودة
    const canvas = await renderPage(pageNumber);
    if (canvas) {
      // حفظ في مدير الذاكرة
      memoryManager.current.addPage(id, pageNumber, canvas);
      
      setRenderedPages(prev => ({
        ...prev,
        [pageNumber]: canvas
      }));
      console.log(`تم رسم وحفظ الصفحة ${pageNumber}`);
    }
  };

  // إعادة رسم الصفحة الحالية عند تغيير المقياس
  const rerenderVisiblePages = async () => {
    if (!pdfDoc || !currentVisiblePage) return;
    
    // إعادة رسم الصفحة الحالية فقط
    const canvas = await renderPage(currentVisiblePage);
    if (canvas) {
      setRenderedPages(prev => ({
        ...prev,
        [currentVisiblePage]: canvas
      }));
    }
  };

  const zoomIn = () => {
    setScale(prev => Math.min(prev + 0.3, 4)); // زيادة المدى للحصول على جودة أفضل
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev - 0.3, 0.8)); // زيادة الحد الأدنى
  };

  const resetZoom = () => {
    // إعادة تعيين للمقياس الأولي المحسن
    const devicePixelRatio = window.devicePixelRatio || 1;
    const screenWidth = window.screen.width;
    
    if (devicePixelRatio >= 2 || screenWidth >= 1920) {
      setScale(1.8);
    } else if (screenWidth >= 1366) {
      setScale(1.5);
    } else {
      setScale(1.2);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  const downloadPDF = () => {
    if (book?.book_file_url) {
      const link = document.createElement('a');
      link.href = book.book_file_url;
      // إضافة اسم المنصة داخل اسم الملف المحمّل
      link.download = `${book.title} - kotobi.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('تم بدء تحميل الكتاب');
    }
  };

  // الانتقال للصفحة التالية
  const goToNextPage = () => {
    if (isScrollingRef.current || currentVisiblePage >= totalPages) return;
    
    isScrollingRef.current = true;
    const nextPage = currentVisiblePage + 1;
    targetPageRef.current = nextPage;
    
    const pageElement = containerRef.current?.querySelector(`.pdf-page:nth-child(${nextPage})`) as HTMLElement;
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 600);
    } else {
      isScrollingRef.current = false;
    }
  };

  // الانتقال للصفحة السابقة
  const goToPrevPage = () => {
    if (isScrollingRef.current || currentVisiblePage <= 1) return;
    
    isScrollingRef.current = true;
    const prevPage = currentVisiblePage - 1;
    targetPageRef.current = prevPage;
    
    const pageElement = containerRef.current?.querySelector(`.pdf-page:nth-child(${prevPage})`) as HTMLElement;
    if (pageElement) {
      pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => {
        isScrollingRef.current = false;
      }, 600);
    } else {
      isScrollingRef.current = false;
    }
  };

  // الانتقال المباشر لصفحة معينة
  const jumpToPage = async (pageNumber: number) => {
    if (!pdfDoc || !containerRef.current || pageNumber < 1 || pageNumber > totalPages) return;
    
    isScrollingRef.current = true;
    isInitialNavigationRef.current = true;
    targetPageRef.current = pageNumber;
    
    // تحميل الصفحة المطلوبة والصفحات المجاورة
    const pagesToLoad = [pageNumber];
    if (pageNumber > 1) pagesToLoad.push(pageNumber - 1);
    if (pageNumber < totalPages) pagesToLoad.push(pageNumber + 1);
    
    // التأكد من تحميل الـ chunk المطلوب
    const chunkIndex = Math.floor((pageNumber - 1) / CHUNK_SIZE);
    if (!loadedChunksRef.current.has(chunkIndex)) {
      await loadChunk(chunkIndex);
    }
    
    // تحميل الصفحات المحددة
    await Promise.all(pagesToLoad.map(p => renderSinglePage(p)));
    
    // الانتقال للصفحة
    setTimeout(() => {
      const pageElement = containerRef.current?.querySelector(`.pdf-page:nth-child(${pageNumber})`) as HTMLElement;
      if (pageElement) {
        setCurrentVisiblePage(pageNumber);
        pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast.success(`تم الانتقال إلى الصفحة ${pageNumber}`);
      }
      
      setTimeout(() => {
        isScrollingRef.current = false;
        isInitialNavigationRef.current = false;
      }, 800);
    }, 200);
  };

  // معالج التمرير المحسن - نظام Buffer 10 صفحات
  const handleScroll = useCallback(
    throttle(() => {
      if (!containerRef.current || !pdfDoc) return;
      
      // تعطيل أثناء الانتقال الأولي
      if (isInitialNavigationRef.current) {
        return;
      }

      const container = containerRef.current;
      const pageElements = container.querySelectorAll('.pdf-page');
      
      // حساب التقدم
      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const maxScroll = scrollHeight - clientHeight;
      
      let progress = 0;
      if (maxScroll > 0) {
        progress = Math.min(Math.max((scrollTop / maxScroll) * 100, 0), 100);
      }
      setScrollProgress(progress);
      
      // حساب الصفحة المرئية بدقة
      let detectedPage = 1;
      const containerRect = container.getBoundingClientRect();
      const centerY = containerRect.top + containerRect.height / 2;
      
      pageElements.forEach((element, index) => {
        const rect = element.getBoundingClientRect();
        if (rect.top <= centerY && rect.bottom >= centerY) {
          detectedPage = index + 1;
        }
      });
      
      // منع تخطي أكثر من صفحة واحدة - هذا هو الحل الرئيسي
      let visiblePage = detectedPage;
      const pageDiff = Math.abs(detectedPage - currentVisiblePage);
      
      if (pageDiff > 1) {
        // إذا حاول المتصفح القفز أكثر من صفحة، اذهب للصفحة التالية/السابقة فقط
        if (detectedPage > currentVisiblePage) {
          visiblePage = currentVisiblePage + 1;
        } else {
          visiblePage = currentVisiblePage - 1;
        }
        
        // إعادة التمركز على الصفحة الصحيحة
        const correctedPageElement = container.querySelector(
          `.pdf-page:nth-child(${visiblePage})`
        ) as HTMLElement | null;
        if (correctedPageElement) {
          correctedPageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
      
      // تحديث الصفحة الحالية
      if (visiblePage !== currentVisiblePage) {
        setCurrentVisiblePage(visiblePage);
        targetPageRef.current = visiblePage;
        
        // نظام Chunk: تحميل 5 صفحات عند الوصول لنهاية المجموعة الحالية
        // حساب المجموعة الحالية والتالية
        const currentChunk = Math.floor((visiblePage - 1) / CHUNK_SIZE);
        const nextChunk = currentChunk + 1;
        const prevChunk = currentChunk - 1;
        
        // تحميل المجموعة التالية إذا وصلنا لآخر صفحة من المجموعة الحالية
        const positionInChunk = (visiblePage - 1) % CHUNK_SIZE;
        const isLastPageInChunk = positionInChunk === CHUNK_SIZE - 1;
        const isSecondToLastPage = positionInChunk === CHUNK_SIZE - 2;
        
        // تحميل المجموعة التالية مبكراً (عند الوصول لآخر صفحتين في المجموعة)
        if ((isLastPageInChunk || isSecondToLastPage) && !loadedChunksRef.current.has(nextChunk)) {
          const nextChunkStart = nextChunk * CHUNK_SIZE + 1;
          if (nextChunkStart <= totalPages) {
            loadChunk(nextChunk);
          }
        }
        
        // تحميل المجموعة السابقة عند التمرير للخلف
        if (positionInChunk <= 1 && prevChunk >= 0 && !loadedChunksRef.current.has(prevChunk)) {
          loadChunk(prevChunk);
        }
      }
      
      // التأكد من أن الصفحة الحالية محملة
      if (!renderedPages[visiblePage]) {
        const chunkToLoad = Math.floor((visiblePage - 1) / CHUNK_SIZE);
        if (!loadedChunksRef.current.has(chunkToLoad)) {
          loadChunk(chunkToLoad);
        }
      }
      
    }, 150),
    [pdfDoc, renderedPages, totalPages, id, currentVisiblePage]
  );


  // إعداد مستمع التمرير مع منع الارتجاف
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll, { passive: true });
      return () => {
        container.removeEventListener('scroll', handleScroll);
      };
    }
  }, [handleScroll]);

  // تنظيف الذاكرة عند إغلاق المكون (بدون PageScrollController لتجنب التعارض)
  useEffect(() => {
    return () => {
      if (id) {
        memoryManager.current.clearDocument(id);
        console.log(`تم تنظيف مدير الذاكرة للمستند ${id}`);
      }
      // تنظيف timeout التمرير
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-foreground font-cairo">جاري تحميل الكتاب...</p>
        </div>
      </div>
    );
  }

  if (error || !book) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2 font-amiri text-foreground">الكتاب غير متوفر</h2>
          <p className="mb-4 font-cairo text-muted-foreground">{error || 'لم يتم العثور على الكتاب المطلوب'}</p>
          <Button onClick={() => navigate('/')} variant="outline">
            <Home className="ml-2 h-4 w-4" />
            العودة للصفحة الرئيسية
          </Button>
        </div>
      </div>
    );
  }

  if (!book.book_file_url) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-2xl font-bold mb-2 font-amiri text-foreground">ملف الكتاب غير متوفر</h2>
          <p className="mb-4 font-cairo text-muted-foreground">عذراً، ملف هذا الكتاب غير متوفر للقراءة حالياً</p>
          <Button onClick={() => navigate(`/book/${id}`)} variant="outline">
            العودة إلى تفاصيل الكتاب
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 dark:bg-background relative flex items-center justify-center p-2 sm:p-4">
      {/* حاوية الكتاب بتصميم Zen-mode - حواف دائرية وظل مرتفع */}
      <div 
        ref={containerRef}
        className="w-full max-w-4xl h-[calc(100vh-1rem)] sm:h-[calc(100vh-2rem)] bg-background rounded-2xl shadow-xl overflow-y-auto overflow-x-hidden snap-y snap-mandatory [&::-webkit-scrollbar]:hidden scrollbar-none border border-border/50"
        style={{ 
          scrollbarWidth: 'none',
          scrollBehavior: 'smooth',
          msOverflowStyle: 'none',
          scrollSnapType: 'y mandatory',
          scrollSnapStop: 'always',
          overscrollBehavior: 'contain'
        }}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => setShowControls(false)}
        onScroll={fingerprintHandleScroll}
        onClick={handleInteraction}
        onTouchStart={() => {
          handleInteraction();
          if (!isScrollingRef.current) {
            lastScrollTimeRef.current = Date.now();
          }
        }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center h-screen bg-background">
            <div className="text-center max-w-md w-full px-6">
              <div className="mb-8">
                <div className="w-16 h-16 mx-auto mb-4 relative">
                  <div className="absolute inset-0 rounded-full border-4 border-muted"></div>
                  <div 
                    className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"
                  ></div>
                </div>
                <h3 className="text-xl font-bold text-foreground font-amiri mb-2">
                  جاري تحميل الكتاب
                </h3>
                <p className="text-muted-foreground font-cairo text-sm mb-6">
                  يرجى الانتظار قليلاً...
                </p>
              </div>
              
              {/* شريط التقدم مع العداد المئوي */}
              <div className="w-full bg-muted rounded-full h-2 mb-4">
                <div 
                  className="bg-primary h-2 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${loadingProgress}%` }}
                ></div>
              </div>
              
              {/* نسبة التقدم */}
              <div className="text-sm text-muted-foreground font-cairo">
                {loadingProgress}%
              </div>
            </div>
          </div>
        ) : pdfDoc && totalPages > 0 && Object.keys(renderedPages).length === 0 ? (
          <div className="flex items-center justify-center h-screen">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-foreground font-cairo text-lg">جاري تجهيز صفحات الكتاب...</p>
            </div>
          </div>
        ) : !pdfDoc && Object.keys(renderedPages).length === 0 ? (
          <div className="flex items-center justify-center h-screen">
            <div className="text-center">
              <BookOpen className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <p className="text-foreground font-cairo">فشل في تحميل صفحات الكتاب</p>
              <Button onClick={() => window.location.reload()} className="mt-4">
                إعادة المحاولة
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {/* عرض الصفحات - كل صفحة تملأ الشاشة بالكامل */}
            {Array.from({ length: totalPages }, (_, index) => {
              const pageNumber = index + 1;
              const canvas = renderedPages[pageNumber];
              
              return (
                <div 
                  key={pageNumber}
                  className="pdf-page w-full snap-start snap-always flex items-center justify-center"
                  style={{ 
                    height: 'calc(100vh - 2rem)',
                    minHeight: 'calc(100vh - 2rem)',
                    overflow: 'hidden',
                    position: 'relative',
                    scrollSnapAlign: 'start',
                    scrollSnapStop: 'always'
                  }}
                >
                  <div className="w-full h-full flex justify-center items-center p-2 sm:p-4">
                    {canvas ? (
                      <canvas
                        key={`canvas-${pageNumber}`}
                        ref={(canvasElement) => {
                          if (canvasElement && canvas) {
                            if (canvasElement.width !== canvas.width || canvasElement.height !== canvas.height) {
                              canvasElement.width = canvas.width;
                              canvasElement.height = canvas.height;
                              const ctx = canvasElement.getContext('2d');
                              if (ctx) {
                                ctx.clearRect(0, 0, canvas.width, canvas.height);
                                ctx.drawImage(canvas, 0, 0);
                                
                                // حساب الأبعاد لملء الحاوية الدائرية
                                const containerHeight = window.innerHeight - 80;
                                const containerWidth = Math.min(window.innerWidth - 32, 896);
                                
                                const canvasAspectRatio = canvas.width / canvas.height;
                                const containerAspectRatio = containerWidth / containerHeight;
                                
                                let finalWidth, finalHeight;
                                
                                if (canvasAspectRatio > containerAspectRatio) {
                                  finalWidth = Math.min(containerWidth, canvas.width / window.devicePixelRatio);
                                  finalHeight = finalWidth / canvasAspectRatio;
                                } else {
                                  finalHeight = Math.min(containerHeight, canvas.height / window.devicePixelRatio);
                                  finalWidth = finalHeight * canvasAspectRatio;
                                }
                                
                                canvasElement.style.width = `${finalWidth}px`;
                                canvasElement.style.height = `${finalHeight}px`;
                              }
                            }
                          }
                        }}
                        className="rounded-xl"
                        style={{ 
                          maxWidth: '100%',
                          maxHeight: '100%',
                          width: 'auto',
                          height: 'auto',
                          objectFit: 'contain',
                          filter: pdfDarkMode ? 'invert(1) hue-rotate(180deg)' : 'none',
                          backgroundColor: pdfDarkMode ? '#1a1a1a' : 'white',
                          display: 'block',
                          margin: '0 auto'
                        }}
                      />
                    ) : (
                      <div className="w-full h-64 bg-muted/50 flex items-center justify-center rounded-xl">
                        <div className="text-center text-muted-foreground">
                          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mx-auto mb-3"></div>
                          <p className="text-sm font-cairo">جاري تحميل الصفحة {pageNumber}...</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>




      {/* شريط التحكم العائم - تصميم Zen مدمج */}
      {totalPages > 0 && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-background/90 backdrop-blur-md rounded-full shadow-lg border border-border/50 px-4 py-2 flex items-center gap-3">
            {/* زر الانتقال السريع للصفحة */}
            <PageJumpDialog
              currentPage={currentVisiblePage}
              totalPages={totalPages}
              onJumpToPage={jumpToPage}
            />
            
            {/* خط فاصل */}
            <div className="w-px h-5 bg-border/50" />

            {/* تبديل الوضع المظلم للـ PDF */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPdfDarkMode(!pdfDarkMode)}
              className="h-8 w-8 p-0 rounded-full hover:bg-accent"
            >
              {pdfDarkMode ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>

            {/* ملء الشاشة */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
              className="h-8 w-8 p-0 rounded-full hover:bg-accent"
            >
              <Maximize className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* مساعد القراءة الذكي */}
      {book && !isLoading && (
        <BookReaderAssistant
          bookTitle={book.title}
          bookAuthor={book.author}
          pdfTextContent={pdfTextContent}
          // نعتمد على page_count من Supabase إن وُجد (لأنه أدق عند وجود مشاكل في ملف PDF)
          totalPages={book.page_count ?? totalPages}
          currentPage={currentVisiblePage}
          getPagesText={getPagesText}
        />
      )}

      {/* تلميحات بصمة القارئ */}
      <ReaderHints 
        hints={readerHints}
        currentPage={currentVisiblePage}
      />

      {/* لوحة الدردشة أثناء القراءة */}
      <ReaderChatPanel bookId={book?.id} currentPage={currentVisiblePage} />
    </div>
  );
};

export default PDFJSReader;