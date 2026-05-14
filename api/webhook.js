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
      const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (!message) {
        return res.status(200).send("EVENT_RECEIVED");
      }

      const from = message.from;
      const text = message.text?.body || "";

      console.log("Mesaj geldi:", text);
      console.log("Gönderen:", from);

      let memoryText = "";

      try {
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

        memoryText = Array.isArray(memories)
          ? memories.map((m) => `${m.key}: ${m.value}`).join("\n")
          : "";
      } catch (e) {
        console.log("Hafıza okunamadı:", e);
      }

      const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
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
Kısa, sıcak ve yardımcı cevap ver.

Kullanıcı hakkında bildiklerin:
${memoryText}

Kullanıcı kendisiyle ilgili kalıcı bir bilgi verirse cevabının sonuna şu formatta ekle:
MEMORY: isim=Gökhan

Örnek hafıza türleri:
MEMORY: isim=Gökhan
MEMORY: sevgili_adi=Ayşe
MEMORY: hediye_butcesi=3000 TL
MEMORY: annesinin_dogum_gunu=4 Haziran

Kullanıcıya MEMORY satırını gösterme.
`,
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

      let reply =
        openaiData.choices?.[0]?.message?.content ||
        "Merhaba 👋 Ben LIRA. Şu an kısa süreli yanıt veremiyorum ama mesajını aldım 💜";

      const memoryMatch = reply.match(/MEMORY:\s*(.+)/);

      if (memoryMatch) {
        const memoryData = memoryMatch[1];
        const [key, value] = memoryData.split("=");

        if (key && value) {
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
              key: key.trim(),
              value: value.trim(),
            }),
          });
        }

        reply = reply.replace(/MEMORY:.*$/gm, "").trim();
      }

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
              body: reply,
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
