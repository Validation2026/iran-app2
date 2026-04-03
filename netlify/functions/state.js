const { getStore, connectLambda } = require('@netlify/blobs');

const defaultData = {
    version: "7.0.0",
    lastUpdated: "Henüz güncellenmedi",
    riskScore: 50,
    hurmuzStatus: "AÇIK / GÜVENLİ",
    aiAnalysis: "Sistem başlatılıyor...",
    market: { 
        brent: 109.20, brentPct: 0, gold: 0, goldPct: 0, gas: 0, gasPct: 0, 
        vix: 0, vixPct: 0, silver: 0, silverPct: 0, uranium: 0, uraniumPct: 0, 
        shipping: 0, shippingPct: 0, wheat: 0, wheatPct: 0, corn: 0, cornPct: 0, 
        copper: 0, copperPct: 0, lithium: 0, lithiumPct: 0, iron: 0, ironPct: 0, usGas: 0, usGasPct: 0 
    },
    lockedMetrics: {}, // Manuel kilitlenen verilerin listesi
    manualMetrics: [],
    mapStrikes: [],
    newsFeed: []
};

exports.handler = async function(event) {
    connectLambda(event);
    try {
        const store = getStore("iran-risk");
        if (event.httpMethod === 'GET') {
            let currentData = await store.get("state", { type: "json" }) || defaultData;
            return { statusCode: 200, body: JSON.stringify(currentData) };
        }
        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body);
            if (body.pin !== "isedes") return { statusCode: 403, body: JSON.stringify({ error: "Unauthorized" }) };

            let currentData = await store.get("state", { type: "json" }) || defaultData;

            // Admin'den gelen her şeyi kaydet
            currentData.riskScore = body.data.riskScore;
            currentData.hurmuzStatus = body.data.hurmuzStatus;
            currentData.manualMetrics = body.data.manualMetrics;
            currentData.market = body.data.market; 
            currentData.lockedMetrics = body.data.lockedMetrics; 
            currentData.lastUpdated = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

            await store.setJSON("state", currentData);
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }
    } catch (error) { return { statusCode: 500, body: JSON.stringify({ error: error.message }) }; }
};
