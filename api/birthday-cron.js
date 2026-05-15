const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function parseBirthday(dateText) {
  try {
    const months = {
      ocak: 0,
      şubat: 1,
      mart: 2,
      nisan: 3,
      mayıs: 4,
      haziran: 5,
      temmuz: 6,
      ağustos: 7,
      eylül: 8,
      ekim: 9,
      kasım: 10,
      aralık: 11,
    };

    const parts = dateText.toLowerCase().split(" ");

    const day = parseInt(parts[0]);
    const month = months[parts[1]];

    if (isNaN(day) || month === undefined) {
      return null;
    }

    const now = new Date();

    return new Date(now.getFullYear(), month, day);
  } catch {
    return null;
  }
}

function daysBetween(a, b) {
  const diff = b.getTime() - a.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

async function sendTelegramMessage(chatId, text) {
  await fetch(
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
}

export default async function handler(req, res) {
  try {
    console.log("Birthday cron çalıştı");

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/memories?select=*`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    const memories = await response.json();

    const now = new Date();

    for (const memory of memories) {
      if (!memory.key.includes("dogum_gunu")) continue;

      const birthday = parseBirthday(memory.value);

      if (!birthday) continue;

      const diffDays = daysBetween(now, birthday);

      // varsayılan hatırlatma süresi
      let reminderDays = 3;

      // kullanıcı ayarı var mı kontrol et
      const userReminder = memories.find(
        (m) =>
          m.phone === memory.phone &&
          m.key === "hatirlatma_gun_sayisi"
      );

      if (userReminder) {
        reminderDays = parseInt(userReminder.value) || 3;
      }

      if (diffDays === reminderDays) {
        const personName = memory.key
          .replace("kisi_", "")
          .replace("_dogum_gunu", "");

        const message = `🎉 Hatırlatma\n\n${personName} isimli kişinin doğum gününe ${reminderDays} gün kaldı 💜`;

        console.log("Mesaj gönderiliyor:", message);

        await sendTelegramMessage(memory.phone, message);
      }
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.log(error);
    return res.status(500).send("ERROR");
  }
}
