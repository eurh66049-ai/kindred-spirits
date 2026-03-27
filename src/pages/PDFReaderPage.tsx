
import React from 'react';
import UniversalFileViewer from '@/components/reading/UniversalFileViewer';
import Navbar from '@/components/layout/Navbar';
import { SEOHead } from '@/components/seo/SEOHead';

const PDFReaderPage = () => {
  return (
    <div>
      <SEOHead
        title="قارئ الكتب - منصة كتبي"
        description="اقرأ الكتب العربية مباشرة عبر متصفحك على منصة كتبي. قارئ مدمج يدعم ملفات PDF والمزيد."
        noindex={true}
      />
      <Navbar />
      <UniversalFileViewer />
    </div>
  );
};

export default PDFReaderPage;
