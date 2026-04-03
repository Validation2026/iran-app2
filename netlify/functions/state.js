const { getStore } = require('@netlify/blobs');
const fs = require('fs');
const path = require('path');

exports.handler = async function(event) {
    // Statik Fallback (Eğer Netlify Blobs boşsa data.json'dan oku)
    const fallbackData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../data.json'), 'utf8'));

    // Netlify Store Bağlantısı
    const store = getStore("iran-risk");

    if (event.httpMethod === 'GET') {
        let currentData = await store.get("state", { type: "json" });
        if (!currentData) currentData = fallbackData;
        
        return { statusCode: 200, body: JSON.stringify(currentData) };
    }

    if (event.httpMethod === 'POST') {
        const body = JSON.parse(event.body);
        if (body.pin !== "isedes") return { statusCode: 403, body: "Unauthorized" };

        let currentData = await store.get("state", { type: "json" }) || fallbackData;

        // Sadece admin panelinden gelen manuel verileri güncelle, bot verilerine dokunma
        currentData.hurmuzStatus = body.data.hurmuzStatus;
        currentData.manual = body.data.manual;
        currentData.lastUpdated = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

        await store.setJSON("state", currentData);

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    }
};
