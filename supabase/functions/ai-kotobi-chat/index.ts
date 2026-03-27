import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_BOT_USER_ID = "909cfa5a-7766-4ccd-97d6-99e7e3d51761";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { conversationId, userMessage } = await req.json();

    if (!conversationId || !userMessage) {
      return new Response(JSON.stringify({ error: "Missing conversationId or userMessage" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // جلب آخر 20 رسالة من المحادثة للسياق
    const { data: recentMessages } = await supabase
      .from("messages")
      .select("sender_id, content")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(20);

    const chatHistory = (recentMessages || []).reverse().map((msg) => ({
      role: msg.sender_id === AI_BOT_USER_ID ? "assistant" : "user",
      content: msg.content,
    }));

    // جلب معلومات عن الموقع (عدد الكتب والمؤلفين)
    const { count: booksCount } = await supabase
      .from("book_submissions")
      .select("*", { count: "exact", head: true })
      .eq("status", "approved");

    const { count: authorsCount } = await supabase
      .from("authors")
      .select("*", { count: "exact", head: true });

    const systemPrompt = `أنت "AI KOTOBI" - المساعد الذكي لمنصة كتبي (kotobi.xyz)، المكتبة الرقمية العربية المجانية.

معلومات عن المنصة:
- منصة كتبي هي مكتبة رقمية عربية مجانية تتيح قراءة وتحميل الكتب
- عدد الكتب المتاحة حالياً: ${booksCount || "آلاف"} كتاب
- عدد المؤلفين: ${authorsCount || "مئات"} مؤلف
- الموقع: kotobi.xyz
- يمكن للمستخدمين رفع كتبهم ومشاركتها مع المجتمع
- المنصة تدعم قراءة PDF و DOCX
- يمكن للمستخدمين إضافة اقتباسات من الكتب ومشاركتها
- يمكن متابعة المؤلفين وإرسال رسائل للمستخدمين الآخرين
- التصنيفات تشمل: الأدب، العلوم، التنمية الذاتية، الدين، التاريخ والمزيد
- يمكن للمستخدمين تقييم الكتب وكتابة مراجعات
- المنصة متاحة كتطبيق ويب تقدمي (PWA)

قواعد الرد:
- أجب باللغة العربية دائماً
- كن ودوداً ومختصراً ومفيداً
- إذا سُئلت عن كتاب معين، اقترح البحث عنه في المنصة
- لا تخترع معلومات عن كتب غير موجودة
- ساعد المستخدمين في استخدام المنصة وميزاتها`;

    // إرسال للـ Groq
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          ...chatHistory,
          { role: "user", content: userMessage },
        ],
        max_tokens: 1024,
        temperature: 0.7,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error("Groq API error:", groqResponse.status, errText);
      throw new Error(`Groq API error: ${groqResponse.status}`);
    }

    const groqData = await groqResponse.json();
    const aiReply = groqData.choices?.[0]?.message?.content || "عذراً، لم أتمكن من الرد. حاول مرة أخرى.";

    // حفظ رد البوت في قاعدة البيانات
    const { error: insertError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      sender_id: AI_BOT_USER_ID,
      content: aiReply,
      is_read: false,
    });

    if (insertError) {
      console.error("Error inserting bot message:", insertError);
      throw insertError;
    }

    // تحديث آخر رسالة في المحادثة
    await supabase
      .from("conversations")
      .update({ last_message_at: new Date().toISOString() })
      .eq("id", conversationId);

    return new Response(JSON.stringify({ reply: aiReply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-kotobi-chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
