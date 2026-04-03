const { getStore, connectLambda } = require('@netlify/blobs');

const defaultData = {
    version: "7.0.0",
    lastUpdated: "Henüz güncellenmedi",
    riskScore: 50,
    hurmuzStatus: "AÇIK / GÜVENLİ",
    aiAnalysis: "Sistem başlatılıyor...",
    // Botun çektiği ama Admin panelinden manuel müdahale edebileceğin alanlar
    market: { 
        brent: 0, brentPct: 0, gold: 0, goldPct: 0, gas: 0, gasPct: 0, 
        vix: 0, vixPct: 0, silver: 0, silverPct: 0, uranium: 0, uraniumPct: 0, 
        shipping: 0, shippingPct: 0, wheat: 0, wheatPct: 0, corn: 0, cornPct: 0, 
        copper: 0, copperPct: 0, lithium: 0, lithiumPct: 0, iron: 0, ironPct: 0, usGas: 0, usGasPct: 0 
    },
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

            // Admin panelinden gelen tüm verileri güncelle
            currentData.riskScore = body.data.riskScore;
            currentData.hurmuzStatus = body.data.hurmuzStatus;
            currentData.manualMetrics = body.data.manualMetrics;
            
            // HİBRİT: Admin panelinden gelen piyasa verilerini kaydet (Manuel düzeltmeler dahil)
            if (body.data.market) {
                currentData.market = body.data.market;
            }

            currentData.lastUpdated = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

            await store.setJSON("state", currentData);
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }
        return { statusCode: 405, body: "Method Not Allowed" };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
