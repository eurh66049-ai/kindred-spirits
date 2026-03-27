import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// تقسيم النص إلى أجزاء مناسبة (حد Groq ~4096 حرف لكل طلب)
function splitTextIntoChunks(text: string, maxChars = 3500): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[.!؟。\n])\s*/);
  let current = '';

  for (const sentence of sentences) {
    if ((current + sentence).length > maxChars && current.length > 0) {
      chunks.push(current.trim());
      current = sentence;
    } else {
      current += (current ? ' ' : '') + sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// كشف لغة النص
function detectLanguage(text: string): 'ar' | 'en' {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  return arabicChars > latinChars ? 'ar' : 'en';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY');
    if (!GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { bookId, action = 'start' } = await req.json();

    if (!bookId) throw new Error('bookId is required');

    // === الحصول على حالة المهمة ===
    if (action === 'status') {
      const { data: job } = await supabase
        .from('audiobook_jobs')
        .select('*')
        .eq('book_id', bookId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      return new Response(JSON.stringify({ success: true, job }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // === بدء عملية التحويل ===

    // 1. جلب النص المستخرج من الكتاب
    const { data: textData, error: textError } = await supabase
      .from('book_extracted_text')
      .select('extracted_text, text_length')
      .eq('book_id', bookId)
      .single();

    if (textError || !textData?.extracted_text) {
      throw new Error('لا يوجد نص مستخرج لهذا الكتاب. قم باستخراج النص أولاً باستخدام OCR.');
    }

    // 2. جلب معلومات الكتاب
    const { data: book } = await supabase
      .from('book_submissions')
      .select('title')
      .eq('id', bookId)
      .eq('status', 'approved')
      .single();

    const bookTitle = book?.title || 'كتاب';

    // 3. تقسيم النص إلى أجزاء
    const fullText = textData.extracted_text;
    const chunks = splitTextIntoChunks(fullText);
    const language = detectLanguage(fullText);
    const totalPages = chunks.length;

    console.log(`📖 Starting audiobook generation for "${bookTitle}" - ${totalPages} chunks, language: ${language}`);

    // 4. إنشاء سجل المهمة
    const { data: job, error: jobError } = await supabase
      .from('audiobook_jobs')
      .insert({
        book_id: bookId,
        book_title: bookTitle,
        status: 'processing',
        current_step: 'converting_text_to_speech',
        total_pages: totalPages,
        processed_pages: 0,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (jobError) throw new Error(`Failed to create job: ${jobError.message}`);

    // 5. اختيار النموذج والصوت بناءً على اللغة
    const model = language === 'ar' ? 'canopylabs/orpheus-arabic-saudi' : 'canopylabs/orpheus-v1-english';
    const voice = language === 'ar' ? 'noura' : 'tara';

    // 6. معالجة كل جزء
    let processedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const pageNum = i + 1;

      try {
        console.log(`🔊 Processing chunk ${pageNum}/${totalPages} (${chunk.length} chars)...`);

        // حفظ النص المنظف
        await supabase
          .from('audiobook_text')
          .upsert({
            book_id: bookId,
            page_number: pageNum,
            cleaned_text: chunk,
            cleanup_status: 'completed',
            tts_status: 'processing',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'book_id,page_number' });

        // استدعاء Groq TTS API
        const ttsResponse = await fetch('https://api.groq.com/openai/v1/audio/speech', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${GROQ_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            voice,
            input: chunk,
            response_format: 'mp3',
          }),
        });

        if (!ttsResponse.ok) {
          const errText = await ttsResponse.text();
          console.error(`Groq TTS error for chunk ${pageNum}:`, ttsResponse.status, errText);
          errors.push(`Chunk ${pageNum}: ${ttsResponse.status}`);

          await supabase
            .from('audiobook_text')
            .update({
              tts_status: 'failed',
              error_message: `TTS error: ${ttsResponse.status}`,
              updated_at: new Date().toISOString(),
            })
            .eq('book_id', bookId)
            .eq('page_number', pageNum);

          continue;
        }

        // حفظ ملف الصوت في Storage
        const audioBuffer = await ttsResponse.arrayBuffer();
        const audioFileName = `audiobooks/${bookId}/page_${String(pageNum).padStart(4, '0')}.mp3`;

        const { error: uploadError } = await supabase.storage
          .from('book-files')
          .upload(audioFileName, audioBuffer, {
            contentType: 'audio/mpeg',
            upsert: true,
          });

        if (uploadError) {
          console.error(`Storage upload error for chunk ${pageNum}:`, uploadError);
          errors.push(`Upload chunk ${pageNum}: ${uploadError.message}`);
          continue;
        }

        // الحصول على رابط الملف
        const { data: urlData } = supabase.storage
          .from('book-files')
          .getPublicUrl(audioFileName);

        // تحديث سجل الصفحة
        await supabase
          .from('audiobook_text')
          .update({
            audio_file_url: urlData.publicUrl,
            tts_status: 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('book_id', bookId)
          .eq('page_number', pageNum);

        processedCount++;

        // تحديث تقدم المهمة
        await supabase
          .from('audiobook_jobs')
          .update({
            processed_pages: processedCount,
            current_step: `converting_page_${pageNum}_of_${totalPages}`,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);

      } catch (chunkError) {
        console.error(`Error processing chunk ${pageNum}:`, chunkError);
        errors.push(`Chunk ${pageNum}: ${chunkError instanceof Error ? chunkError.message : 'Unknown'}`);
      }
    }

    // 7. تحديث حالة المهمة النهائية
    const finalStatus = processedCount > 0 ? (errors.length > 0 ? 'completed_with_errors' : 'completed') : 'failed';

    await supabase
      .from('audiobook_jobs')
      .update({
        status: finalStatus,
        current_step: 'done',
        processed_pages: processedCount,
        completed_at: new Date().toISOString(),
        error_message: errors.length > 0 ? errors.join('; ') : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    console.log(`✅ Audiobook generation ${finalStatus}: ${processedCount}/${totalPages} chunks processed`);

    return new Response(JSON.stringify({
      success: true,
      jobId: job.id,
      status: finalStatus,
      processedPages: processedCount,
      totalPages,
      language,
      model,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Generate audiobook error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
