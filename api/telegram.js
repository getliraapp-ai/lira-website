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
    console.log("Hafıza kayıt/güncelleme hatası:", error);
  }
}

async function extractMemoryWithAI(text, memoryText) {
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
Sen LIRA için çalışan bir hafıza çıkarım motorusun.

Kullanıcının mevcut hafızası:
${memoryText || "Henüz kayıtlı bilgi yok."}

Görevin:
Kullanıcı mesajından kalıcı ve ileride işe yarayacak kişisel bilgileri çıkar.

Kaydet:
- kullanıcının adı
- yakınları ve tanıdıkları
- ilişki bilgileri
- doğum günü / özel gün
- sevdiği şeyler
- sevmediği şeyler
- hobiler
- hediye tercihleri
- bütçe
- hatırlatma tercihi
- güncelleme / değişiklik bilgileri

Kaydetme:
- soru cümleleri
- selamlaşma
- geçici sohbet
- "ben kimim", "ne zaman", "kim", "nedir" gibi bilgi isteme mesajları
- belirsiz bilgiler

Çok önemli kişi ilişkisi kuralı:
Kullanıcının bahsettiği her kişi kullanıcıya bağlı bir kişi olarak kaydedilmelidir.

Eğer kullanıcı:
- kız kardeşim Hacer
- kardeşim Hacer
- oğlum Abdülkadir
- arkadaşım Ali
- amcam Mehmet
- teyzem Fatma
- eşim Ayşe
- sevgilim Hasan

gibi bir ifade kullanırsa bu kişi kullanıcının yakını/tanıdığıdır.

Kişi hem ilişki hem isimle belirtilmişse ikisini de kaydet.

Örnek:
Kız kardeşim Hacer onun doğum günü 1 Ocak

Doğru:
{
  "memories": [
    { "key": "kisi_hacer_iliskisi", "value": "kız kardeş" },
    { "key": "kisi_hacer_dogum_gunu", "value": "1 Ocak" }
  ]
}

Örnek:
Oğlumun adı Abdülkadir onun doğum tarihi 28 Mart

Doğru:
{
  "memories": [
    { "key": "kisi_abdulkadir_iliskisi", "value": "oğul" },
    { "key": "kisi_abdulkadir_dogum_gunu", "value": "28 Mart" }
  ]
}

Örnek:
Sevgilim Hasan çiçekleri çok sever

Doğru:
{
  "memories": [
    { "key": "sevgili_adi", "value": "Hasan" },
    { "key": "kisi_hasan_iliskisi", "value": "sevgili" },
    { "key": "kisi_hasan_sevdigi_seyler", "value": "çiçekler" }
  ]
}

Doğum günü ve özel gün kuralı:
Doğum günü veya özel gün bilgisi varsa mutlaka kime ait olduğunu key içinde belirt.

Yanlış:
{ "key": "dogum_gunu", "value": "10 Mayıs" }

Doğru:
{ "key": "kisi_anne_dogum_gunu", "value": "10 Mayıs" }
{ "key": "kisi_hasan_dogum_gunu", "value": "20 Mart" }
{ "key": "kullanici_dogum_gunu", "value": "1 Ocak" }

Hatırlatma kuralı:
Kullanıcı “X gün önce haber ver”, “X gün kala hatırlat”, “X gün önceden uyar”, “X gün öncesinden bildir” derse bunu hafızaya kaydet.

Yeni mesajdaki kişi ilişkisini mevcut hafızaya göre eşleştir.
Örneğin hafızada:
kisi_hacer_iliskisi = kız kardeş
kisi_hacer_dogum_gunu = 20 Mayıs

Kullanıcı:
"Kardeşimin doğum gününü 5 gün önceden haber ver"

Doğru:
{
  "memories": [
    { "key": "kisi_hacer_hatirlatma_gun_sayisi", "value": "5" }
  ]
}

Eğer kişi belli değilse genel ayar olarak kaydet.

Örnek:
"Doğum günlerini 3 gün önce hatırlat"

Doğru:
{
  "memories": [
    { "key": "hatirlatma_gun_sayisi", "value": "3" }
  ]
}

Hatırlatma değerinde sadece sayı kullan.

Anahtar kuralları:
- key küçük harfli olsun
- Türkçe karakter kullanma
- boşluk yerine alt çizgi kullan
- kişi isimlerinde Türkçe karakterleri sadeleştir
  Örnek: Abdülkadir → abdulkadir, Ayşe → ayse, Hacer → hacer

Cevabın sadece JSON olsun. Açıklama yazma.

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

    const cleaned = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsed = JSON.parse(cleaned);

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
İlk tanışma mesajlarında:
- "her konuda yardımcı olurum"
- "yardımcı olmaya hazırım"
- "ne istersen sor"
gibi genel ifadeleri kullanma.

Kendini kısa ve net tanıt.

Amacın:
- kişisel hafıza tutmak
- özel günleri hatırlamak
- kullanıcı ilişkilerini yönetmek
- hediye ve sürpriz önerileri sunmak
- kişisel asistan gibi davranmak

Örnek:
"Merhaba Gökhan 😊 Ben LIRA. Özel günleri, yakınlarını ve senin için önemli detayları hatırlayan kişisel asistanınım 💜"

Kullanıcı hakkında bildiklerin:
${memoryText || "Henüz kayıtlı bilgi yok."}

Kullanıcının kayıtlı bilgilerini dikkate al.

Hafızadaki kişi bilgilerini karıştırma.
kisi_anne_* sadece kullanıcının annesine aittir.
kisi_baba_* sadece kullanıcının babasına aittir.
kisi_hacer_* sadece Hacer isimli kişiye aittir.
kisi_hasan_* sadece Hasan isimli kişiye aittir.

Kişileri kullanıcıdan bağımsız anlatma.
Örnek:
kisi_hacer_iliskisi = kız kardeş
kisi_hacer_dogum_gunu = 20 Mayıs

Kullanıcı sadece yeni bilgi veriyorsa:
- otomatik kişi listesi oluşturma
- tablo gösterme
- hafızadaki tüm kişileri tekrar yazma

Sadece kısa onay ver.

Örnek:
"Ahmet arkadaşın ve doğum günü 15 Mayıs olarak kaydedildi 💜"

Kullanıcı açıkça istemedikçe:
- kayıtlı kişiler listesi gösterme
- tablo oluşturma
- toplu hafıza özeti çıkarma

Kullanıcı "Benim hakkımda ne biliyorsun?" derse:
"Hacer kız kardeşin ve doğum günü 20 Mayıs" şeklinde söyle.

sevgili_adi varsa sevgiliyle ilgili sorularda o kişiye ait kisi_* bilgilerini kullan.

Bilgi yoksa tahmin yapma.
Var olmayan bilgiyi uydurma.

Kullanıcı "Ben kimim?", "Benim adım ne?", "annemin doğum günü ne zaman?", "sevgilimin adı ne?", "kim ne sever?" gibi sorarsa hafızadaki bilgiye göre cevap ver.
Kullanıcı:
- "Tanıdıklarımın doğum günleri"
- "Kimlerin doğum günü var"
- "Bana kayıtlı kişileri göster"
- "Hafızanda kimler var"

gibi bir soru sorarsa hafızadaki kişi kayıtlarını toplu ve düzenli liste halinde göster.

Örnek format:

📋 Kayıtlı Kişiler

• Hacer (kız kardeş)
  🎂 20 Mayıs

• Hasan (sevgili)
  🎂 10 Ocak
  ❤️ Çiçekleri sever

• Ali (arkadaş)
  🎂 5 Haziran

Bilgi yoksa boş bırak.
Uydurma bilgi üretme.

Uzmanlıkların:
- özel gün hatırlatma
- hediye önerisi
- sürpriz planlama
- kişisel asistan desteği
Hatırlatma günü hesaplama kuralı:
Kullanıcı “X gün önce hatırlat”, “X gün önceden haber ver” gibi bir şey isterse tarih hesabı yapma.
Yanlış tarih verme.
Sadece "Tamam, hatırlatma tercihini kaydettim." gibi cevap ver.
Doğum gününe kaç gün kaldığını veya hangi tarihte hatırlatacağını hesaplama.
Bu hesaplama sistem cron tarafından yapılacak.
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

    const telegramUserId = body.message?.from?.id;
    const telegramFirstName = body.message?.from?.first_name;
    const telegramUsername = body.message?.from?.username;

    console.log("Telegram mesaj:", text);
    console.log("Chat ID:", chatId);

    if (!chatId || !text) {
      return res.status(200).send("No message");
    }

   const userKey = String(telegramUserId || chatId);

const currentMemoryText = await getMemories(userKey);
    const memories = await extractMemoryWithAI(text, currentMemoryText);

    for (const memory of memories) {
      await saveMemory(userKey, memory.key, memory.value);
    }

    const updatedMemoryText = await getMemories(userKey);

let reply;

const savedReminder = memories.some((m) =>
  m.key.includes("hatirlatma_gun_sayisi")
);

if (savedReminder) {
  reply =
    "Tamam 💜 Hatırlatma tercihini kaydettim. Zamanı geldiğinde sana haber vereceğim.";
} else {
  reply = await askOpenAI(text, updatedMemoryText);
}

    await sendTelegramMessage(userKey, reply);

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Telegram webhook hata:", error);
    return res.status(200).send("OK");
  }
}
