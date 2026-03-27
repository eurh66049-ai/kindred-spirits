import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, BookOpen, Calendar, FileText, TrendingUp, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { fetchMonthlyReadingStats, sendMonthlyReadingReport, checkReportAlreadySent, logReportSent, type MonthlyReadingStats } from '@/utils/monthlyReadingReportService';

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const MonthlyReadingReport: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const now = new Date();

  const [selectedMonth, setSelectedMonth] = useState(now.getMonth().toString());
  const [selectedYear, setSelectedYear] = useState(now.getFullYear().toString());
  const [stats, setStats] = useState<MonthlyReadingStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [alreadySent, setAlreadySent] = useState(false);

  const availableYears = Array.from({ length: 3 }, (_, i) => (now.getFullYear() - i).toString());

  const handleFetchStats = async () => {
    if (!user) return;
    setLoading(true);
    setSent(false);
    setAlreadySent(false);
    try {
      const [data, wasSent] = await Promise.all([
        fetchMonthlyReadingStats(
          user.id,
          user.user_metadata?.username || user.email?.split('@')[0] || 'قارئ',
          user.email || '',
          parseInt(selectedMonth),
          parseInt(selectedYear)
        ),
        checkReportAlreadySent(user.id, parseInt(selectedMonth), parseInt(selectedYear))
      ]);
      setStats(data);
      setAlreadySent(wasSent);
    } catch {
      toast({ title: '❌ خطأ', description: 'فشل في جلب بيانات القراءة', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // تحديث الإحصائيات تلقائياً عند تغيير الشهر أو السنة
  useEffect(() => {
    if (user) {
      handleFetchStats();
    }
  }, [selectedMonth, selectedYear]);

  const handleSendReport = async () => {
    if (!stats || !user) return;
    setSending(true);
    try {
      const result = await sendMonthlyReadingReport(stats);
      if (result.success) {
        await logReportSent(user.id, parseInt(selectedMonth), parseInt(selectedYear));
        setSent(true);
        setAlreadySent(true);
        toast({ title: '✅ تم الإرسال', description: 'تم إرسال التقرير الشهري إلى بريدك الإلكتروني بنجاح' });
      } else {
        toast({ title: '❌ خطأ', description: `فشل في إرسال التقرير: ${result.error || 'خطأ غير معروف'}`, variant: 'destructive' });
      }
    } catch (err: any) {
      toast({ title: '❌ خطأ', description: `حدث خطأ أثناء إرسال التقرير: ${err?.message || 'خطأ غير معروف'}`, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  if (!user) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="pt-6 text-center">
          <p className="text-muted-foreground font-bold">⚠️ يجب تسجيل الدخول لعرض التقرير الشهري</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border-border" dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-foreground font-black text-lg">
          <Mail className="h-5 w-5 text-primary" />
          تقرير القراءة الشهري
        </CardTitle>
        <p className="text-sm text-muted-foreground font-bold">
          اختر الشهر واحصل على ملخص أداء القراءة مرسل إلى بريدك الإلكتروني
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* اختيار الشهر والسنة */}
        <div className="flex gap-3">
          <div className="flex-1">
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="bg-input border-border text-foreground font-bold">
                <SelectValue placeholder="الشهر" />
              </SelectTrigger>
              <SelectContent>
                {ARABIC_MONTHS.map((m, i) => (
                  <SelectItem key={i} value={i.toString()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-28">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="bg-input border-border text-foreground font-bold">
                <SelectValue placeholder="السنة" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(y => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleFetchStats} disabled={loading} className="font-bold">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'عرض'}
          </Button>
        </div>

        {/* عرض الإحصائيات */}
        {stats && (
          <div className="space-y-4 animate-in fade-in-50">
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={<BookOpen className="h-5 w-5 text-primary" />} label="كتب مقروءة" value={stats.books_read} />
              <StatCard icon={<FileText className="h-5 w-5 text-primary" />} label="صفحات مقروءة" value={stats.pages_read} />
              <StatCard icon={<Calendar className="h-5 w-5 text-primary" />} label="أيام قراءة" value={stats.reading_days} />
              <StatCard icon={<TrendingUp className="h-5 w-5 text-primary" />} label="معدل الصفحات/يوم" value={stats.avg_pages_per_day} />
            </div>

            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <p className="text-sm font-bold text-foreground">📂 التصنيف المفضل: {stats.favorite_category}</p>
            </div>

            <div className="p-3 rounded-lg bg-accent/50 border border-border">
              <p className="text-sm font-bold text-foreground">{stats.motivational_message}</p>
            </div>

            <Button
              onClick={handleSendReport}
              disabled={sending || sent || alreadySent || stats.books_read === 0}
              className="w-full font-black text-base"
              size="lg"
            >
              {sent || alreadySent ? (
                <><CheckCircle2 className="h-5 w-5 ml-2" /> تم إرسال تقرير هذا الشهر مسبقاً</>
              ) : sending ? (
                <><Loader2 className="h-5 w-5 ml-2 animate-spin" /> جاري الإرسال...</>
              ) : stats.books_read === 0 ? (
                <><Mail className="h-5 w-5 ml-2" /> لا توجد بيانات لإرسالها</>
              ) : (
                <><Mail className="h-5 w-5 ml-2" /> إرسال التقرير إلى بريدي الإلكتروني</>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
      {icon}
      <div>
        <p className="text-xs text-muted-foreground font-bold">{label}</p>
        <p className="text-lg font-black text-foreground">{value}</p>
      </div>
    </div>
  );
}

export default MonthlyReadingReport;
