import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  BookOpen,
  Clock,
  Layers,
  Star,
  TrendingUp,
  Award,
  BarChart3,
  Library,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/context/AuthContext';
import { Skeleton } from '@/components/ui/skeleton';

interface CategoryStat {
  name: string;
  count: number;
  percentage: number;
}

interface ReaderStats {
  totalBooks: number;
  completedBooks: number;
  totalPagesRead: number;
  totalPages: number;
  totalHours: number;
  favoriteCategories: CategoryStat[];
  currentStreak: number;
  completionRate: number;
  avgProgress: number;
}



const ReaderStatsCard: React.FC = () => {
  const { user } = useAuth();
  const [stats, setStats] = useState<ReaderStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }

    const fetchStats = async () => {
      try {
        // Fetch reading history
        const { data: history } = await supabase
          .from('reading_history')
          .select('book_id, current_page, total_pages, is_completed, last_read_at, started_at, reading_time_minutes')
          .eq('user_id', user.id);

        if (!history || history.length === 0) {
          setStats(null);
          setLoading(false);
          return;
        }

        // Fetch categories for these books
        const bookIds = history.map((h) => h.book_id);
        const { data: books } = await supabase
          .from('book_submissions')
          .select('id, category')
          .in('id', bookIds)
          .eq('status', 'approved');

        const categoryMap = new Map<string, string>();
        books?.forEach((b) => categoryMap.set(b.id, b.category));

        // Calculate stats
        const totalBooks = history.length;
        const completedBooks = history.filter((h) => h.is_completed).length;
        const totalPagesRead = history.reduce((s, h) => s + (h.current_page || 0), 0);
        const totalPages = history.reduce((s, h) => s + (h.total_pages || 0), 0);
        const totalReadingMinutes = history.reduce((s, h) => s + ((h as any).reading_time_minutes || 0), 0);
        const totalHours = Math.round((totalReadingMinutes / 60) * 10) / 10;
        const avgProgress =
          totalBooks > 0
            ? Math.round(
                history.reduce(
                  (s, h) =>
                    s + (h.total_pages > 0 ? (h.current_page / h.total_pages) * 100 : 0),
                  0,
                ) / totalBooks,
              )
            : 0;

        // Category stats
        const catCounts: Record<string, number> = {};
        history.forEach((h) => {
          const cat = categoryMap.get(h.book_id) || 'غير مصنف';
          catCounts[cat] = (catCounts[cat] || 0) + 1;
        });

        const favoriteCategories: CategoryStat[] = Object.entries(catCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([name, count]) => ({
            name,
            count,
            percentage: Math.round((count / totalBooks) * 100),
          }));

        // Reading streak (consecutive days)
        const sortedDates = [
          ...new Set(
            history
              .map((h) => h.last_read_at)
              .filter(Boolean)
              .map((d) => new Date(d!).toDateString()),
          ),
        ].sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

        let streak = 0;
        if (sortedDates.length > 0) {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          let checkDate = today;
          
          for (const dateStr of sortedDates) {
            const d = new Date(dateStr);
            d.setHours(0, 0, 0, 0);
            const diff = Math.round((checkDate.getTime() - d.getTime()) / 86400000);
            if (diff <= 1) {
              streak++;
              checkDate = d;
            } else {
              break;
            }
          }
        }

        setStats({
          totalBooks,
          completedBooks,
          totalPagesRead,
          totalPages,
          totalHours,
          favoriteCategories,
          currentStreak: streak,
          completionRate: totalBooks > 0 ? Math.round((completedBooks / totalBooks) * 100) : 0,
          avgProgress,
        });
      } catch (err) {
        console.error('Error fetching reader stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [user]);

  const readerLevel = useMemo(() => {
    if (!stats) return { label: 'قارئ جديد', icon: BookOpen, color: 'text-muted-foreground' };
    const p = stats.totalPagesRead;
    if (p >= 5000) return { label: 'قارئ أسطوري', icon: Award, color: 'text-yellow-500' };
    if (p >= 2000) return { label: 'قارئ خبير', icon: Star, color: 'text-purple-500' };
    if (p >= 500) return { label: 'قارئ متقدم', icon: TrendingUp, color: 'text-blue-500' };
    if (p >= 100) return { label: 'قارئ نشط', icon: BookOpen, color: 'text-green-500' };
    return { label: 'قارئ مبتدئ', icon: BookOpen, color: 'text-muted-foreground' };
  }, [stats]);

  if (!user) return null;

  if (loading) {
    return (
      <Card className="border-border">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-32 rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  if (!stats || stats.totalBooks === 0) {
    return (
      <Card className="border-border">
        <CardContent className="py-12 text-center">
          <Library className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground font-tajawal font-bold">
            لم تبدأ القراءة بعد! ابدأ بقراءة كتاب لرؤية إحصائياتك.
          </p>
        </CardContent>
      </Card>
    );
  }

  const LevelIcon = readerLevel.icon;

  const statCards = [
    {
      icon: BookOpen,
      label: 'الكتب المقروءة',
      value: stats.totalBooks,
      sub: `${stats.completedBooks} مكتمل`,
      gradient: 'from-primary/10 to-primary/5',
      iconColor: 'text-primary',
    },
    {
      icon: Layers,
      label: 'الصفحات المقروءة',
      value: stats.totalPagesRead.toLocaleString('ar-EG'),
      sub: `من ${stats.totalPages.toLocaleString('ar-EG')}`,
      gradient: 'from-green-500/10 to-green-500/5',
      iconColor: 'text-green-500',
    },
    {
      icon: Clock,
      label: 'ساعات القراءة',
      value: stats.totalHours,
      sub: 'فعلية',
      gradient: 'from-blue-500/10 to-blue-500/5',
      iconColor: 'text-blue-500',
    },
    {
      icon: TrendingUp,
      label: 'أيام متتالية',
      value: stats.currentStreak,
      sub: 'سلسلة القراءة',
      gradient: 'from-orange-500/10 to-orange-500/5',
      iconColor: 'text-orange-500',
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Card className="border-border overflow-hidden">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center justify-between font-tajawal text-foreground">
            <span className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              إحصائيات القراءة
            </span>
            <Badge
              variant="secondary"
              className="gap-1 font-tajawal"
            >
              <LevelIcon className={`h-3.5 w-3.5 ${readerLevel.color}`} />
              {readerLevel.label}
            </Badge>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-4 md:p-6 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {statCards.map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                className={`rounded-xl bg-gradient-to-br ${s.gradient} border border-border p-4 text-center`}
              >
                <s.icon className={`h-6 w-6 mx-auto mb-2 ${s.iconColor}`} />
                <div className="text-xl md:text-2xl font-bold text-foreground font-tajawal">
                  {s.value}
                </div>
                <div className="text-xs text-muted-foreground font-cairo mt-1">{s.label}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">{s.sub}</div>
              </motion.div>
            ))}
          </div>

          {/* Completion rate */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-cairo text-foreground font-bold">نسبة الإكمال</span>
              <span className="text-sm text-muted-foreground">{stats.completionRate}%</span>
            </div>
            <Progress value={stats.completionRate} className="h-2.5" />
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-cairo text-foreground font-bold">متوسط التقدم</span>
              <span className="text-sm text-muted-foreground">{stats.avgProgress}%</span>
            </div>
            <Progress value={stats.avgProgress} className="h-2.5" />
          </div>

          {/* Favorite Categories */}
          {stats.favoriteCategories.length > 0 && (
            <div>
              <h4 className="text-sm font-bold font-cairo text-foreground mb-3 flex items-center gap-2">
                <Star className="h-4 w-4 text-yellow-500" />
                الأنواع المفضلة
              </h4>
              <div className="space-y-2.5">
                {stats.favoriteCategories.map((cat, i) => (
                  <motion.div
                    key={cat.name}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                  >
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-cairo text-foreground">{cat.name}</span>
                      <span className="text-muted-foreground text-xs">
                        {cat.count} كتاب • {cat.percentage}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${cat.percentage}%` }}
                        transition={{ duration: 0.6, delay: 0.4 + i * 0.08 }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default ReaderStatsCard;
