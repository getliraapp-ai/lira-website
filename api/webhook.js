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

      const reply =
        "Merhaba 👋 Ben LIRA. Mesajını aldım. Yakında özel gün, hediye ve hatırlatma konularında sana yardımcı olacağım 💜";

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
