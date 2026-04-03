const { getStore, connectLambda } = require('@netlify/blobs');

const defaultData = {
    version: "7.0.0",
    lastUpdated: "Henüz güncellenmedi",
    riskScore: 50,
    hurmuzStatus: "AÇIK / GÜVENLİ",
    aiAnalysis: "Sistem başlatılıyor...",
    market: {}, 
    lockedMetrics: {}, // Kullanıcının elle sabitlediği değerlerin listesi
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

            // Admin panelinden gelen güncellemeler
            currentData.riskScore = body.data.riskScore;
            currentData.hurmuzStatus = body.data.hurmuzStatus;
            currentData.manualMetrics = body.data.manualMetrics;
            currentData.market = body.data.market; // Manuel düzeltilen piyasa verileri
            currentData.lockedMetrics = body.data.lockedMetrics; // Hangi veriler bot tarafından güncellenmeyecek?
            
            currentData.lastUpdated = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

            await store.setJSON("state", currentData);
            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }
    } catch (error) { return { statusCode: 500, body: JSON.stringify({ error: error.message }) }; }
};
