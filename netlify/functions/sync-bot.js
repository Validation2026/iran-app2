const { getStore, connectLambda } = require('@netlify/blobs');
const Parser = require('rss-parser');

const parser = new Parser({
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
});

const defaultData = {
    version: "3.0.0",
    lastUpdated: "Henüz güncellenmedi",
    hurmuzStatus: "AÇIK / GÜVENLİ",
    market: { brent: 0, brentPct: 0, wti: 0, gold: 0, goldPct: 0, gas: 0, gasPct: 0, vix: 0, vixPct: 0 },
    manual: { polyester: 1250, gubre: 480, jetFuel: 85.2, cds: 265 },
    mapStrikes: [],
    newsFeed: []
};

const geo_db = {
    "Tahran": [35.68, 51.38, "il"], "İsfahan": [32.65, 51.66, "il"],
    "Tebriz": [38.07, 46.29, "il"], "Kum": [34.64, 50.87, "il"],
    "Tel Aviv": [32.08, 34.78, "ir"], "Kudüs": [31.76, 35.21, "ir"],
    "Hayfa": [32.79, 34.98, "ir"], "Beyrut": [33.89, 35.50, "il"],
    "Şam": [33.51, 36.29, "il"], "Sanaa": [15.36, 44.19, "us"]
};

const jitter = (val) => val + (Math.random() * 0.1 - 0.05);

// Yahoo'nun engellemediği v8 Chart API'si
async function getTicker(symbol) {
    try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`;
        const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }});
        const json = await res.json();
        const meta = json.chart.result[0].meta;
        const current = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose;
        const pct = ((current - prev) / prev) * 100;
        return { price: current.toFixed(2), pct: pct.toFixed(2) };
    } catch (e) {
        return { price: 0, pct: 0 };
    }
}

exports.handler = async function(event) {
    connectLambda(event);

    if (event.body) {
        const body = JSON.parse(event.body);
        if (body.pin !== "isedes") return { statusCode: 403, body: JSON.stringify({ error: "Unauthorized" }) };
    }

    try {
        const store = getStore("iran-risk");
        let currentData = await store.get("state", { type: "json" });
        if (!currentData) currentData = defaultData;

        // 1. HABER TARAMASI
        const queries = ["İran+saldırı", "İsrail+füze", "Lübnan+vuruldu"];
        let allNews = [];
        let strikes = [];

        for (const q of queries) {
            try {
                const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${q}&hl=tr&gl=TR&ceid=TR:tr`);
                feed.items.slice(0, 10).forEach(item => {
                    if (!allNews.find(n => n.title === item.title)) {
                        allNews.push({ title: item.title, link: item.link, date: item.isoDate });
                    }
                    for (const [city, data] of Object.entries(geo_db)) {
                        if (item.title.toLowerCase().includes(city.toLowerCase())) {
                            strikes.push({
                                city: `🔴 SON DAKİKA: ${city}`, 
                                lat: jitter(data[0]), lon: jitter(data[1]),
                                actor: data[2], title: item.title, link: item.link
                            });
                            break;
                        }
                    }
                });
            } catch (err) {}
        }

        allNews.sort((a, b) => new Date(b.date) - new Date(a.date));
        currentData.newsFeed = allNews.slice(0, 25);
        currentData.mapStrikes = strikes;

        // 2. FİNANSAL METRİKLER (Engel Yemeyen Metot)
        const [brent, wti, gold, gas, vix] = await Promise.all([
            getTicker('BZ=F'), getTicker('CL=F'), getTicker('GC=F'), getTicker('TTF=F'), getTicker('^VIX')
        ]);

        currentData.market = {
            brent: brent.price, brentPct: brent.pct,
            wti: wti.price,
            gold: gold.price, goldPct: gold.pct,
            gas: gas.price, gasPct: gas.pct,
            vix: vix.price, vixPct: vix.pct
        };

        currentData.lastUpdated = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

        await store.setJSON("state", currentData);

        return { statusCode: 200, body: JSON.stringify({ success: true, message: "Bot sync complete." }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
