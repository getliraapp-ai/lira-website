export default async function handler(req, res) {
  const VERIFY_TOKEN = "lira_verify_2026";

  // META doğrulama
  if (req.method === "GET") {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.status(403).send("Verification failed");
  }

  // WhatsApp mesajları
  if (req.method === "POST") {
    try {
      const body = req.body;

      const message =
        body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (message) {
        const from = message.from;
        const userText = message.text?.body;

        console.log("Mesaj geldi:", userText);

        // OpenAI cevabı al
        const aiResponse = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            },
            body: JSON.stringify({
              model: "gpt-4.1-mini",
              messages: [
                {
                  role: "system",
                  content:
                    "Sen LIRA adlı yapay zeka destekli kişisel asistansın. Türkçe konuş. Sıcak, samimi ve yardımcı ol.",
                },
                {
                  role: "user",
                  content: userText,
                },
              ],
            }),
          }
        );

        const aiData = await aiResponse.json();

        const reply =
          aiData.choices?.[0]?.message?.content ||
          "Şu an cevap veremiyorum.";

        // WhatsApp mesaj gönder
        await fetch(
          `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              to: from,
              text: {
                body: reply,
              },
            }),
          }
        );
      }

      return res.status(200).send("EVENT_RECEIVED");
    } catch (error) {
      console.log(error);
      return res.status(500).send("Server Error");
    }
  }

  return res.status(405).send("Method not allowed");
}
