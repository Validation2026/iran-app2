const { getStore, connectLambda } = require('@netlify/blobs');
const Parser = require('rss-parser');
const parser = new Parser({ headers: { 'User-Agent': 'Mozilla/5.0' } });

// FMP'den (Financial Modeling Prep) alınan ücretsiz API Anahtarını buraya gir
const FMP_API_KEY = "ZTSiaEyg5UdJYdcVyddu2xfKTr4FRwqS";

// FMP Spot / CFD Sembolleri (Birebir TradingView karşılıkları)
const tickers = {
    brent: 'BZUSD',      // Brent Petrol Spot
    gold: 'XAUUSD',      // Altın Spot
    silver: 'XAGUSD',    // Gümüş Spot
    usGas: 'NGUSD',      // Doğal Gaz Spot
    wheat: 'ZWUSD',      // Buğday
    corn: 'ZCUSD',       // Mısır
    copper: 'HGUSD',     // Bakır
    vix: '^VIX',         // Korku Endeksi
    uranium: 'URA',      // Uranyum Fonu
    lithium: 'LIT',      // Lityum Fonu
    shipping: 'BDRY',    // Navlun
    iron: 'TIOUSD'       // Demir
};

// Yeni ve Kesin Veri Çekme Fonksiyonu
async function fetchSpotData() {
    try {
        const symbolsStr = Object.values(tickers).join(',');
        
        // DÜZELTME 1: URL sonuna "&t=ZAMAN" ekleyerek Netlify'ın aynı URL'i önbellekten çağırmasını engelliyoruz
        const url = `https://financialmodelingprep.com/api/v3/quote/${symbolsStr}?apikey=${FMP_API_KEY}&t=${Date.now()}`;
        
        // DÜZELTME 2: Fetch ayarlarına "no-store" (asla kaydetme) emri veriyoruz
        const res = await fetch(url, {
            headers: {
                'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            cache: 'no-store'
        });
        
        const data = await res.json();
        const results = {};
        
        // FMP'den dönen veriyi bizim objeye eşle
        for (const [key, symbol] of Object.entries(tickers)) {
            const quote = data.find(q => q.symbol === symbol);
            if (quote) {
                results[key] = {
                    price: parseFloat(quote.price).toFixed(2),
                    pct: parseFloat(quote.changesPercentage).toFixed(2)
                };
            }
        }
        return results;
    } catch (e) {
        console.error("FMP API Hatası:", e);
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

        // PİYASA VERİLERİNİ GÜNCELLE
        const spotData = await fetchSpotData();
        
        if (spotData) {
            if (!currentData.market) currentData.market = {};
            for (const [key, data] of Object.entries(spotData)) {
                // Eğer admin panelinden OTO modundaysa (manuel kilitlenmemişse) güncelle
                if (!currentData.lockedMetrics || !currentData.lockedMetrics[key]) {
                    currentData.market[key] = data.price;
                    currentData.market[key + 'Pct'] = data.pct;
                }
            }
        }

        // HABER VE HARİTA VERİLERİ (Bozulmadan Bırakıldı)
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
                    if (!allNews.find(n => n.title === item.title)) allNews.push({ title: item.title, link: item.link, date: item.isoDate });
                    const titleLower = item.title.toLowerCase();
                    for (const [keyword, data] of Object.entries(news_keywords)) {
                        if (titleLower.includes(keyword)) {
                            strikes.push({ city: `🔴 CANLI: ${keyword.toUpperCase()}`, lat: jitter(data[0]), lon: jitter(data[1]), actor: data[2], title: item.title, link: item.link });
                            break;
                        }
                    }
                });
            } catch(e){}
        }
        currentData.newsFeed = allNews.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 25);
        currentData.mapStrikes = strikes.slice(0, 15);

        let hurmuz = currentData.hurmuzStatus || "AÇIK";
        let score = currentData.riskScore || 50;
        if (hurmuz.includes("KAPALI") || score > 85) currentData.aiAnalysis = `🚨 KRİTİK SEVİYE: Hürmüz geçişindeki aksama küresel enerji, gıda ve sanayi arz zincirini kırmış durumda. Piyasada tam ölçekli panik ve güvenli liman fiyatlaması hakim.`;
        else if (hurmuz.includes("RİSK") || score > 65) currentData.aiAnalysis = `⚠️ YÜKSEK RİSK: Bölgedeki askeri hareketlilik navlun ve enerji fiyatlarını yukarı itiyor. Emtia piyasaları teyakkuz halinde.`;
        else currentData.aiAnalysis = `ℹ️ İZLEME MODU: Hürmüz trafiği stabil. Piyasalar sahadaki askeri ve diplomatik gelişmeleri temkinli bir şekilde izliyor.`;

        currentData.lastUpdated = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
        await store.setJSON("state", currentData);

        return { statusCode: 200, body: JSON.stringify({ success: true, method: "FMP Spot with No-Cache" }) };
    } catch (error) { return { statusCode: 500, body: JSON.stringify({ error: error.message }) }; }
};
