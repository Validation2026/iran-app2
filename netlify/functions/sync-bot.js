const { getStore } = require('@netlify/blobs');
const Parser = require('rss-parser');
const yahooFinance = require('yahoo-finance2').default;
const fs = require('fs');
const path = require('path');

const parser = new Parser();

// Harita için şehirler ve koordinatları
const geo_db = {
    "Tahran": [35.68, 51.38, "il"], "İsfahan": [32.65, 51.66, "il"],
    "Tebriz": [38.07, 46.29, "il"], "Kum": [34.64, 50.87, "il"],
    "Tel Aviv": [32.08, 34.78, "ir"], "Kudüs": [31.76, 35.21, "ir"],
    "Hayfa": [32.79, 34.98, "ir"], "Beyrut": [33.89, 35.50, "il"],
    "Şam": [33.51, 36.29, "il"], "Sanaa": [15.36, 44.19, "us"]
};

// Noktaların üst üste binmemesi için hafif kaydırma (jitter)
const jitter = (val) => val + (Math.random() * 0.1 - 0.05);

exports.handler = async function(event) {
    // Manuel tetiklenmişse PIN kontrolü yap
    if (event.body) {
        const body = JSON.parse(event.body);
        if (body.pin !== "isedes") return { statusCode: 403, body: "Unauthorized" };
    }

    try {
        const store = getStore("iran-risk");
        const fallbackData = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../data.json'), 'utf8'));
        let currentData = await store.get("state", { type: "json" }) || fallbackData;

        // 1. HABER TARAMASI (RSS)
        const queries = ["İran+saldırı", "İsrail+füze", "Lübnan+vuruldu"];
        let allNews = [];
        let strikes = [];

        for (const q of queries) {
            const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${q}&hl=tr&gl=TR&ceid=TR:tr`);
            
            feed.items.slice(0, 10).forEach(item => {
                // Haberi feed listesine ekle
                if (!allNews.find(n => n.title === item.title)) {
                    allNews.push({ title: item.title, link: item.link, date: item.isoDate });
                }

                // Haberin içinde şehir adı geçiyor mu kontrol et -> Haritaya ekle
                for (const [city, data] of Object.entries(geo_db)) {
                    if (item.title.toLowerCase().includes(city.toLowerCase())) {
                        strikes.push({
                            city: city,
                            lat: jitter(data[0]),
                            lon: jitter(data[1]),
                            actor: data[2], // il, ir, us
                            title: item.title,
                            link: item.link
                        });
                        break;
                    }
                }
            });
        }

        // Haberleri tarihe göre sırala ve son 25'i al
        allNews.sort((a, b) => new Date(b.date) - new Date(a.date));
        currentData.newsFeed = allNews.slice(0, 25);
        currentData.mapStrikes = strikes;

        // 2. YFİNANCE İLE PİYASA VERİLERİNİ ÇEKME
        const getMarket = async (symbol) => {
            try {
                const quote = await yahooFinance.quote(symbol);
                return { 
                    price: quote.regularMarketPrice ? quote.regularMarketPrice.toFixed(2) : 0, 
                    pct: quote.regularMarketChangePercent ? quote.regularMarketChangePercent.toFixed(2) : 0 
                };
            } catch (e) { return { price: 0, pct: 0 }; }
        };

        const [brent, wti, gold, gas, vix] = await Promise.all([
            getMarket('BZ=F'), // Brent
            getMarket('CL=F'), // WTI
            getMarket('GC=F'), // Gold
            getMarket('TTF=F'), // Gas (veya NG=F)
            getMarket('^VIX')  // VIX
        ]);

        currentData.market = {
            brent: brent.price, brentPct: brent.pct,
            wti: wti.price,
            gold: gold.price, goldPct: gold.pct,
            gas: gas.price, gasPct: gas.pct,
            vix: vix.price, vixPct: vix.pct
        };

        currentData.lastUpdated = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

        // Veriyi Kaydet
        await store.setJSON("state", currentData);

        return { statusCode: 200, body: JSON.stringify({ success: true, message: "Bot sync complete." }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
