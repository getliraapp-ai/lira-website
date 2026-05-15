const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function parseBirthday(dateText) {
  try {
    const months = {
      ocak: 0,
      subat: 1,
      şubat: 1,
      mart: 2,
      nisan: 3,
      mayis: 4,
      mayıs: 4,
      haziran: 5,
      temmuz: 6,
      agustos: 7,
      ağustos: 7,
      eylul: 8,
      eylül: 8,
      ekim: 9,
      kasim: 10,
      kasım: 10,
      aralik: 11,
      aralık: 11,
    };

    const parts = String(dateText).toLowerCase().trim().split(/\s+/);
    const day = parseInt(parts[0], 10);
    const month = months[parts[1]];

    if (isNaN(day) || month === undefined) return null;

    const now = new Date();
    let birthday = new Date(now.getFullYear(), month, day);

    if (birthday < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      birthday = new Date(now.getFullYear() + 1, month, day);
    }

    return birthday;
  } catch {
    return null;
  }
}

function daysBetween(today, targetDate) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const target = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate()
  );

  const diff = target.getTime() - start.getTime();
  return Math.round(diff / (1000 * 60 * 60 * 24));
}

function getPersonFromBirthdayKey(key) {
  return key.replace("kisi_", "").replace("_dogum_gunu", "");
}

function formatPersonName(slug) {
  return slug
    .split("_")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
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
  console.log("Telegram gönderim sonucu:", result);
}

async function wasAlreadySent(phone, memoryKey, reminderDays, year) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/birthday_notifications?select=*&phone=eq.${phone}&memory_key=eq.${memoryKey}&reminder_days=eq.${reminderDays}&reminder_year=eq.${year}`,
    {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    }
  );

  const data = await response.json();
  return Array.isArray(data) && data.length > 0;
}

async function markAsSent(phone, memoryKey, birthdayValue, reminderDays, year) {
  await fetch(`${SUPABASE_URL}/rest/v1/birthday_notifications`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      phone,
      memory_key: memoryKey,
      birthday_value: birthdayValue,
      reminder_days: reminderDays,
      reminder_year: year,
    }),
  });
}

export default async function handler(req, res) {
  try {
    console.log("Birthday cron çalıştı");

    const response = await fetch(`${SUPABASE_URL}/rest/v1/memories?select=*`, {
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
      },
    });

    const memories = await response.json();

    if (!Array.isArray(memories)) {
      console.log("Memories okunamadı:", memories);
      return res.status(200).send("NO_MEMORIES");
    }

    const today = new Date();

    for (const memory of memories) {
      if (!memory.key.endsWith("_dogum_gunu")) continue;

      const birthday = parseBirthday(memory.value);
      if (!birthday) continue;

      const diffDays = daysBetween(today, birthday);
      const personSlug = getPersonFromBirthdayKey(memory.key);

      const personReminder = memories.find(
        (m) =>
          m.phone === memory.phone &&
          m.key === `kisi_${personSlug}_hatirlatma_gun_sayisi`
      );

      const generalReminder = memories.find(
        (m) => m.phone === memory.phone && m.key === "hatirlatma_gun_sayisi"
      );

      const reminderDays = parseInt(
        personReminder?.value || generalReminder?.value || "3",
        10
      );

     const isBirthdayToday = diffDays === 0;
const isReminderDay = diffDays === reminderDays;

if (!isBirthdayToday && !isReminderDay) continue;

     const notificationType = isBirthdayToday ? 0 : reminderDays;

const alreadySent = await wasAlreadySent(
  memory.phone,
  memory.key,
  notificationType,
  birthday.getFullYear()
);

      if (alreadySent) {
        console.log("Daha önce gönderilmiş:", memory.key);
        continue;
      }

      const personName = formatPersonName(personSlug);

      let message;

if (isBirthdayToday) {
  message =
    `🎉 Bugün özel bir gün!\n\n` +
    `Bugün ${personName} için doğum günü 💜\n\n` +
    `Küçük bir mesaj, arama ya da sürpriz çok güzel olabilir.`;
} else {
  message =
    `🎂 Hatırlatma\n\n` +
    `${personName} için doğum gününe ${reminderDays} gün kaldı.\n` +
    `Doğum günü: ${memory.value}\n\n` +
    `İstersen hediye veya sürpriz planı hazırlayabiliriz 💜`;
}

      await sendTelegramMessage(memory.phone, message);

      await markAsSent(
  memory.phone,
  memory.key,
  memory.value,
  notificationType,
  birthday.getFullYear()
);
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.log("Birthday cron hata:", error);
    return res.status(200).send("ERROR");
  }
}
