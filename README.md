# Stealth Leviathan — Private Whale Syndicate Dashboard

Kapalı devre erken aşama (ICO / Seed / Private) yatırım sendikası ve iç OTC ikincil piyasası için
framework'süz, bağımlılıksız (vanilla HTML/CSS/JS) dashboard. Tüm veriler `data/db.json` içindedir;
tüm hesaplamaları platform (engine) bu veriden türetir.

## Çalıştırma

```bash
cd stealth-leviathan
python3 -m http.server 8080      # veya: npx serve .
# → http://localhost:8080
```

> `file://` ile açarsanız tarayıcı `fetch` işlemini engeller; uygulama bu durumda sizden `db.json` dosyasını seçmenizi ister.

## Giriş (Members-only)

İçerik, giriş yapılmadan görüntülenmez. Kullanıcılar `data/db.json → auth.users[]` içinde tanımlıdır:

```json
"auth": {
  "sessionHours": 12,
  "maxAttempts": 5,
  "lockoutSeconds": 60,
  "users": [
    { "email": "mustafa@kontrolsoft.com", "password": "Aa102030-+", "name": "Mustafa", "memberId": "LVT-007", "role": "member" }
  ]
}
```

- Yeni kullanıcı için `users[]` dizisine bir kayıt ekleyin. Şifreyi düz metin yerine `"passwordSha256": "<hex>"` olarak da yazabilirsiniz.
- *Remember this device* işaretlenirse oturum tarayıcıda kalıcıdır; aksi halde sekme kapanınca biter. Oturum `sessionHours` sonunda düşer.
- `maxAttempts` hatalı denemeden sonra giriş `lockoutSeconds` kadar kilitlenir.
- Bir kullanıcının e-posta/şifresi değişirse o kullanıcının açık oturumları otomatik geçersiz olur.
- `auth` bloğunu silerseniz giriş ekranı devre dışı kalır.

> ⚠️ Bu, istemci tarafı bir demo kapısıdır: `db.json` herkese açık sunulduğu sürece dosya doğrudan indirilebilir.
> Canlıya çıkarken doğrulamayı sunucuya taşıyın ve kimlik bilgilerini JSON'dan çıkarın.

## Mimari

```
index.html              Uygulama kabuğu (sidebar, topbar, mobil tab-bar)
css/app.css             Dark / Luxury Gold-Slate tasarım sistemi + responsive kurallar
data/db.json            TEK VERİ KAYNAĞI (database mantığı)
js/utils.js             Format, tarih matematiği, DOM yardımcıları
js/auth.js              Giriş kapısı, oturum, hatalı deneme kilidi
js/engine.js            SAF iş mantığı — state alır, türetilmiş sayı döner (DOM yok, mutasyon yok)
js/store.js             State + action/reducer'lar + localStorage oturumu + JSON export/import
js/charts.js            Bağımlılıksız SVG grafikler (çizgi, yığılmış bar, donut, ring, derinlik)
js/components.js        Modal/bottom-sheet, toast, KPI kartı, rozetler
js/views/overview.js    A · Üst bar & makro KPI'lar (A–F), portföy grafiği, dağılım
js/views/portfolio.js   B · Aktif ICO'lar (kart/tablo, ring, claim, erken çıkış) + geçmiş
js/views/deals.js       C · Deal Room, talep/bütçe arayüzü, escrow'daki taahhütler
js/views/otc.js         D · P2P emir defteri, derinlik, Exit Simulator, onay modalı
js/views/analytics.js   E · 12 aylık vesting takvimi + Treasury raporu
js/app.js               Router, cross-view akışlar, ayarlar (demo tarihi, JSON)
```

**Veri akışı:** `db.json → store.state → engine (türetilmiş) → views (render)`
**Aksiyon akışı:** `UI → SL.app.act(type, payload) → store.dispatch → reducer → persist → re-render`
Başarısız aksiyonlar atomiktir: state değişmeden geri alınır.

## İş kuralları (engine.js)

| Kural | Formül |
|---|---|
| Vesting | TGE'de `tgePct`, sonra `cliffMonths` kilit, ardından `linearMonths` boyunca aylık eşit dilim. k. dilim: `TGE + cliff + k ay` |
| OTC'den alınan haklar | Kalan takvime pro-rata: `u(t) = T·(f(t)−f₀)/(1−f₀)` |
| Erken çıkış | `ceza = tutar × 0.20 → Treasury`, `tahtaya inen = tutar × 0.80`; kilitli haklar gelecekteki dilimlerden pro-rata düşülür |
| Mark fiyat | Diğer üyelerin en iyi alış emri (best bid) |
| Market sell | Bid tahtası yürünür; `slippage = 1 − VWAP / mark`; %5 üzeri slippage koruması |
| Limit sell | Ask olarak tahtaya düşer; iptalde net haklar geri döner, **ceza iade edilmez** |
| Realized PnL | Claim değeri + çıkış gelirleri − ilgili maliyet + kapanmış deal'ler |
| Overall ROI | `(güncel değer + toplam çekilen − toplam yatırılan) / toplam yatırılan` |
| Win rate | Çarpanı > 1x olan deal sayısı / toplam deal |
| Treasury | Cezaların `distributionRate` (%60) kadarı üyelere aktif taahhüt oranında dağıtılır |
| Deal durumu | `opensAt / closesAt` ile demo tarihine göre live / upcoming / closed otomatik |

## Demo verisi ekleme / düzenleme

- **Yeni deal:** `projects[]` içine `status: "live"` (veya `"upcoming"`), `opensAt`, `closesAt`, `tgeDate`, `vesting`, `totalPool`, `minAlloc`, `maxAlloc` ile bir kayıt ekleyin.
- **Yeni pozisyon:** `positions[]` içine `projectId`, `commitment`, `tokens`, `acquiredAt`, `source` (`primary`|`otc`) ve `events[]` (claim/exit) ekleyin. Projenin `status`'u `"vesting"` veya `"pre-tge"` olmalı.
- **Emir defteri:** `orderbooks.<projectId>.bids[]` / `asks[]` (asks için `grossTokens` = net / 0.8).
- **Kapanmış deal:** `history[]` — `commitment`, `entryPrice`, `avgExitPrice` yeterli; ROI otomatik hesaplanır.
- **Demo tarihi:** `meta.asOf` (null → gerçek bugün). Arayüzde ⚙ menüsünden zaman yolculuğu da yapılabilir.
- **Ceza oranı:** `meta.penaltyRate`. Slippage koruması: `meta.maxMarketSlippage`.

Oturumda yaptığınız işlemler (pledge, claim, exit, emirler) tarayıcıda saklanır. `db.json` değiştiğinde
oturum otomatik sıfırlanır. ⚙ → *Copy JSON / Download db.json* ile oturumu yeni baz veri olarak dışa aktarabilirsiniz.

## Notlar

- Proje isimleri, üyeler ve rakamlar tamamen kurgusaldır (demo).
- Cüzdan bağlantısı ve akıllı kontrat işlemleri simüle edilir; gerçek entegrasyon için `store.js` reducer'larını
  wagmi/viem çağrılarıyla değiştirmeniz yeterli — view'lar ve engine aynı kalır.
- Ölçek büyüdüğünde aynı katman ayrımı React/Next.js'e birebir taşınabilir (engine → hooks/selectors, store → Zustand/Redux).
