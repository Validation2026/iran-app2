const { getStore, connectLambda } = require('@netlify/blobs');
const Parser = require('rss-parser');

const parser = new Parser({
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
});

const defaultData = {
    version: "3.0.0",
    lastUpdated: "Henüz güncellenmedi",
    hurmuzStatus: "AÇIK / GÜVENLİ",
    aiAnalysis: "Sistem başlatılıyor...",
    market: { brent: 0, brentPct: 0, wti: 0, gold: 0, goldPct: 0, gas: 0, gasPct: 0, vix: 0, vixPct: 0, silver: 0, silverPct: 0, uranium: 0, uraniumPct: 0, shipping: 0, shippingPct: 0 },
    manual: { polyester: 1250, gubre: 480, jetFuel: 85.2, cds: 265 },
    mapStrikes: [],
    newsFeed: []
};

const geo_db = {
    // İRAN
    "Tahran": [35.68, 51.38, "il"], "İsfahan": [32.65, 51.66, "il"], "Natanz": [33.97, 51.92, "il"],
    "Tebriz": [38.07, 46.29, "il"], "Şiraz": [29.59, 52.58, "il"], "Buşehr": [28.92, 50.83, "il"],
    "Ahvaz": [31.31, 48.67, "il"], "Bender Abbas": [27.18, 56.28, "il"], "Meşhed": [36.26, 59.61, "il"],
    "Kerec": [35.83, 50.99, "il"], "Kum": [34.64, 50.87, "il"], "Hemedan": [35.19, 48.65, "il"],

    // İSRAİL
    "Tel Aviv": [32.08, 34.78, "ir"], "Kudüs": [31.76, 35.21, "ir"], "Hayfa": [32.79, 34.98, "ir"],
    "Eilat": [29.55, 34.95, "ir"], "Aşkelon": [31.66, 34.57, "ir"], "Aşdod": [31.80, 34.65, "ir"],
    "Safed": [32.96, 35.49, "ir"], "Dimona": [31.07, 35.02, "ir"], "Meron": [32.99, 35.41, "ir"],
    "Golan": [33.01, 35.75, "ir"], "Negev": [30.80, 34.84, "ir"],

    // LÜBNAN & SURİYE
    "Beyrut": [33.89, 35.50, "il"], "Dahiye": [33.85, 35.51, "il"], "Baalbek": [34.00, 36.21, "il"],
    "Şam": [33.51, 36.29, "il"], "Halep": [36.20, 37.13, "il"], "Deyrizor": [35.33, 40.14, "us"],

    // IRAK & YEMEN (KIZILDENİZ)
    "Bağdat": [33.31, 44.36, "us"], "Erbil": [36.19, 44.00, "ir"], 
    "Sanaa": [15.36, 44.19, "us"], "Hudeyde": [14.79, 42.95, "il"],
    "Kızıldeniz": [15.00, 41.50, "ir"], "Hürmüz": [26.56, 56.45, "ir"]
};

