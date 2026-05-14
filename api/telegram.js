const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function getMemories(chatId) {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/memories?select=*&phone=eq.${chatId}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const data = await response.json();
    console.log("Hafıza okuma:", data);

    if (!Array.isArray(data)) return "";

    return data.map((m) => `${m.key}: ${m.value}`).join("\n");
  } catch (error) {
    console.log("Hafıza okuma hatası:", error);
    return "";
  }
}

async function saveMemory(chatId, key, value) {
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
          phone: String(chatId),
          key,
          value,
        }),
      }
    );

    const result = await response.json();
    console.log("Hafıza kayıt/güncelleme:", result);
  } catch (error) {
    console.log("Hafıza kayıt hatası:", error);
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

Kullanıcı mesajından kalıcı ve ileride işe yarayacak kişisel bilgileri çıkar.

Kaydet:
- isim
- sevgili/eş bilgisi
- aile bireyleri
- doğum günü / özel gün
- sevdiği/sevmediği şeyler
- hediye tercihleri
- bütçe
- güncelleme/değişiklik bilgileri

Kaydetme:
- soru cümleleri
- selamlaşma
- geçici sohbet
- "ben kimim", "ne zaman", "kim", "nedir" gibi bilgi isteme mesajları

Sadece JSON döndür.

Format:
{
  "memories": [
    { "key": "kisa_anahtar", "value": "deger" }
  ]
}

Kaydedilecek bilgi yoksa:
{
  "memories": []
}

Anahtarlar küçük harfli ve alt çizgili olsun.
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
Telegram mesajı gibi cevap ver.

Kullanıcı hakkında bildiklerin:
${memoryText || "Henüz kayıtlı bilgi yok."}

Kullanıcının kayıtlı bilgilerini dikkate al.
Kullanıcı "Ben kimim?", "Benim adım ne?", "annemin doğum günü ne zaman?", "sevgilimin adı ne?" gibi sorarsa hafızadaki bilgiye göre cevap ver.

Uzmanlıkların:
- özel gün hatırlatma
- hediye önerisi
- sürpriz planlama
- kişisel asistan desteği
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
  console.log("OpenAI cevap:", data);

  return (
    data.choices?.[0]?.message?.content ||
    "Merhaba 👋 Ben LIRA. Mesajını aldım ama şu an cevap oluşturamadım 💜"
  );
}

async function sendTelegramMessage(chatId, text) {
  const response = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    }
  );

  const result = await response.json();
  console.log("Telegram status:", response.status);
console.log("Telegram cevap sonucu:", result);
  console.log("Telegram cevap sonucu:", result);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  try {
    const body = req.body;

    const chatId = body.message?.chat?.id;
    const text = body.message?.text;

    console.log("Telegram mesaj:", text);
    console.log("Chat ID:", chatId);

    if (!chatId || !text) {
      return res.status(200).send("No message");
    }

    const memories = await extractMemoryWithAI(text);

    for (const memory of memories) {
      await saveMemory(chatId, memory.key, memory.value);
    }

    const memoryText = await getMemories(chatId);
    const reply = await askOpenAI(text, memoryText);

    await sendTelegramMessage(chatId, reply);

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Telegram webhook hata:", error);
    return res.status(200).send("OK");
  }
}
