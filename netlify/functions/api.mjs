import { getStore } from "@netlify/blobs";

export const config = {
  path: "/api"
};

const ADMIN_PIN = "isedes";
const STORE_NAME = "iran-risk-monitor";
const KEY_NAME = "dashboard";

export default async (req, context) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };

  if (req.method === "OPTIONS") {
    return new Response("OK", { status: 200, headers });
  }

  try {
    const store = getStore(STORE_NAME);

    const getInitial = () => ({
      "version": "4.0.0",
      "bulletin": { "title": "DURUM", "content": "Veriler izleniyor..." },
      "riskScore": 91,
      "startDate": "2026-02-28",
      "geoRisk": { "title": "JeoPolitik Riskler", "status": "Kritik", "content": "---" },
      "marketRisk": { "title": "EkoPolitik Riskler", "status": "Risk OFF", "content": "---" },
      "metrics": [
        { "name": "Hürmüz - Batıya Giden Tanker Sayısı", "value": "1", "month": "-98%", "year": "-98%" },
        { "name": "Hürmüz - Doğuya Giden Tanker Sayısı", "value": "3", "month": "-95%", "year": "-93%" },
        { "name": "Baltic Dry Endeks", "value": "2.014", "month": "-6%", "year": "7%" },
        { "name": "Brent Vadeli", "value": "107", "month": "47%", "year": "48%" },
        { "name": "Brent Spot", "value": "110", "month": "49%", "year": "50%" },
        { "name": "Sıvı HidroKarbon", "value": "848", "month": "44%", "year": "39%" },
        { "name": "Avrupa Doğalgaz", "value": "54", "month": "89%", "year": "99%" },
        { "name": "Jet Yakıtı", "value": "211", "month": "98%", "year": "104%" },
        { "name": "Alüminyum", "value": "3.269", "month": "50%", "year": "55%" },
        { "name": "Polyester STA", "value": "6.8", "month": "30%", "year": "35%" },
        { "name": "Gübre", "value": "924", "month": "50%", "year": "55%" },
        { "name": "Altın", "value": "4.495", "month": "-15%", "year": "4%" },
        { "name": "Gümüş", "value": "69", "month": "-22%", "year": "-2%" },
        { "name": "Vix", "value": "31", "month": "56%", "year": "62%" },
        { "name": "ABD 10Y", "value": "4,39", "month": "11%", "year": "8%" },
        { "name": "Türkiye CDS", "value": "300", "month": "12%", "year": "9%" },
        { "name": "Türkiye 10Y", "value": "34,17", "month": "13%", "year": "9%" },
        { "name": "Tüfe.ai", "value": "2,64%", "month": "2,96%", "year": "7,80%" },
        { "name": "Diğer", "value": "x", "month": "x", "year": "x" },
        { "name": "Diğer 2", "value": "x", "month": "x", "year": "x" }
      ]
    });

    if (req.method === "GET") {
      let data = await store.get(KEY_NAME, { type: "json" });
      if (!data) data = getInitial();

      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...headers, "Content-Type": "application/json" }
      });
    }

    if (req.method === "POST") {
      const body = await req.json();

      if (body.pin !== ADMIN_PIN) {
        return new Response(JSON.stringify({ error: "Geçersiz Yazar PIN kodu." }), { status: 401, headers: { ...headers, "Content-Type": "application/json" } });
      }

      if (!body.data) {
        return new Response(JSON.stringify({ error: "Veri bulunamadı" }), { status: 400, headers: { ...headers, "Content-Type": "application/json" } });
      }

      await store.setJSON(KEY_NAME, body.data);
      
      return new Response(JSON.stringify({ message: "Başarıyla güncellendi!" }), { status: 200, headers: { ...headers, "Content-Type": "application/json" } });
    }

    return new Response("Method Not Allowed", { status: 405, headers });
  } catch (err) {
    console.error("Master Error:", err);
    return new Response(JSON.stringify({ error: "Sunucu Çöktü", details: err.message }), { status: 500, headers: { ...headers, "Content-Type": "application/json" } });
  }
};
