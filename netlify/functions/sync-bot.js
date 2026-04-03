const { getStore, connectLambda } = require('@netlify/blobs');
const Parser = require('rss-parser');

const parser = new Parser({ headers: { 'User-Agent': 'Mozilla/5.0' } });

// Tüm yeni emtiaları içeren genişletilmiş varsayılan şablon
const defaultData = {
    version: "6.0.0",
    lastUpdated: "Henüz güncellenmedi",
    riskScore: 50,
    hurmuzStatus: "AÇIK / GÜVENLİ",
    aiAnalysis: "Sistem başlatılıyor...",
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
    mapStrikes: [], newsFeed: []
};

const news_keywords = {
    "tahran": [35.68, 51.38, "il"], "isfahan": [32.65, 51.66, "il"], "iran": [35.68, 51.38, "il"],
    "tel aviv": [32.08, 34.78, "ir"], "kudüs": [31.76, 35.21, "ir"], "israil": [31.76, 35.21, "ir"],
    "beyrut": [33.89, 35.50, "il"], "lübnan": [33.89, 35.50, "il"], "hizbullah": [33.89, 35.50, "il"],
    "şam": [33.51, 36.29, "il"], "suriye": [33.51, 36.29, "il"], "halep": [36.20, 37.13, "il"],
    "sanaa": [15.36, 44.19, "us"], "yemen": [15.36, 44.19, "us"], "husi": [14.79, 42.95, "il"],
    "kızıldeniz": [15.00, 41.50, "ir"], "erbil": [36.19, 44.00, "ir"], "irak": [33.31, 44.36, "us"],
    "harg": [29.23, 50.32, "il"], "natanz": [33.97, 51.92, "il"], "bekaa": [33.99, 36.14, "il"],
    "lazkiye": [35.52, 35.79, "il"], "humus": [34.52, 37.62, "il"], "golan": [33.01, 35.75, "ir"]
};

const jitter = (val) => val + (Math.random() * 0.2 - 0.1);

async function getTicker(symbol) {
    try {
        const res = await fetch(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=2d`, { headers: { 'User-Agent': 'Mozilla/5.0' }});
        const json = await res.json();
        if (!json.chart.result) return { price: 0, pct: 0 };
        const meta = json.chart.result[0].meta;
        const current = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose;
        const pct = (((current - prev) / prev) * 100).toFixed(2);
        return { price: current.toFixed(2), pct: pct };
    } catch (e) { return { price: 0, pct: 0 }; }
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
        const queries = ["İran+saldırı", "İsrail+füze", "Lübnan+vuruldu", "Husiler+saldırdı", "Suriye+hava+harekatı"];
        let allNews = [], strikes = [];

        for (const q of queries) {
            try {
                const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${q}&hl=tr&gl=TR&ceid=TR:tr`);
                feed.items.slice(0, 10).forEach(item => {
                    if (!allNews.find(n => n.title === item.title)) {
                        allNews.push({ title: item.title, link: item.link, date: item.isoDate });
                    }
                    const titleLower = item.title.toLowerCase();
                    for (const [keyword, data] of Object.entries(news_keywords)) {
                        if (titleLower.includes(keyword)) {
                            strikes.push({ 
                                city: `🔴 CANLI HABER: ${keyword.toUpperCase()}`, 
                                lat: jitter(data[0]), 
                                lon: jitter(data[1]), 
                                actor: data[2], 
                                title: item.title, 
                                link: item.link 
                            });
                            break;
                        }
                    }
                });
            } catch (err) {}
        }

        allNews.sort((a, b) => new Date(b.date) - new Date(a.date));
        currentData.newsFeed = allNews.slice(0, 25);
        currentData.mapStrikes = strikes.slice(0, 15);

        // 2. TÜM OTOMATİK EMTİALARI ÇEK (YENİLER DAHİL)
        const [
            brent, gold, gas, vix, silver, uranium, 
            shipping, wheat, corn, copper, lithium, iron, usGas
        ] = await Promise.all([
            getTicker('BZ=F'), getTicker('GC=F'), getTicker('TTF=F'), getTicker('^VIX'), 
            getTicker('SI=F'), getTicker('URA'), getTicker('BDRY'), getTicker('ZW=F'), 
            getTicker('ZC=F'), getTicker('HG=F'), getTicker('LIT'), getTicker('TIO=F'), getTicker('NG=F')
        ]);

        currentData.market = {
            brent: brent.price, brentPct: brent.pct,
            gold: gold.price, goldPct: gold.pct,
            gas: gas.price, gasPct: gas.pct,
            vix: vix.price, vixPct: vix.pct,
            silver: silver.price, silverPct: silver.pct,
            uranium: uranium.price, uraniumPct: uranium.pct,
            shipping: shipping.price, shippingPct: shipping.pct,
            wheat: wheat.price, wheatPct: wheat.pct,
            corn: corn.price, cornPct: corn.pct,
            copper: copper.price, copperPct: copper.pct,
            lithium: lithium.price, lithiumPct: lithium.pct,
            iron: iron.price, ironPct: iron.pct,
            usGas: usGas.price, usGasPct: usGas.pct
        };

        // 3. GELİŞMİŞ ANALİZ MANTIĞI
        let hurmuz = currentData.hurmuzStatus || "AÇIK";
        let score = currentData.riskScore || 50;
        let brentVal = parseFloat(brent.price);

        if (hurmuz.includes("KAPALI") || score > 85) {
            currentData.aiAnalysis = `🚨 KRİTİK SEVİYE: Hürmüz geçişindeki aksama küresel enerji, gıda (Buğday/Mısır) ve teknoloji (Lityum) arz zincirini kırmış durumda. Piyasada tam ölçekli panik ve güvenli liman (Altın/Gümüş) fiyatlaması hakim.`;
        } else if (hurmuz.includes("RİSK") || brentVal > 90 || score > 65) {
            currentData.aiAnalysis = `⚠️ YÜKSEK RİSK: Bölgedeki askeri hareketlilik navlun (BDRY) ve enerji fiyatlarını yukarı itiyor. Sanayi üretimi (Bakır/Demir) ve nükleer riskler (Uranyum) piyasa tarafından yakından takip ediliyor.`;
        } else {
            currentData.aiAnalysis = `ℹ️ İZLEME MODU: Hürmüz trafiği stabil. Emtia piyasaları (Enerji ve Gıda) şu an için sahada devam eden diplomatik ve askeri dengeleri temkinli bir şekilde fiyatlıyor.`;
        }

        currentData.lastUpdated = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        
        await store.setJSON("state", currentData);

        return { statusCode: 200, body: JSON.stringify({ success: true, message: "Sync Bot completed successfully" }) };
    } catch (error) { 
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) }; 
    }
};
