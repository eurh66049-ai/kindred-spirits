import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Safe base64 encoding that avoids stack overflow for large buffers
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return base64Encode(bytes);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GOOGLE_CLOUD_VISION_API_KEY = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
    if (!GOOGLE_CLOUD_VISION_API_KEY) {
      throw new Error('GOOGLE_CLOUD_VISION_API_KEY is not configured');
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { bookId, imageUrls, bookTable = 'approved_books' } = await req.json();

    if (!bookId) {
      throw new Error('bookId is required');
    }

    // Update status to processing
    await supabase
      .from('book_extracted_text')
      .upsert({
        book_id: bookId,
        extraction_status: 'processing',
        extracted_text: null,
        extraction_error: null,
        text_length: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'book_id' });

    let allText = '';
    let processedPages = 0;
    const errors: string[] = [];

    let urlsToProcess: string[] = imageUrls || [];

    if (urlsToProcess.length === 0) {
      const { data: book, error: bookError } = await supabase
        .from(bookTable)
        .select('book_file_url, cover_image_url, title')
        .eq('id', bookId)
        .single();

      if (bookError || !book) {
        throw new Error(`Book not found: ${bookError?.message || 'Unknown error'}`);
      }

      if (book.cover_image_url) {
        urlsToProcess.push(book.cover_image_url);
      }
    }

    // Process each image with Google Cloud Vision API
    for (const imageUrl of urlsToProcess) {
      try {
        console.log(`Processing image: ${imageUrl.substring(0, 100)}...`);

        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          errors.push(`Failed to fetch image: ${imageUrl.substring(0, 50)}...`);
          continue;
        }

        const imageBuffer = await imageResponse.arrayBuffer();
        const base64Image = arrayBufferToBase64(imageBuffer);

        const visionResponse = await fetch(
          `https://vision.googleapis.com/v1/images:annotate?key=${GOOGLE_CLOUD_VISION_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [
                {
                  image: { content: base64Image },
                  features: [
                    { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 }
                  ],
                  imageContext: {
                    languageHints: ['ar', 'en', 'fr']
                  }
                }
              ]
            })
          }
        );

        if (!visionResponse.ok) {
          const errorText = await visionResponse.text();
          console.error('Vision API error:', errorText);
          errors.push(`Vision API error for page ${processedPages + 1}: ${visionResponse.status}`);
          continue;
        }

        const visionData = await visionResponse.json();
        const response = visionData.responses?.[0];

        if (response?.error) {
          errors.push(`Vision API error: ${response.error.message}`);
          continue;
        }

        const extractedText = response?.fullTextAnnotation?.text || 
                             response?.textAnnotations?.[0]?.description || '';

        if (extractedText) {
          allText += `\n--- صفحة ${processedPages + 1} ---\n${extractedText}\n`;
          processedPages++;
        }

        console.log(`Page ${processedPages}: extracted ${extractedText.length} characters`);

      } catch (pageError) {
        console.error(`Error processing page:`, pageError);
        errors.push(`Error processing page ${processedPages + 1}: ${pageError instanceof Error ? pageError.message : 'Unknown'}`);
      }
    }

    const finalStatus = allText.trim() ? 'completed' : 'failed';
    const finalError = errors.length > 0 ? errors.join('; ') : null;

    await supabase
      .from('book_extracted_text')
      .upsert({
        book_id: bookId,
        extracted_text: allText.trim() || null,
        extraction_status: finalStatus,
        extraction_error: finalError,
        text_length: allText.trim().length,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'book_id' });

    return new Response(
      JSON.stringify({
        success: true,
        bookId,
        processedPages,
        textLength: allText.trim().length,
        status: finalStatus,
        errors: errors.length > 0 ? errors : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Extract text error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
