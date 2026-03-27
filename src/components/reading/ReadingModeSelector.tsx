import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, Columns, FileText, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

interface ReadingMode {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
}

interface ReadingModeSelectorProps {
  selectedMode: string;
  onModeChange: (mode: string) => void;
  onClose: () => void;
}

const ReadingModeSelector = ({ selectedMode, onModeChange, onClose }: ReadingModeSelectorProps) => {
  const modes: ReadingMode[] = [
    {
      id: 'continuous',
      title: 'القراءة المستمرة',
      description: 'عرض الصفحات بشكل متتالي مع إمكانية التمرير السلس',
      icon: <FileText className="h-6 w-6" />,
      features: ['تمرير سلس', 'عرض متتالي', 'مناسب للنصوص الطويلة']
    },
    {
      id: 'page',
      title: 'صفحة واحدة',
      description: 'عرض صفحة واحدة في كل مرة مع تحكم دقيق',
      icon: <BookOpen className="h-6 w-6" />,
      features: ['تحكم دقيق', 'تركيز أفضل', 'مناسب للدراسة']
    },
    {
      id: 'book',
      title: 'وضع الكتاب',
      description: 'عرض صفحتين جنباً إلى جنب مثل الكتاب الحقيقي',
      icon: <Columns className="h-6 w-6" />,
      features: ['عرض مزدوج', 'تجربة طبيعية', 'مناسب للشاشات الكبيرة']
    },
    {
      id: 'immersive',
      title: 'الوضع الغامر',
      description: 'وضع قراءة بدون إزعاج مع إخفاء جميع العناصر',
      icon: <Zap className="h-6 w-6" />,
      features: ['بدون إزعاج', 'تركيز كامل', 'للقراءة المكثفة']
    }
  ];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <Card 
        className="w-full max-w-4xl mx-4 bg-card border-border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="text-center border-b border-border">
          <CardTitle className="text-2xl font-amiri text-foreground">اختر وضع القراءة المفضل</CardTitle>
          <p className="text-muted-foreground font-cairo">اختر الوضع الذي يناسب تفضيلاتك في القراءة</p>
        </CardHeader>
        
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {modes.map((mode) => (
              <motion.div
                key={mode.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`
                  p-6 rounded-xl border-2 cursor-pointer transition-all duration-300
                  ${selectedMode === mode.id 
                    ? 'border-primary bg-primary/5 shadow-lg' 
                    : 'border-border hover:border-primary/50 hover:bg-accent/50'
                  }
                `}
                onClick={() => {
                  onModeChange(mode.id);
                  onClose();
                }}
              >
                <div className="flex items-start gap-4">
                  <div className={`
                    p-3 rounded-lg
                    ${selectedMode === mode.id 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-accent text-accent-foreground'
                    }
                  `}>
                    {mode.icon}
                  </div>
                  
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold font-amiri text-foreground mb-2">
                      {mode.title}
                    </h3>
                    <p className="text-muted-foreground text-sm font-cairo mb-3">
                      {mode.description}
                    </p>
                    
                    <div className="space-y-1">
                      {mode.features.map((feature, index) => (
                        <div key={index} className="flex items-center gap-2 text-xs text-muted-foreground">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary"></div>
                          <span>{feature}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {selectedMode === mode.id && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="w-6 h-6 rounded-full bg-primary flex items-center justify-center"
                    >
                      <div className="w-3 h-3 rounded-full bg-white"></div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
          
          <div className="flex justify-center mt-6">
            <Button onClick={onClose} variant="outline" className="px-8">
              إغلاق
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
};

export default ReadingModeSelector;