const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

function parseTurkishDate(dateText) {
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

    const clean = String(dateText)
      .toLowerCase()
      .trim()
      .replace(",", "")
      .replace(".", "");

    const parts = clean.split(/\s+/);

    const day = parseInt(parts[0], 10);
    const month = months[parts[1]];

    if (isNaN(day) || month === undefined) return null;

    const now = new Date();
    let targetDate = new Date(now.getFullYear(), month, day);

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (targetDate < today) {
      targetDate = new Date(now.getFullYear() + 1, month, day);
    }

    return targetDate;
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

  return Math.round((target.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function isSpecialDateKey(key) {
  return (
    key.endsWith("_dogum_gunu") ||
    key.includes("_yil_donumu") ||
    key.includes("_ozel_gun") ||
    key.includes("_tarih")
  );
}

function getPersonSlug(key) {
  if (!key.startsWith("kisi_")) return "kullanici";

  return key
    .replace("kisi_", "")
    .replace("_dogum_gunu", "")
    .replace("_yil_donumu", "")
    .replace("_tanisma_yil_donumu", "")
    .replace("_evlilik_yil_donumu", "")
    .replace("_sevgili_olma_yil_donumu", "")
    .replace("_ozel_gun", "")
    .replace("_tarih", "");
}

function formatName(slug) {
  if (!slug || slug === "kullanici") return "Senin";

  return slug
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getEventLabel(key) {
  if (key.endsWith("_dogum_gunu")) return "doğum günü";

  if (key.includes("tanisma_yil_donumu")) return "tanışma yıl dönümü";
  if (key.includes("evlilik_yil_donumu")) return "evlilik yıl dönümü";
  if (key.includes("sevgili_olma_yil_donumu")) return "sevgili olma yıl dönümü";
  if (key.includes("_yil_donumu")) return "yıl dönümü";
  if (key.includes("_ozel_gun")) return "özel gün";
  if (key.includes("_tarih")) return "özel tarih";

  return "özel gün";
}

function getReminderKeyForEvent(key) {
  if (key.startsWith("kisi_")) {
    const personSlug = getPersonSlug(key);
    return `kisi_${personSlug}_hatirlatma_gun_sayisi`;
  }

  return "hatirlatma_gun_sayisi";
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

async function wasAlreadySent(phone, memoryKey, reminderType, year) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/birthday_notifications?select=*&phone=eq.${phone}&memory_key=eq.${memoryKey}&reminder_days=eq.${reminderType}&reminder_year=eq.${year}`,
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

async function markAsSent(phone, memoryKey, dateValue, reminderType, year) {
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
      birthday_value: dateValue,
      reminder_days: reminderType,
      reminder_year: year,
    }),
  });
}

function buildMessage({ personName, eventLabel, dateValue, diffDays, reminderDays }) {
  if (diffDays === 0) {
    if (eventLabel === "doğum günü") {
      return (
        `🎉 Bugün özel bir gün!\n\n` +
        `Bugün ${personName} için doğum günü 💜\n\n` +
        `Küçük bir mesaj, arama ya da sürpriz çok güzel olabilir.`
      );
    }

    return (
      `💞 Bugün özel bir gün!\n\n` +
      `Bugün ${personName} için ${eventLabel} 💜\n\n` +
      `Küçük bir mesaj ya da sürpriz güzel olabilir ✨`
    );
  }

  if (eventLabel === "doğum günü") {
    return (
      `🎂 Hatırlatma\n\n` +
      `${personName} için doğum gününe ${reminderDays} gün kaldı.\n` +
      `Tarih: ${dateValue}\n\n` +
      `İstersen hediye veya sürpriz planlayabiliriz 💜`
    );
  }

  return (
    `💞 Yaklaşan özel gün\n\n` +
    `${personName} için ${eventLabel} tarihine ${reminderDays} gün kaldı.\n` +
    `Tarih: ${dateValue}\n\n` +
    `İstersen buna özel bir plan hazırlayabiliriz ✨`
  );
}

export default async function handler(req, res) {
  try {
    console.log("Özel gün cron çalıştı");

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
      if (!isSpecialDateKey(memory.key)) continue;

      const targetDate = parseTurkishDate(memory.value);
      if (!targetDate) continue;

      const diffDays = daysBetween(today, targetDate);

      const reminderKey = getReminderKeyForEvent(memory.key);

      const specificReminder = memories.find(
        (m) => m.phone === memory.phone && m.key === reminderKey
      );

      const generalReminder = memories.find(
        (m) => m.phone === memory.phone && m.key === "hatirlatma_gun_sayisi"
      );

      const reminderDays = parseInt(
        specificReminder?.value || generalReminder?.value || "3",
        10
      );

      const isToday = diffDays === 0;
      const isReminderDay = diffDays === reminderDays;

      if (!isToday && !isReminderDay) continue;

      const eventLabel = getEventLabel(memory.key);
      const personSlug = getPersonSlug(memory.key);
      const personName = formatName(personSlug);

      const reminderType = isToday ? 0 : reminderDays;

      const alreadySent = await wasAlreadySent(
        memory.phone,
        memory.key,
        reminderType,
        targetDate.getFullYear()
      );

      if (alreadySent) {
        console.log("Daha önce gönderilmiş:", memory.key);
        continue;
      }

      const message = buildMessage({
        personName,
        eventLabel,
        dateValue: memory.value,
        diffDays,
        reminderDays,
      });

      console.log("Mesaj gönderiliyor:", message);

      await sendTelegramMessage(memory.phone, message);

      await markAsSent(
        memory.phone,
        memory.key,
        memory.value,
        reminderType,
        targetDate.getFullYear()
      );
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.log("Özel gün cron hata:", error);
    return res.status(200).send("ERROR");
  }
}
