import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, Sparkles, Trash2, LogIn } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { createBookSlug } from '@/utils/bookSlug';
import Navbar from '@/components/layout/Navbar';
import { SEOHead } from '@/components/seo/SEOHead';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
interface Message {
  id: string;
  text: string;
  isBot: boolean;
  books?: Array<{
    id: string;
    slug?: string;
    title: string;
    author: string;
    cover_image_url: string;
  }>;
}

const welcomeMessage: Message = {
  id: 'welcome',
  text: 'مرحباً! 👋 أنا مساعد كتبي الذكي. يمكنني مساعدتك في:\n\n📚 البحث عن الكتب والمؤلفين\n📖 اقتراح كتب تناسب اهتماماتك\n📊 معرفة إحصائيات الكتب\n🔍 استكشاف التصنيفات المختلفة\n\nكيف يمكنني مساعدتك اليوم؟',
  isBot: true
};

const suggestedQuestions = [
  'ما هي أكثر الكتب قراءة؟',
  'اقترح لي كتاباً في الأدب العربي',
  'أريد رواية للقراءة',
];

const Assistant = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([welcomeMessage]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  };

  // تحميل المحادثات السابقة
  useEffect(() => {
    const loadMessages = async () => {
      if (!user) {
        setIsLoadingHistory(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('assistant_messages')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(100);

        if (error) throw error;

        if (data && data.length > 0) {
          const loadedMessages: Message[] = data.map(msg => ({
            id: msg.id,
            text: msg.message_text,
            isBot: msg.is_bot,
            books: msg.books as Message['books'] || undefined
          }));
          setMessages([welcomeMessage, ...loadedMessages]);
        }
      } catch (error) {
        console.error('Error loading messages:', error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadMessages();
  }, [user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // حفظ رسالة في قاعدة البيانات
  const saveMessage = async (text: string, isBot: boolean, books?: Message['books']) => {
    if (!user) return null;

    try {
      const { data, error } = await supabase
        .from('assistant_messages')
        .insert({
          user_id: user.id,
          message_text: text,
          is_bot: isBot,
          books: books || null
        })
        .select()
        .single();

      if (error) throw error;
      return data.id;
    } catch (error) {
      console.error('Error saving message:', error);
      return null;
    }
  };

  const sendMessage = async (messageText?: string) => {
    const text = messageText || inputValue.trim();
    if (!text || isLoading) return;

    const tempId = Date.now().toString();
    const userMessage: Message = {
      id: tempId,
      text,
      isBot: false
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // حفظ رسالة المستخدم
    if (user) {
      const savedId = await saveMessage(text, false);
      if (savedId) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, id: savedId } : m));
      }
    }

    try {
      // تحضير سجل المحادثة لإرساله مع الطلب (لجعل المساعد يتذكر السياق)
      const conversationHistory = messages
        .filter(m => m.id !== 'welcome') // استثناء رسالة الترحيب
        .map(m => ({
          message_text: m.text,
          is_bot: m.isBot
        }));

      const { data, error } = await supabase.functions.invoke('kotobi-assistant', {
        body: { 
          message: text,
          conversationHistory: conversationHistory.slice(-10) // آخر 10 رسائل للسياق
        }
      });

      if (error) throw error;

      const botTempId = (Date.now() + 1).toString();
      const books = data.books && data.books.length > 0 ? data.books : undefined;
      
      const botMessage: Message = {
        id: botTempId,
        text: data.reply,
        isBot: true,
        books
      };

      setMessages(prev => [...prev, botMessage]);

      // حفظ رسالة البوت
      if (user) {
        const savedBotId = await saveMessage(data.reply, true, books);
        if (savedBotId) {
          setMessages(prev => prev.map(m => m.id === botTempId ? { ...m, id: savedBotId } : m));
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: 'عذراً، حدث خطأ في الاتصال. يرجى المحاولة مرة أخرى.',
        isBot: true
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearHistory = async () => {
    if (!user) {
      toast.error('يجب تسجيل الدخول أولاً');
      return;
    }

    try {
      const { error } = await supabase
        .from('assistant_messages')
        .delete()
        .eq('user_id', user.id);

      if (error) throw error;

      setMessages([welcomeMessage]);
      toast.success('تم مسح المحادثة');
    } catch (error) {
      console.error('Error clearing history:', error);
      toast.error('حدث خطأ في مسح المحادثة');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // إذا لم يكن المستخدم مسجلاً دخوله، أظهر شاشة تسجيل الدخول
  if (!user) {
    return (
      <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
        <SEOHead
          title="مساعد كتبي الذكي - كتبي"
          description="تحدث مع مساعد كتبي الذكي للبحث عن الكتب والمؤلفين واقتراح قراءات تناسب اهتماماتك."
          keywords="مساعد كتبي, ذكاء اصطناعي, اقتراح كتب, البحث عن كتب, كتبي"
          canonical="https://kotobi.xyz/assistant"
        />
        <Navbar />
        
        <main className="flex-1 min-h-0 flex flex-col items-center justify-center container mx-auto px-4 py-4 pb-safe-bottom md:pb-6">
          <div className="text-center max-w-md mx-auto">
            <div className="inline-flex items-center justify-center mb-6">
              <div className="relative">
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
                  <Bot className="w-10 h-10 text-primary-foreground" />
                </div>
                <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
              </div>
            </div>
            
            <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-3">
              مساعد كتبي الذكي
            </h1>
            <p className="text-muted-foreground mb-6">
              للاستفادة من مساعد كتبي الذكي، يرجى تسجيل الدخول إلى حسابك أولاً
            </p>
            
            <div className="space-y-3">
              <Link to="/auth">
                <Button size="lg" className="w-full gap-2">
                  <LogIn className="w-5 h-5" />
                  تسجيل الدخول
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                ليس لديك حساب؟{' '}
                <Link to="/auth" className="text-primary hover:underline">
                  أنشئ حساباً جديداً
                </Link>
              </p>
            </div>
            
            <div className="mt-8 p-4 bg-muted/50 rounded-xl">
              <p className="text-sm text-muted-foreground mb-3">مميزات المساعد الذكي:</p>
              <ul className="text-sm text-right space-y-2">
                <li className="flex items-center gap-2">
                  <span className="text-primary">📚</span>
                  <span>البحث عن الكتب والمؤلفين</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-primary">📖</span>
                  <span>اقتراح كتب تناسب اهتماماتك</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="text-primary">💾</span>
                  <span>حفظ محادثاتك للرجوع إليها</span>
                </li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      <SEOHead
        title="مساعد كتبي الذكي - كتبي"
        description="تحدث مع مساعد كتبي الذكي للبحث عن الكتب والمؤلفين واقتراح قراءات تناسب اهتماماتك."
        keywords="مساعد كتبي, ذكاء اصطناعي, اقتراح كتب, البحث عن كتب, كتبي"
        canonical="https://kotobi.xyz/assistant"
      />
      <Navbar />
      
      <main className="flex-1 min-h-0 flex flex-col container mx-auto px-4 py-4 pb-safe-bottom md:pb-6 overflow-hidden">
        {/* Header */}
        <div className="text-center mb-4 flex-shrink-0">
          <div className="inline-flex items-center justify-center gap-3 mb-2">
            <div className="relative">
              <div className="w-12 h-12 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg">
                <Bot className="w-6 h-6 md:w-8 md:h-8 text-primary-foreground" />
              </div>
              <div className="absolute -top-1 -right-1 w-4 h-4 md:w-5 md:h-5 rounded-full bg-green-500 border-2 border-background flex items-center justify-center">
                <Sparkles className="w-2 h-2 md:w-3 md:h-3 text-white" />
              </div>
            </div>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">مساعد كتبي الذكي</h1>
          <p className="text-muted-foreground text-xs md:text-sm mt-1">مدعوم بالذكاء الاصطناعي</p>
        </div>

        {/* Chat Container */}
        <div className="flex-1 flex flex-col max-w-3xl mx-auto w-full bg-card rounded-2xl border border-border shadow-sm overflow-hidden min-h-0">
          {/* Header with clear button */}
          {messages.length > 1 && (
            <div className="flex justify-end px-3 py-2 border-b border-border">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                className="text-muted-foreground hover:text-destructive text-xs gap-1"
              >
                <Trash2 className="w-3 h-3" />
                مسح المحادثة
              </Button>
            </div>
          )}

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 min-h-0 overscroll-contain" ref={scrollContainerRef}>
            {isLoadingHistory ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-muted-foreground text-sm">جارٍ تحميل المحادثات...</div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div key={message.id} className="space-y-3">
                    <div className={cn(
                      "flex gap-3",
                      message.isBot ? "justify-start" : "justify-end"
                    )}>
                      {message.isBot && (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4 text-primary" />
                        </div>
                      )}
                      <div className={cn(
                        "max-w-[85%] px-4 py-3 rounded-2xl whitespace-pre-wrap text-sm",
                        message.isBot 
                          ? "bg-muted text-foreground rounded-tl-sm" 
                          : "bg-primary text-primary-foreground rounded-tr-sm"
                      )}>
                        {message.text}
                      </div>
                    </div>

                    {/* Books Grid */}
                    {message.books && message.books.length > 0 && (
                      <div className="mr-11 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {message.books.map((book) => (
                          <a 
                            key={book.id} 
                            href={`/book/${book.slug || createBookSlug(book.title, book.author)}`}
                            className="group bg-background border border-border rounded-xl p-2 hover:border-primary/50 hover:shadow-md transition-all duration-200"
                          >
                            <div className="aspect-[3/4] mb-2 overflow-hidden rounded-lg">
                              <img
                                src={book.cover_image_url || '/src/assets/default-book-cover.png'}
                                alt={book.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                              />
                            </div>
                            <p className="text-xs font-medium text-foreground line-clamp-2 leading-tight">
                              {book.title}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1 line-clamp-1">
                              {book.author}
                            </p>
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Loading Indicator */}
                {isLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-primary" />
                    </div>
                    <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex gap-1">
                          <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-sm text-muted-foreground">جارٍ التفكير...</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Suggested Questions */}
          {messages.length <= 2 && !isLoadingHistory && (
            <div className="px-4 py-2 border-t border-border flex-shrink-0">
              <p className="text-xs text-muted-foreground mb-2">أسئلة مقترحة:</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestedQuestions.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => sendMessage(question)}
                    disabled={isLoading}
                    className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input Area */}
          <div className="border-t border-border p-3 bg-muted/30 flex-shrink-0">
            <div className="flex gap-2">
              <Input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                onFocus={scrollToBottom}
                placeholder="اكتب سؤالك هنا..."
                className="flex-1 bg-background border-border focus-visible:ring-primary text-base"
                disabled={isLoading}
              />
              <Button
                onClick={() => sendMessage()}
                disabled={!inputValue.trim() || isLoading}
                size="icon"
                className="shrink-0"
              >
                <Send className="w-4 h-4 rtl:rotate-180" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Assistant;