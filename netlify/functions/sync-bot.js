const { getStore, connectLambda } = require('@netlify/blobs');
const Parser = require('rss-parser');

const parser = new Parser({ headers: { 'User-Agent': 'Mozilla/5.0' } });

// Yahoo Chart API URL (Daha yüksek doğruluk için)
const YAHOO_CHART_URL = "https://query2.finance.yahoo.com/v8/finance/chart/";

async function fetchYahooDirect(symbol) {
    try {
        const url = `${YAHOO_CHART_URL}${symbol}?range=1d&interval=1m&includePrePost=false`;
        const res = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
        });
        const data = await res.json();
        
        if (!data.chart || !data.chart.result) return null;
        
        const meta = data.chart.result[0].meta;
        const current = meta.regularMarketPrice;
        const prev = meta.previousClose || meta.chartPreviousClose;
        const pct = (((current - prev) / prev) * 100).toFixed(2);

        return {
            price: parseFloat(current).toFixed(2),
            pct: pct
        };
    } catch (e) {
        console.error(`Veri çekme hatası (${symbol}):`, e.message);
        return null;
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
        if (!currentData) return { statusCode: 404, body: "State not found" };

        // 1. HABER TARAMASI
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
                                lat: jitter(data[0]), lon: jitter(data[1]), actor: data[2], 
                                title: item.title, link: item.link 
                            });
                            break;
                        }
                    }
                });
            } catch (err) {}
        }
        currentData.newsFeed = allNews.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 25);
        currentData.mapStrikes = strikes.slice(0, 15);

        // 2. DOĞRU PİYASA VERİLERİ (Hata alanlar eskiyi korur)
        // Brent Petrol için CO=F (ICE Brent) kontratı TradingView ile daha uyumludur.
        const tickers = {
            brent: 'CO=F', gold: 'GC=F', gas: 'TTF=F', vix: '^VIX', 
            silver: 'SI=F', uranium: 'URA', shipping: 'BDRY', wheat: 'ZW=F', 
            corn: 'ZC=F', copper: 'HG=F', lithium: 'LIT', iron: 'TIO=F', usGas: 'NG=F'
        };

        const marketResults = await Promise.all(
            Object.entries(tickers).map(async ([key, sym]) => ({ key, data: await fetchYahooDirect(sym) }))
        );

        marketResults.forEach(({ key, data }) => {
            if (data) {
                currentData.market[key] = data.price;
                currentData.market[key + 'Pct'] = data.pct;
            }
        });

        // 3. ANALİZ MANTIĞI
        let hurmuz = currentData.hurmuzStatus || "AÇIK";
        let score = currentData.riskScore || 50;
        if (hurmuz.includes("KAPALI") || score > 85) {
            currentData.aiAnalysis = `🚨 KRİTİK SEVİYE: Hürmüz geçişindeki aksama küresel enerji ve gıda arz zincirini kırmış durumda. Piyasada tam ölçekli panik ve güvenli liman fiyatlaması hakim.`;
        } else if (hurmuz.includes("RİSK") || score > 65) {
            currentData.aiAnalysis = `⚠️ YÜKSEK RİSK: Bölgedeki askeri hareketlilik navlun ve enerji fiyatlarını yukarı itiyor. Emtia piyasaları teyakkuz halinde.`;
        } else {
            currentData.aiAnalysis = `ℹ️ İZLEME MODU: Hürmüz trafiği stabil. Piyasalar sahadaki askeri ve diplomatik gelişmeleri temkinli bir şekilde izliyor.`;
        }

        currentData.lastUpdated = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        await store.setJSON("state", currentData);

        return { statusCode: 200, body: JSON.stringify({ success: true }) };
    } catch (error) { 
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) }; 
    }
};
