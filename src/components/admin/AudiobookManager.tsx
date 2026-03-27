import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, Headphones, Search, CheckCircle, XCircle, RefreshCw, Play, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Progress } from '@/components/ui/progress';

interface BookForAudiobook {
  id: string;
  title: string;
  author: string;
  cover_image_url: string | null;
  has_extracted_text: boolean;
  text_length: number | null;
  audiobook_status: string | null;
  audiobook_progress: number;
  audiobook_total: number;
  audiobook_error: string | null;
}

const AudiobookManager: React.FC = () => {
  const [books, setBooks] = useState<BookForAudiobook[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [processingBookId, setProcessingBookId] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchBooks = async () => {
    setLoading(true);
    try {
      const { data: approvedBooks, error } = await supabase
        .from('approved_books' as any)
        .select('id, title, author, cover_image_url')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const bookIds = (approvedBooks as any[])?.map((b: any) => b.id) || [];

      // جلب حالة استخراج النص
      const { data: extractions } = await supabase
        .from('book_extracted_text')
        .select('book_id, extraction_status, text_length')
        .in('book_id', bookIds);

      const extractionMap = new Map(
        (extractions || []).map(e => [e.book_id, e])
      );

      // جلب حالة الكتب الصوتية
      const { data: jobs } = await supabase
        .from('audiobook_jobs')
        .select('book_id, status, processed_pages, total_pages, error_message')
        .in('book_id', bookIds)
        .order('created_at', { ascending: false });

      const jobMap = new Map<string, any>();
      (jobs || []).forEach(j => {
        if (!jobMap.has(j.book_id)) jobMap.set(j.book_id, j);
      });

      const result: BookForAudiobook[] = ((approvedBooks as any[]) || []).map((book: any) => {
        const ext = extractionMap.get(book.id);
        const job = jobMap.get(book.id);
        return {
          ...book,
          has_extracted_text: ext?.extraction_status === 'completed',
          text_length: ext?.text_length || null,
          audiobook_status: job?.status || null,
          audiobook_progress: job?.processed_pages || 0,
          audiobook_total: job?.total_pages || 0,
          audiobook_error: job?.error_message || null,
        };
      });

      setBooks(result);
    } catch (err) {
      console.error('Error fetching books:', err);
      toast({ title: 'خطأ في جلب الكتب', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBooks();
  }, []);

  const generateAudiobook = async (bookId: string) => {
    setProcessingBookId(bookId);
    try {
      const { data, error } = await supabase.functions.invoke('generate-audiobook', {
        body: { bookId, action: 'start' },
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'تم إنشاء الكتاب الصوتي',
          description: `تم تحويل ${data.processedPages}/${data.totalPages} جزء بنجاح (${data.language === 'ar' ? 'عربي' : 'إنجليزي'})`,
        });
        fetchBooks();
      } else {
        throw new Error(data?.error || 'فشل في إنشاء الكتاب الصوتي');
      }
    } catch (err) {
      console.error('Audiobook generation error:', err);
      toast({
        title: 'خطأ في إنشاء الكتاب الصوتي',
        description: err instanceof Error ? err.message : 'خطأ غير متوقع',
        variant: 'destructive',
      });
    } finally {
      setProcessingBookId(null);
    }
  };

  const filteredBooks = books.filter(b =>
    b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.author.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string | null, hasText: boolean) => {
    if (!hasText) {
      return <Badge variant="outline" className="text-xs"><AlertCircle className="h-3 w-3 ml-1" />بحاجة لـ OCR</Badge>;
    }
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-xs"><CheckCircle className="h-3 w-3 ml-1" />مكتمل</Badge>;
      case 'completed_with_errors':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 text-xs"><AlertCircle className="h-3 w-3 ml-1" />مكتمل جزئياً</Badge>;
      case 'processing':
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 text-xs"><Loader2 className="h-3 w-3 ml-1 animate-spin" />قيد التحويل</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-xs"><XCircle className="h-3 w-3 ml-1" />فشل</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs"><Headphones className="h-3 w-3 ml-1" />جاهز للتحويل</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="mr-3 text-muted-foreground">جاري تحميل الكتب...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث عن كتاب..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <Button onClick={fetchBooks} variant="outline" size="sm">
          <RefreshCw className="h-4 w-4 ml-1" />
          تحديث
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredBooks.map((book) => (
          <Card key={book.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start gap-4">
                <div className="w-16 h-20 flex-shrink-0 rounded overflow-hidden bg-muted">
                  {book.cover_image_url ? (
                    <img src={book.cover_image_url} alt={book.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Headphones className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">{book.title}</h3>
                  <p className="text-xs text-muted-foreground">{book.author}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    {getStatusBadge(book.audiobook_status, book.has_extracted_text)}
                    {book.text_length && (
                      <span className="text-xs text-muted-foreground">
                        {book.text_length.toLocaleString()} حرف
                      </span>
                    )}
                  </div>
                  {book.audiobook_status === 'processing' && book.audiobook_total > 0 && (
                    <div className="mt-2">
                      <Progress value={(book.audiobook_progress / book.audiobook_total) * 100} className="h-2" />
                      <span className="text-xs text-muted-foreground">
                        {book.audiobook_progress}/{book.audiobook_total} أجزاء
                      </span>
                    </div>
                  )}
                  {book.audiobook_error && (
                    <p className="text-xs text-destructive mt-1 truncate">{book.audiobook_error}</p>
                  )}
                </div>

                <div className="flex flex-col gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    onClick={() => generateAudiobook(book.id)}
                    disabled={!book.has_extracted_text || processingBookId === book.id}
                    title={!book.has_extracted_text ? 'يجب استخراج النص أولاً (OCR)' : 'تحويل إلى كتاب صوتي'}
                  >
                    {processingBookId === book.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 ml-1" />
                    )}
                    تحويل لصوت
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredBooks.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          لا توجد كتب مطابقة للبحث
        </div>
      )}
    </div>
  );
};

export default AudiobookManager;
