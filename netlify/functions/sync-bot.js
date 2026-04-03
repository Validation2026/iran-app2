const { getStore, connectLambda } = require('@netlify/blobs');
const Parser = require('rss-parser');
const parser = new Parser({ headers: { 'User-Agent': 'Mozilla/5.0' } });

async function fetchYahooDirect(symbol) {
    try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?range=1d&interval=1m&includePrePost=false`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
        const data = await res.json();
        if (!data.chart || !data.chart.result) return null;
        const meta = data.chart.result[0].meta;
        return {
            price: parseFloat(meta.regularMarketPrice).toFixed(2),
            pct: (((meta.regularMarketPrice - meta.previousClose) / meta.previousClose) * 100).toFixed(2)
        };
    } catch (e) { return null; }
}

exports.handler = async function(event) {
    connectLambda(event);
    try {
        const store = getStore("iran-risk");
        let currentData = await store.get("state", { type: "json" });
        if (!currentData) return { statusCode: 404 };

        const tickers = {
            brent: 'CO=F', gold: 'GC=F', gas: 'TTF=F', vix: '^VIX', silver: 'SI=F',
            uranium: 'URA', shipping: 'BDRY', wheat: 'ZW=F', corn: 'ZC=F',
            copper: 'HG=F', lithium: 'LIT', iron: 'TIO=F', usGas: 'NG=F'
        };

        const results = await Promise.all(
            Object.entries(tickers).map(async ([key, sym]) => ({ key, data: await fetchYahooDirect(sym) }))
        );

        results.forEach(({ key, data }) => {
            if (data && (!currentData.lockedMetrics || !currentData.lockedMetrics[key])) {
                currentData.market[key] = data.price;
                currentData.market[key + 'Pct'] = data.pct;
            }
        });

        // --- HABER VE HARİTA TARAMA ---
        const news_keywords = { "iran": [35.68, 51.38, "il"], "israil": [31.76, 35.21, "ir"], "lübnan": [33.89, 35.50, "il"], "yemen": [15.36, 44.19, "us"] };
        const queries = ["İran+saldırı", "İsrail+füze", "Lübnan+vuruldu"];
        let allNews = [], strikes = [];
        for (const q of queries) {
            try {
                const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${q}&hl=tr&gl=TR&ceid=TR:tr`);
                feed.items.slice(0, 10).forEach(item => {
                    if (!allNews.find(n => n.title === item.title)) allNews.push({ title: item.title, link: item.link, date: item.isoDate });
                    for (const [kw, geo] of Object.entries(news_keywords)) {
                        if (item.title.toLowerCase().includes(kw)) {
                            strikes.push({ city: kw.toUpperCase(), lat: geo[0] + (Math.random()*0.1), lon: geo[1] + (Math.random()*0.1), actor: geo[2], title: item.title, link: item.link });
                            break;
                        }
                    }
                });
            } catch(e){}
        }
        currentData.newsFeed = allNews.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 25);
        currentData.mapStrikes = strikes;

        // AI Analiz Sentezi
        let hurmuz = currentData.hurmuzStatus || "AÇIK";
        if (hurmuz.includes("KAPALI")) currentData.aiAnalysis = `🚨 KRİTİK SEVİYE: Hürmüz geçişindeki aksama küresel enerji ve gıda arz zincirini kırmış durumda.`;
        else currentData.aiAnalysis = `ℹ️ İZLEME MODU: Piyasalar sahadaki askeri ve diplomatik gelişmeleri temkinli izliyor.`;

        await store.setJSON("state", currentData);
        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (error) { return { statusCode: 500, body: JSON.stringify({ error: error.message }) }; }
};
