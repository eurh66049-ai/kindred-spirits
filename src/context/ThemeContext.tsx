
import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "dark" | "light";

type ThemeContextType = {
  theme: Theme;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
};

type ThemeProviderProps = {
  children: ReactNode;
};

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  // تتبع إعدادات النظام تلقائياً مع الوضع الداكن كافتراضي
  const [theme, setTheme] = useState<Theme>(() => {
    // التحقق من localStorage أولاً، ثم إعدادات النظام
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem("theme") as Theme;
      if (savedTheme) return savedTheme;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  });

  // تطبيق الثيم فوراً قبل عرض المحتوى
  const applyThemeImmediately = (currentTheme: Theme) => {
    if (typeof window !== 'undefined') {
      if (currentTheme === 'dark') {
        document.documentElement.classList.add("dark");
        document.documentElement.classList.remove("light");
      } else {
        document.documentElement.classList.remove("dark");
        document.documentElement.classList.add("light"); 
      }
      localStorage.setItem("theme", currentTheme);
    }
  };

  // تطبيق الثيم فوراً عند تحميل المكون
  React.useLayoutEffect(() => {
    applyThemeImmediately(theme);
  }, []);

  const applyTheme = (currentTheme: Theme) => {
    console.log('تطبيق الثيم:', currentTheme);
    applyThemeImmediately(currentTheme);
  };

  useEffect(() => {
    // تطبيق الثيم الحالي فوراً
    applyTheme(theme);
    
    // مراقبة تغيير إعدادات النظام
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? 'dark' : 'light';
      console.log('تغيير وضع النظام إلى:', newTheme);
      setTheme(newTheme);
    };
    
    // إضافة مراقب للتغيير
    mediaQuery.addEventListener('change', handleChange);
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  // تطبيق الثيم عند تغيير state
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    // إمكانية تبديل الثيم يدوياً
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export default ThemeProvider;
