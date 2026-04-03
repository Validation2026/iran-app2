export const config = {
  path: "/api/sync-ai"
};

export default async (req, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers });

  try {
    const { pin } = await req.json();
    if (pin !== "isedes") {
      return new Response(JSON.stringify({ success: false, error: "Gecersiz PIN" }), { status: 401, headers: { ...headers, "Content-Type": "application/json" } });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY bulunamadı.");

    // 1. ADIM: Kullanılabilecek modelleri Google'dan sorgula (Deneme yanılmayı bitirmek için)
    let modelName = "gemini-1.5-flash"; // Varsayılan hedef
    try {
      const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
      const listResp = await fetch(listUrl);
      if (listResp.ok) {
        const listData = await listResp.json();
        const availableModels = listData.models.map(m => m.name.replace('models/', ''));
        
        // Tercih sırasına göre kontrol et
        const preferences = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro", "gemini-pro"];
        const match = preferences.find(p => availableModels.includes(p));
        if (match) modelName = match;
        else if (availableModels.length > 0) modelName = availableModels[0];
      }
    } catch (e) { console.error("Model listeleme başarısız:", e.message); }

    const prompt = `GÖREV: İRAN/BÖLGESEL RİSK ANALİZİ.
    
    YALNIZCA AŞAĞIDAKİ ALANLARI GÜNCELLE:
    1. bulletin: [DÜŞÜK, ORTA, YÜKSEK, KRİTİK]
    2. geoRisk: [DÜŞÜK, ORTA, YÜKSEK, KRİTİK]
    3. marketRisk: [STABİL, RİSK OFF, KRİTİK]

    Format (Sadece JSON):
    {
      "bulletin": {"status": "...", "content": "..."},
      "geoRisk": {"status": "...", "content": "..."},
      "marketRisk": {"status": "...", "content": "..."}
    }`;

    // SDK yerine Doğrudan REST API Kullanımı
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
        const errorData = await response.json();
        // Hata durumunda tüm mevcut modelleri listeye bas ki hangisi varmış görelim
        throw new Error(`Model: ${modelName} | API Hatası (${response.status}): ${JSON.stringify(errorData)}`);
    }

    const result = await response.json();
    let text = result.candidates[0].content.parts[0].text.trim();
    
    text = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI Yanıt Format Hatası");
    
    const aiData = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify({ success: true, data: aiData }), { 
      status: 200, 
      headers: { ...headers, "Content-Type": "application/json" } 
    });

  } catch (err) {
    console.error("Critical Failure:", err);
    return new Response(JSON.stringify({ 
      success: false, 
      error: err.message || "Bilinmeyen Hata"
    }), { 
      status: 500, 
      headers: { ...headers, "Content-Type": "application/json" } 
    });
  }
};

