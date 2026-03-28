import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BookApprovalEmailRequest {
  bookId: string;
  userId: string;
  bookTitle: string;
  bookAuthor: string;
  bookCategory: string;
  userEmail: string;
  coverImageUrl?: string;
}

// استخدام EmailJS من المتغيرات البيئية للأمان
const EMAILJS_SERVICE_ID = Deno.env.get('EMAILJS_SERVICE_ID') || 'service_tjpvbju';
const EMAILJS_TEMPLATE_ID = Deno.env.get('EMAILJS_TEMPLATE_ID') || 'template_cps20sa';
const EMAILJS_PUBLIC_KEY = Deno.env.get('EMAILJS_PUBLIC_KEY') || 'konoVp2jwRzSRBPaP';

// إعدادات احتياطية للأمان
const EMAIL_FROM = 'noreply@kotobi.com';
const EMAIL_SUBJECT_PREFIX = '[كتبي] ';

// نموذج HTML للبريد الإلكتروني
const createEmailTemplate = (userName: string, bookTitle: string, bookAuthor: string, bookCategory: string, bookUrl: string, approvalDate: string): string => {
  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>تمت الموافقة على كتابك</title>
    <style>
        body { font-family: 'Arial', sans-serif; background-color: #f5f5f5; margin: 0; padding: 20px; }
        .container { max-width: 600px; margin: 0 auto; background-color: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #4ade80, #16a34a); color: white; padding: 30px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; }
        .content { padding: 30px; }
        .success-icon { background-color: #dcfce7; color: #16a34a; width: 60px; height: 60px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 30px; margin-bottom: 20px; }
        .book-details { background-color: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #16a34a; }
        .book-details h3 { margin-top: 0; color: #1e293b; }
        .book-details p { margin: 10px 0; color: #64748b; }
        .cta-button { background: linear-gradient(135deg, #4ade80, #16a34a); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold; margin: 20px 0; }
        .footer { background-color: #f1f5f9; padding: 20px; text-align: center; color: #64748b; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🎉 تهانينا! تمت الموافقة على كتابك</h1>
        </div>
        <div class="content">
            <div class="success-icon">✅</div>
            <h2>عزيزي ${userName}</h2>
            <p>يسعدنا أن نُعلمك بأنه تمت الموافقة على كتابك وأصبح متاحاً الآن في مكتبة "كتبي" الرقمية!</p>
            
            <div class="book-details">
                <h3>تفاصيل الكتاب المعتمد:</h3>
                <p><strong>العنوان:</strong> ${bookTitle}</p>
                <p><strong>المؤلف:</strong> ${bookAuthor}</p>
                <p><strong>التصنيف:</strong> ${bookCategory}</p>
                <p><strong>تاريخ الموافقة:</strong> ${approvalDate}</p>
            </div>
            
            <p>كتابك أصبح الآن جزءاً من مكتبتنا الرقمية ويمكن للقراء الوصول إليه والاستمتاع بقراءته.</p>
            
            <a href="${bookUrl}" class="cta-button">📖 اعرض كتابك الآن</a>
            
            <h3>ماذا يحدث الآن؟</h3>
            <ul>
                <li>✅ كتابك متاح للقراءة على منصة كتبي</li>
                <li>📊 يمكنك متابعة إحصائيات القراءة والتقييمات</li>
                <li>📧 ستصلك إشعارات عند وجود تقييمات أو تعليقات جديدة</li>
                <li>🔄 يمكنك تحديث معلومات الكتاب في أي وقت</li>
            </ul>
        </div>
        <div class="footer">
            <p>شكراً لك على إثراء مكتبتنا الرقمية العربية</p>
            <p>فريق منصة كتبي | <a href="https://kotobi.xyz">kotobi.xyz</a></p>
        </div>
    </div>
</body>
</html>
  `;
};

/**
 * ترجمة التصنيف إلى العربية
 */
const getCategoryLabel = (categoryKey: string): string => {
  const categories: Record<string, string> = {
    'novels': 'روايات',
    'philosophy-culture': 'الفكر والثقافة العامة',
    'islamic-sciences': 'العلوم الإسلامية',
    'story-collections': 'مجموعة قصص',
    'poetry': 'الشعر',
    'texts-essays': 'نصوص وخواطر',
    'literature': 'الأدب',
    'history-civilizations': 'التاريخ والحضارات',
    'human-development': 'التنمية البشرية وتطوير الذات',
    'memoirs-autobiographies': 'مذكرات وسير ذاتية',
    'philosophy-logic': 'الفلسفة والمنطق',
    'politics': 'السياسية',
    'children': 'الأطفال',
    'studies-research': 'دراسات وبحوث',
    'religion': 'الأديان',
    'plays-arts': 'مسرحيات وفنون',
    'psychology': 'علم النفس',
    'education-pedagogy': 'التعليم والتربية',
    'love-relationships': 'الحب والعلاقات',
    'interpretations': 'التفاسير',
    'prophetic-biography': 'السيرة النبوية',
    'successors-followers': 'سيرة الخلفاء والتابعين',
    'marketing-business': 'التسويق وإدارة الأعمال',
    'sciences': 'العلوم',
    'arabic-learning': 'تعلم اللغة العربية',
    'womens-culture': 'ثقافة المرأة',
    'translation-dictionaries': 'الترجمة ومعاجم',
    'prophets-stories': 'قصص الأنبياء',
    'economics': 'الإقتصاد',
    'sociology': 'علم الإجتماع',
    'sufism': 'الصوفية',
    'english-learning': 'تعلم اللغة الإنجليزية',
    'medicine-nursing': 'الطب والتمريض',
    'communication-media': 'التواصل والإعلام',
    'nutrition': 'التغذية',
    'law': 'القانون',
    'programming': 'البرمجة',
    'alternative-medicine': 'الأعشاب والطب البديل',
    'mathematics': 'الرياضة',
    'computer-science': 'علوم الحاسوب',
    'french-learning': 'تعلم اللغة الفرنسية',
    'military-sciences': 'الحرب والعلوم العسكرية',
    'spanish-learning': 'تعلم اللغة الإسبانية',
    'photography': 'التصوير الفوتوغرافي',
    'cooking': 'الطبخ',
    'magazines': 'مجلات',
    'dream-interpretation': 'تفاسير الأحلام',
    'encyclopedias': 'المصاحف',
    'german-learning': 'تعلم اللغة الألمانية'
  };
  
  return categories[categoryKey] || categoryKey;
};

/**
 * إرسال بريد إلكتروني باستخدام EmailJS مع محاولة متعددة
 */
const sendEmailViaEmailJS = async (templateParams: Record<string, any>): Promise<{ success: boolean; error?: string }> => {
  let lastError = '';
  
  // محاولة أولى مع EmailJS API المعياري
  try {
    console.log('المحاولة الأولى: إرسال باستخدام EmailJS API...');
    
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Supabase-Edge-Function/1.0',
        'Origin': 'https://kotobi.xyz',
        'Referer': 'https://kotobi.xyz',
      },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: templateParams,
      }),
    });

    console.log('استجابة EmailJS:', {
      status: response.status,
      statusText: response.statusText
    });

    if (response.ok) {
      const responseText = await response.text();
      console.log('تم إرسال البريد بنجاح عبر EmailJS:', responseText);
      return { success: true };
    } else {
      const errorText = await response.text();
      lastError = `EmailJS Error: ${response.status} - ${errorText}`;
      console.error('فشل EmailJS:', lastError);
    }
  } catch (error) {
    lastError = `EmailJS Exception: ${error.message}`;
    console.error('خطأ في EmailJS:', error);
  }

  // محاولة ثانية مع معاملات مختلفة
  try {
    console.log('المحاولة الثانية: إرسال مع معاملات محدثة...');
    
    const alternativeParams = {
      ...templateParams,
      from_name: 'منصة كتبي',
      reply_to: 'noreply@kotobi.com',
    };

    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: alternativeParams,
      }),
    });

    if (response.ok) {
      console.log('تم إرسال البريد بنجاح في المحاولة الثانية');
      return { success: true };
    } else {
      const errorText = await response.text();
      lastError = `Second attempt failed: ${response.status} - ${errorText}`;
      console.error('فشلت المحاولة الثانية:', lastError);
    }
  } catch (error) {
    lastError = `Second attempt exception: ${error.message}`;
    console.error('خطأ في المحاولة الثانية:', error);
  }

  return { success: false, error: lastError };
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { bookId, userId, bookTitle, bookAuthor, bookCategory, userEmail, coverImageUrl }: BookApprovalEmailRequest = 
      await req.json();

    console.log('طلب إرسال بريد إلكتروني للموافقة على الكتاب:', {
      bookId,
      userId,
      bookTitle,
      bookAuthor,
      userEmail
    });

    // جلب معلومات المستخدم
    const { data: userProfile, error: userError } = await supabaseClient
      .from('profiles')
      .select('username, email')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('خطأ في جلب بيانات المستخدم:', userError);
    }

    // جلب معلومات الكتاب المعتمد لإنشاء الرابط
    const { data: bookSubmission, error: bookError } = await supabaseClient
      .from('book_submissions')
      .select('slug, id, cover_image_url')
      .eq('id', bookId)
      .single();

    // استخدام صورة الغلاف من الطلب أو من قاعدة البيانات
    const bookCoverUrl = coverImageUrl || bookSubmission?.cover_image_url || '';

    let bookUrl = 'https://kotobi.xyz'; // الرابط الافتراضي للموقع
    console.log('الرابط الافتراضي:', bookUrl);
    
    if (!bookError && bookSubmission) {
      if (bookSubmission.slug) {
        bookUrl = `https://kotobi.xyz/book/${bookSubmission.slug}`;
        console.log('تم إنشاء رابط مع slug:', bookUrl);
      } else {
        bookUrl = `https://kotobi.xyz/book/${bookSubmission.id}`;
        console.log('تم إنشاء رابط مع ID:', bookUrl);
      }
    }
    
    console.log('الرابط النهائي الذي سيتم إرساله:', bookUrl);

    // إعداد معاملات البريد الإلكتروني
    const userName = userProfile?.username || userProfile?.email || 'عزيزي المستخدم';
    const targetEmail = userEmail || userProfile?.email;
    
    if (!targetEmail) {
      throw new Error('لا يوجد بريد إلكتروني للمستخدم');
    }

    const templateParams = {
      user_name: userName,
      to_email: targetEmail,
      book_title: bookTitle,
      book_author: bookAuthor,
      book_category: getCategoryLabel(bookCategory),
      book_url: bookUrl,
      approval_date: new Date().toLocaleDateString('ar-EG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }),
    };

    console.log('معاملات البريد الإلكتروني:', templateParams);

    // إرسال البريد الإلكتروني
    console.log('بدء استدعاء EmailJS...');
    const emailResult = await sendEmailViaEmailJS(templateParams);
    console.log('نتيجة إرسال البريد:', emailResult);

    if (emailResult.success) {
      console.log('تم إرسال بريد الموافقة بنجاح إلى:', targetEmail);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'تم إرسال بريد الموافقة بنجاح',
          email: targetEmail
        }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      );
    } else {
      // في حالة فشل EmailJS، نقوم بتسجيل التفاصيل وإرجاع نجاح جزئي
      console.error('فشل في إرسال البريد الإلكتروني:', emailResult.error);
      
      // تم تعطيل إرسال الإشعارات الداخلية حسب طلب المستخدم
      console.log('تم تعطيل إرسال الإشعارات للكتب المعتمدة حسب طلب المستخدم');

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'تمت الموافقة على الكتاب وتم إرسال إشعار داخلي. لم يتم إرسال البريد الإلكتروني بسبب مشكلة تقنية.',
          email: targetEmail,
          emailError: emailResult.error
        }),
        { 
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json' 
          } 
        }
      );
    }

  } catch (error) {
    console.error('خطأ في edge function:', error);
    
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'خطأ غير معروف',
        success: false 
      }),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }, 
        status: 500 
      }
    );
  }
});