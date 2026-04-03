const { getStore } = require('@netlify/blobs');

// Sunucusuz ortamda dosya okumak çökme yaratır, bu yüzden şablonu buraya gömdük
const defaultData = {
    version: "3.0.0",
    lastUpdated: "Henüz güncellenmedi",
    hurmuzStatus: "AÇIK / GÜVENLİ",
    market: { brent: 0, brentPct: 0, wti: 0, gold: 0, goldPct: 0, gas: 0, gasPct: 0, vix: 0, vixPct: 0 },
    manual: { polyester: 0, gubre: 0, jetFuel: 0, cds: 0 },
    mapStrikes: [],
    newsFeed: []
};

exports.handler = async function(event) {
    try {
        const store = getStore("iran-risk");

        if (event.httpMethod === 'GET') {
            let currentData = await store.get("state", { type: "json" });
            if (!currentData) currentData = defaultData; // Blob boşsa varsayılanı kullan
            
            return { statusCode: 200, body: JSON.stringify(currentData) };
        }

        if (event.httpMethod === 'POST') {
            const body = JSON.parse(event.body);
            if (body.pin !== "isedes") return { statusCode: 403, body: JSON.stringify({ error: "Unauthorized" }) };

            let currentData = await store.get("state", { type: "json" });
            if (!currentData) currentData = defaultData;

            // Manuel verileri güncelle
            currentData.hurmuzStatus = body.data.hurmuzStatus;
            currentData.manual = body.data.manual;
            currentData.lastUpdated = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

            await store.setJSON("state", currentData);

            return { statusCode: 200, body: JSON.stringify({ success: true }) };
        }

        return { statusCode: 405, body: "Method Not Allowed" };
    } catch (error) {
        // Çökmeyi engelle ve hatayı düzgün bir JSON olarak döndür
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
