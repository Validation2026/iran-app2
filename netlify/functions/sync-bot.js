const { getStore } = require('@netlify/blobs');
const Parser = require('rss-parser');
const parser = new Parser({ headers: { 'User-Agent': 'Mozilla/5.0' } });

exports.handler = async function(event) {
    try {
        // 1. GÜVENLİ PIN KONTROLÜ (Base64 Çözücü Eklendi)
        if (event.httpMethod === "POST" && event.body) {
            let payload = event.body;
            // Netlify bazen veriyi şifreli gönderir, onu çözüyoruz
            if (event.isBase64Encoded) {
                payload = Buffer.from(event.body, 'base64').toString('utf-8');
            }
            
            const body = JSON.parse(payload);
            if (body.pin !== "isedes") {
                return { statusCode: 403, body: JSON.stringify({ error: "Gerçekten Yanlış PIN girdin." }) };
            }
        }

        // 2. YAHOO FINANCE PAKETİNİ MODERN YÖNTEMLE DİNAMİK OLARAK ÇAĞIR (Çökme Sebebi Çözüldü)
        const yahooFinanceModule = await import('yahoo-finance2');
        const yahooFinance = yahooFinanceModule.default;

        const tickers = {
            brent: 'BZ=F',       
            gold: 'XAU=X',       
            silver: 'XAG=X',     
            usGas: 'NG=F',       
            wheat: 'ZW=F',       
            corn: 'ZC=F',        
            copper: 'HG=F',      
            vix: '^VIX',         
            uranium: 'URA',      
            lithium: 'LIT',      
            shipping: 'BDRY',    
            iron: 'TIO=F',       
            gas: 'TTF=F'         
        };

        // 3. VERİTABANI BAĞLANTISI
        const store = getStore("iran-risk");
        let currentData = await store.get("state", { type: "json" });
        if (!currentData) return { statusCode: 404, body: JSON.stringify({ error: "Veritabanı bulunamadı." }) };
        if (!currentData.market) currentData.market = {};

        // 4. TOPLU PİYASA ÇEKİMİ (Çökmeyi Önler)
        const symbolsToFetch = [];
        const symbolToKey = {};

        for (const [key, symbol] of Object.entries(tickers)) {
            if (!currentData.lockedMetrics || !currentData.lockedMetrics[key]) {
                symbolsToFetch.push(symbol);
                symbolToKey[symbol] = key; 
            }
        }

        if (symbolsToFetch.length > 0) {
            try {
                const quotes = await yahooFinance.quote(symbolsToFetch);
                const quoteArray = Array.isArray(quotes) ? quotes : [quotes];
                
                for (const q of quoteArray) {
                    const key = symbolToKey[q.symbol];
                    if (key && q.regularMarketPrice !== undefined) {
                        currentData.market[key] = parseFloat(q.regularMarketPrice).toFixed(2);
                        currentData.market[key + 'Pct'] = parseFloat(q.regularMarketChangePercent || 0).toFixed(2);
                    }
                }
            } catch (e) {
                console.log("[UYARI] Yahoo Finance Hatası:", e.message);
            }
        }

        // 5. HABER VE HARİTA VERİLERİ
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

        return { statusCode: 200, body: JSON.stringify({ success: true, message: "Bot başarıyla çalıştı!" }) };

    } catch (error) {
        // EĞER SİSTEM YİNE ÇÖKERSE, hatanın TAM OLARAK ne olduğunu konsola ve ekrana basacak.
        return { statusCode: 500, body: JSON.stringify({ error: "Sistem Çöktü: " + error.message }) };
    }
};
