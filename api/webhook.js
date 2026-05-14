const VERIFY_TOKEN = "lira_verify_token";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

async function getMemories(phone) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/memories?select=*&phone=eq.${phone}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const data = await response.json();
    if (!Array.isArray(data)) return "";

    return data.map((m) => `${m.key}: ${m.value}`).join("\n");
  } catch (error) {
    console.log("Hafıza okuma hatası:", error);
    return "";
  }
}

async function saveMemory(phone, key, value) {
  try {
    if (!key || !value) return;

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/memories?on_conflict=phone,key`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=representation",
        },
        body: JSON.stringify({
          phone,
          key,
          value,
        }),
      }
    );

    const result = await response.json();
    console.log("Supabase hafıza kayıt/güncelleme:", result);
  } catch (error) {
    console.log("Hafıza kayıt/güncelleme hatası:", error);
  }
}

async function extractMemoryWithAI(text) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `
Sen bir hafıza çıkarım motorusun.

Görevin:
Kullanıcı mesajından kalıcı ve ileride işe yarayacak kişisel bilgileri çıkar.

Sadece şu durumda hafıza çıkar:
- Kullanıcı kendisi hakkında bilgi verirse
- Yakınları hakkında bilgi verirse
- Özel gün, doğum günü, yıl dönümü verirse
- Hediye tercihi, sevdiği/sevmediği şey, bütçe, ilişki bilgisi verirse
- Bir bilgiyi güncellemek/değiştirmek istediğini söylerse

Şu durumlarda hafıza çıkarma:
- Soru soruyorsa
- Selam veriyorsa
- Sohbet ediyorsa
- "Ben kimim?", "ne zaman?", "kim?", "nedir?" gibi bilgi istiyorsa
- Belirsiz veya geçici bilgi veriyorsa

Cevabın sadece JSON olsun. Açıklama yazma.

Format:
{
  "memories": [
    {
      "key": "kisa_anahtar",
      "value": "deger"
    }
  ]
}

Eğer kaydedilecek bilgi yoksa:
{
  "memories": []
}

Anahtar isimleri Türkçe, küçük harfli ve alt çizgili olsun.

Örnekler:

Kullanıcı: "Benim adım Gökhan"
{
  "memories": [
    { "key": "isim", "value": "Gökhan" }
  ]
}

Kullanıcı: "Sevgilimin adı Ayşe, doğum günü 10 Ocak"
{
  "memories": [
    { "key": "sevgili_adi", "value": "Ayşe" },
    { "key": "sevgili_dogum_gunu", "value": "10 Ocak" }
  ]
}

Kullanıcı: "Annem çiçekleri sever"
{
  "memories": [
    { "key": "anne_sevdigi_seyler", "value": "çiçekler" }
  ]
}

Kullanıcı: "Ben kimim?"
{
  "memories": []
}
`,
          },
          {
            role: "user",
            content: text,
          },
        ],
      }),
    });

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content || '{"memories":[]}';

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.memories) ? parsed.memories : [];
  } catch (error) {
    console.log("AI hafıza çıkarım hatası:", error);
    return [];
  }
}

async function askOpenAI(text, memoryText) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
Sen LIRA adlı yapay zeka destekli kişisel asistansın.

Türkçe konuş.
Kısa, sıcak, doğal ve yardımcı cevap ver.
WhatsApp mesajı gibi cevap ver.

Kullanıcı hakkında bildiklerin:
${memoryText || "Henüz kayıtlı bilgi yok."}

Kullanıcının kayıtlı bilgilerini dikkate al.
Kullanıcı "Ben kimim?", "Benim adım ne?", "annemin doğum günü ne zaman?", "sevgilimin adı ne?" gibi sorarsa hafızadaki bilgiye göre cevap ver.

LIRA'nın uzmanlıkları:
- Özel gün hatırlatma
- Hediye önerisi
- Sürpriz planlama
- Günlük kişisel asistan desteği
`,
        },
        {
          role: "user",
          content: text,
        },
      ],
    }),
  });

  const data = await response.json();
  console.log("OpenAI cevap sonucu:", data);

  return (
    data.choices?.[0]?.message?.content ||
    "Merhaba 👋 Ben LIRA. Mesajını aldım ama şu an kısa süreli yanıt oluşturamadım 💜"
  );
}

async function sendWhatsAppMessage(to, body) {
  const response = await fetch(
    `https://graph.facebook.com/v25.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: false,
          body,
        },
      }),
    }
  );

  const result = await response.json();
  console.log("WhatsApp cevap sonucu:", result);
  return result;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Verification failed");
  }

  if (req.method === "POST") {
    try {
      const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (!message) {
        return res.status(200).send("EVENT_RECEIVED");
      }

      const from = message.from;
      const text = message.text?.body || "";

      console.log("Mesaj geldi:", text);
      console.log("Gönderen:", from);

      const memories = await extractMemoryWithAI(text);

      for (const memory of memories) {
        await saveMemory(from, memory.key, memory.value);
      }

      const memoryText = await getMemories(from);
      const reply = await askOpenAI(text, memoryText);

      await sendWhatsAppMessage(from, reply);

      return res.status(200).send("EVENT_RECEIVED");
    } catch (error) {
      console.error("Webhook hata:", error);
      return res.status(200).send("EVENT_RECEIVED");
    }
  }

  return res.status(405).send("Method not allowed");
}
