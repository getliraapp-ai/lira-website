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
        method: "GET",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const data = await response.json();
    console.log("Supabase hafıza okuma sonucu:", data);

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
    console.log("Supabase kayıt/güncelleme sonucu:", result);
  } catch (error) {
    console.log("Hafıza kayıt/güncelleme hatası:", error);
  }
}

function extractDirectMemory(text) {
  const lowerText = text.toLowerCase();

if (
  lowerText.includes("ne zaman") ||
  lowerText.includes("kim") ||
  lowerText.includes("nedir") ||
  lowerText.includes("?")
) {
  return null;
}
  const nameMatch = text.match(
    /(?:benim adım|adım)\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)/i
  );

  if (nameMatch) {
    return {
      key: "isim",
      value: nameMatch[1],
    };
  }

  const motherBirthdayMatch = text.match(
  /annemin doğum (?:günü|tarihi)\s+(.+)/i
);

if (motherBirthdayMatch) {
  return {
    key: "annemin_dogum_gunu",
    value: motherBirthdayMatch[1].trim(),
  };
}

const partnerMatch = text.match(
  /sevgilimin adı\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+).*doğum günü\s+(.+)/i
);

if (partnerMatch) {
  return [
    {
      key: "sevgili_adi",
      value: partnerMatch[1].trim(),
    },
    {
      key: "sevgili_dogum_gunu",
      value: partnerMatch[2].trim(),
    },
  ];
}

return null;
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

Görevin:
- Özel gün hatırlatma
- Hediye önerisi
- Sürpriz planlama
- Günlük kişisel asistan desteği

Kullanıcı hakkında bildiğin bilgi varsa cevabında bunu kullan.
Kullanıcı "Ben kimim?", "Benim adım ne?" gibi sorarsa hafızadaki ismi söyle.
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
  console.log("OpenAI sonucu:", data);

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

      const directMemory = extractDirectMemory(text);

    if (directMemory) {
  if (Array.isArray(directMemory)) {
    for (const memory of directMemory) {
      await saveMemory(from, memory.key, memory.value);
    }
  } else {
    await saveMemory(from, directMemory.key, directMemory.value);
  }
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
