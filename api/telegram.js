export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(200).send("OK");
  }

  try {
    const body = req.body;

    const chatId = body.message?.chat?.id;
    const text = body.message?.text;

    if (!chatId || !text) {
      return res.status(200).send("No message");
    }

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: "Sen LIRA isimli yardımcı bir yapay zekasın.",
            },
            {
              role: "user",
              content: text,
            },
          ],
        }),
      }
    );

    const openaiData = await openaiResponse.json();

    const reply =
      openaiData.choices?.[0]?.message?.content ||
      "Şu an cevap veremiyorum.";

    await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: reply,
        }),
      }
    );

    return res.status(200).send("OK");
  } catch (error) {
    console.log(error);
    return res.status(500).send("Error");
  }
}
