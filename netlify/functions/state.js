const { getStore, connectLambda } = require('@netlify/blobs');

const defaultData = {
    version: "4.0.0",
    lastUpdated: "Henüz güncellenmedi",
    hurmuzStatus: "AÇIK / GÜVENLİ",
    aiAnalysis: "Sistem başlatılıyor...",
    market: { brent: 0, brentPct: 0, wti: 0, gold: 0, goldPct: 0, gas: 0, gasPct: 0, vix: 0, vixPct: 0, silver: 0, silverPct: 0, uranium: 0, uraniumPct: 0, shipping: 0, shippingPct: 0 },
    // YENİ MODÜLER MANUEL LİSTE
    manualMetrics: [
        { name: "Polyester", unit: "$/Ton", value: 1250 },
        { name: "Gübre", unit: "$/Ton", value: 480 },
        { name: "Jet Yakıtı", unit: "$/Bbl", value: 85.2 },
        { name: "Türkiye 5Y CDS", unit: "Puan", value: 265 }
    ],
    mapStrikes: [],
    newsFeed: []
};

exports.handler = async function(event) {
    connectLambda(event);

    try {
        const store = getStore("iran-risk");

        if (event.httpMethod === 'GET') {
            let currentData = await store.get("state", { type: "json" });
            if (!currentData) currentData = defaultData;
            return { statusCode: 200, body: JSON.stringify(currentData) };
        }

        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body);
            if (body.pin !== "isedes") return { statusCode: 403, body: JSON.stringify({ error: "Unauthorized" }) };

            let currentData = await store.get("state", { type: "json" });
            if (!currentData) currentData = defaultData;

            // Manuel Verileri ve Hürmüzü Güncelle
            currentData.hurmuzStatus = body.data.hurmuzStatus;
            currentData.manualMetrics = body.data.manualMetrics; // Dinamik liste kaydediliyor
            currentData.lastUpdated = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

            await store.setJSON("state", currentData);
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, body: "Method Not Allowed" };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
