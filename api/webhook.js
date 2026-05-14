const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

export default async function handler(req, res) {
  const VERIFY_TOKEN = "lira_verify_token";

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
      const message =
        req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (!message) {
        return res.status(200).send("EVENT_RECEIVED");
      }

      const from = message.from;
      const text = message.text?.body || "";

      console.log("Mesaj geldi:", text);
      console.log("Gönderen:", from);

      // Kullanıcının hafızasını çek
const memoryResponse = await fetch(
  `${SUPABASE_URL}/rest/v1/memories?phone=eq.${from}`,
  {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  }
);

const memories = await memoryResponse.json();

const memoryText = memories
  .map((m) => `${m.key}: ${m.value}`)
  .join("\n");
      
      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "gpt-4.1-mini",
 messages: [
    {
    role: "system",
    content: `
Sen LIRA adlı yapay zeka destekli kişisel asistansın.

Türkçe konuş.
Sıcak, doğal ve yardımcı ol.

Kullanıcı hakkında bildiklerin:
${memoryText}

Eğer kullanıcı kendisiyle ilgili yeni bilgi verirse bunu kısa şekilde özetle.

Örnek:
MEMORY: isim=Gökhan

Normal cevabını da ver.
`,
  },
  {
    role: "user",
    content: text,
  },
],
      },
      {
        role: "user",
        content: text,
      },
    ],
  }),
});

const openaiData = await openaiResponse.json();
console.log("OpenAI sonucu:", openaiData);

const reply =
// Hafıza kaydetme kontrolü
const memoryMatch = reply.match(/MEMORY:\s*(.*)/);

if (memoryMatch) {
  const memoryData = memoryMatch[1];

  const [key, value] = memoryData.split("=");

  await fetch(`${SUPABASE_URL}/rest/v1/memories`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      phone: from,
      key: key?.trim(),
      value: value?.trim(),
    }),
  });
}
  openaiData.choices?.[0]?.message?.content ||
  "Merhaba 👋 Ben LIRA. Şu an kısa süreli yanıt veremiyorum ama mesajını aldım 💜";

      const whatsappResponse = await fetch(
        `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: from,
            type: "text",
            text: {
              preview_url: false,
              body: reply.replace(/MEMORY:.*$/gm, "").trim(),
            },
          }),
        }
      );

      const result = await whatsappResponse.json();
      console.log("WhatsApp cevap sonucu:", result);

      return res.status(200).send("EVENT_RECEIVED");
    } catch (error) {
      console.error("Webhook hata:", error);
      return res.status(200).send("EVENT_RECEIVED");
    }
  }

  return res.status(405).send("Method not allowed");
}
