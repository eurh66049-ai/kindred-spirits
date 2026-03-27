import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, FileText, Search, CheckCircle, XCircle, RefreshCw, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';

interface BookWithExtraction {
  id: string;
  title: string;
  author: string;
  cover_image_url: string | null;
  book_file_url: string | null;
  extraction_status: string | null;
  text_length: number | null;
  extraction_error: string | null;
}

const TextExtractionManager: React.FC = () => {
  const [books, setBooks] = useState<BookWithExtraction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [processingBookId, setProcessingBookId] = useState<string | null>(null);
  const [viewText, setViewText] = useState<{ bookTitle: string; text: string } | null>(null);
  const { toast } = useToast();

  const fetchBooks = async () => {
    setLoading(true);
    try {
      // Fetch approved books
      const { data: approvedBooks, error } = await supabase
        .from('approved_books' as any)
        .select('id, title, author, cover_image_url, book_file_url')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      // Fetch extraction statuses
      const bookIds = (approvedBooks as any[])?.map((b: any) => b.id) || [];
      const { data: extractions } = await supabase
        .from('book_extracted_text')
        .select('book_id, extraction_status, text_length, extraction_error')
        .in('book_id', bookIds);

      const extractionMap = new Map(
        (extractions || []).map(e => [e.book_id, e])
      );

      const booksWithExtraction: BookWithExtraction[] = ((approvedBooks as any[]) || []).map((book: any) => {
        const ext = extractionMap.get(book.id);
        return {
          ...book,
          extraction_status: ext?.extraction_status || null,
          text_length: ext?.text_length || null,
          extraction_error: ext?.extraction_error || null,
        };
      });

      setBooks(booksWithExtraction);
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

  const extractText = async (bookId: string) => {
    setProcessingBookId(bookId);
    try {
      const { data, error } = await supabase.functions.invoke('extract-book-text', {
        body: { bookId, bookTable: 'approved_books' }
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: 'تم استخراج النص بنجاح',
          description: `تم استخراج ${data.textLength} حرف من ${data.processedPages} صفحة`,
        });
        fetchBooks();
      } else {
        throw new Error(data?.error || 'فشل الاستخراج');
      }
    } catch (err) {
      console.error('Extraction error:', err);
      toast({
        title: 'خطأ في استخراج النص',
        description: err instanceof Error ? err.message : 'خطأ غير متوقع',
        variant: 'destructive',
      });
    } finally {
      setProcessingBookId(null);
    }
  };

  const viewExtractedText = async (bookId: string, bookTitle: string) => {
    try {
      const { data, error } = await supabase
        .from('book_extracted_text')
        .select('extracted_text')
        .eq('book_id', bookId)
        .single();

      if (error || !data?.extracted_text) {
        toast({ title: 'لا يوجد نص مستخرج لهذا الكتاب', variant: 'destructive' });
        return;
      }

      setViewText({ bookTitle, text: data.extracted_text });
    } catch (err) {
      toast({ title: 'خطأ في جلب النص', variant: 'destructive' });
    }
  };

  const filteredBooks = books.filter(b =>
    b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.author.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"><CheckCircle className="h-3 w-3 ml-1" />مكتمل</Badge>;
      case 'processing':
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"><Loader2 className="h-3 w-3 ml-1 animate-spin" />قيد المعالجة</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"><XCircle className="h-3 w-3 ml-1" />فشل</Badge>;
      default:
        return <Badge variant="outline">لم يُستخرج بعد</Badge>;
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
                      <FileText className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm truncate">{book.title}</h3>
                  <p className="text-xs text-muted-foreground">{book.author}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {getStatusBadge(book.extraction_status)}
                    {book.text_length && (
                      <span className="text-xs text-muted-foreground">
                        {book.text_length.toLocaleString()} حرف
                      </span>
                    )}
                  </div>
                  {book.extraction_error && (
                    <p className="text-xs text-red-500 mt-1 truncate">{book.extraction_error}</p>
                  )}
                </div>

                <div className="flex flex-col gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    onClick={() => extractText(book.id)}
                    disabled={processingBookId === book.id}
                  >
                    {processingBookId === book.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4 ml-1" />
                    )}
                    استخراج
                  </Button>
                  {book.extraction_status === 'completed' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => viewExtractedText(book.id, book.title)}
                    >
                      <Eye className="h-4 w-4 ml-1" />
                      عرض
                    </Button>
                  )}
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

      {/* Dialog لعرض النص المستخرج */}
      <Dialog open={!!viewText} onOpenChange={() => setViewText(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>النص المستخرج - {viewText?.bookTitle}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] rounded border p-4" dir="rtl">
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
              {viewText?.text}
            </pre>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TextExtractionManager;