const jitter = (val) => val + (Math.random() * 0.1 - 0.05);

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
        // 1. HABER TARAMASI VE AKILLI LOKASYON BULUCU
        const queries = ["İran+saldırı", "İsrail+füze", "Lübnan+vuruldu", "Husiler+saldırdı", "Suriye+hava+harekatı"];
        let allNews = [];
        let strikes = [];

        // Botun haber başlıklarında arayacağı kelimeler (Genişletilmiş)
        const news_keywords = {
            "tahran": [35.68, 51.38, "il"], "isfahan": [32.65, 51.66, "il"], "iran": [35.68, 51.38, "il"],
            "tel aviv": [32.08, 34.78, "ir"], "kudüs": [31.76, 35.21, "ir"], "israil": [31.76, 35.21, "ir"],
            "beyrut": [33.89, 35.50, "il"], "lübnan": [33.89, 35.50, "il"], "hizbullah": [33.89, 35.50, "il"],
            "şam": [33.51, 36.29, "il"], "suriye": [33.51, 36.29, "il"], "halep": [36.20, 37.13, "il"],
            "sanaa": [15.36, 44.19, "us"], "yemen": [15.36, 44.19, "us"], "husi": [14.79, 42.95, "il"],
            "kızıldeniz": [15.00, 41.50, "ir"], "erbil": [36.19, 44.00, "ir"], "irak": [33.31, 44.36, "us"]
        };

        const jitter = (val) => val + (Math.random() * 0.2 - 0.1); // Haritada üst üste binmesin diye hafif kaydırma

        for (const q of queries) {
            try {
                const feed = await parser.parseURL(`https://news.google.com/rss/search?q=${q}&hl=tr&gl=TR&ceid=TR:tr`);
                feed.items.slice(0, 10).forEach(item => {
                    if (!allNews.find(n => n.title === item.title)) {
                        allNews.push({ title: item.title, link: item.link, date: item.isoDate });
                    }
                    
                    // Haberin başlığını küçük harfe çevirip kelime arıyoruz
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
                            break; // Bir haber için bir nokta yeterli
                        }
                    }
                });
            } catch (err) {}
        }

        allNews.sort((a, b) => new Date(b.date) - new Date(a.date));
        currentData.newsFeed = allNews.slice(0, 25);
        currentData.mapStrikes = strikes.slice(0, 15); // Haritayı çok boğmamak için en yeni 15 haberi haritaya bas

        // 2. FİNANSAL METRİKLER
        const [brent, wti, gold, gas, vix, silver, uranium, shipping] = await Promise.all([
            getTicker('BZ=F'), getTicker('CL=F'), getTicker('GC=F'), getTicker('TTF=F'), 
            getTicker('^VIX'), getTicker('SI=F'), getTicker('URA'), getTicker('BDRY')
        ]);

        currentData.market = {
            brent: brent.price, brentPct: brent.pct, wti: wti.price, gold: gold.price, goldPct: gold.pct,
            gas: gas.price, gasPct: gas.pct, vix: vix.price, vixPct: vix.pct, silver: silver.price, silverPct: silver.pct,
            uranium: uranium.price, uraniumPct: uranium.pct, shipping: shipping.price, shippingPct: shipping.pct
        };

        // 3. SENARYO TABANLI (KOLPA) YAPAY ZEKA MANTIĞI
        let hurmuz = currentData.hurmuzStatus || "AÇIK";
        let brentPrice = parseFloat(brent.price) || 0;
        let aiText = "";

        if (hurmuz.includes("KAPALI")) {
            aiText = `🚨 KRİTİK UYARI: Hürmüz Boğazı'nın kapalı olması küresel enerji arzını doğrudan tehdit ediyor. Brent petrol $${brentPrice} seviyelerinde fiyatlanırken, navlun ve tedarik zinciri şokları kaçınılmaz görünüyor.`;
        } else if (hurmuz.includes("RİSK") || brentPrice > 90 || parseFloat(vix.price) > 20) {
            aiText = `⚠️ YÜKSEK RİSK: Bölgedeki askeri hareketlilik enerji geçiş yollarını tehdit etmeye devam ediyor. VIX korku endeksi ve artan emtia fiyatları piyasadaki stresi yansıtıyor; güvenli liman (Altın/Gümüş) arayışı hızlandı.`;
        } else {
            aiText = `ℹ️ OLAĞAN SEYİR: Hürmüz Boğazı'nda deniz trafiği şu an normal işleyişinde. Piyasalar, brent petrolü yatay seviyelerde fiyatlarken sahadaki askeri ve diplomatik gelişmeleri temkinli bir şekilde izliyor.`;
        }

        currentData.aiAnalysis = aiText;
        currentData.lastUpdated = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

        await store.setJSON("state", currentData);

        return { statusCode: 200, body: JSON.stringify({ success: true, message: "Bot sync complete." }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
