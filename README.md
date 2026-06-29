# ARNOULD · Antrenman Takvimi

Spor temalı, takvim tabanlı antrenman planlama uygulaması. Her gün için yapılacak
hareketler; set, tekrar, çalışılan bölge ve tahmini süre bilgisiyle birlikte
saklanır. Dahili geri sayım aracı, koyu/aydınlık tema ve gün üzerine tıklayınca
açılan pop-up düzenleyici içerir.

Uygulama bir **PWA**'dır: telefona kurulabilir, tam ekran ve **çevrimdışı** çalışır.

## Çalıştırma

Kurulum gerektirmez — saf HTML/CSS/JS. Tüm veriler tarayıcıda (`localStorage`)
saklanır.

**En kolay yol:** `index.html` dosyasına çift tıklayın, tarayıcıda açılır.

**Yerel sunucu ile (önerilir):**

```bash
cd ARNOULD
python3 -m http.server 8123
# Tarayıcıda: http://localhost:8123
```

## Özellikler

- **Ay / Hafta görünümü** — Pazartesi başlangıçlı takvim, bugün vurgusu.
- **Gün pop-up'ı** — bir güne tıklayınca açılır; hareket ekle / düzenle / sil,
  antrenman adı ver, "Tamamlandı" işaretle.
- **Hareket bilgileri** — ad, bölge (Göğüs, Sırt, Omuz, Kol, Bacak, Karın/Core,
  Kardiyo, Tüm Vücut), set, tekrar, tahmini süre (dk), not.
- **Otomatik özet** — gün ve dönem (ay/hafta) için toplam hareket, set, süre ve
  tamamlanma oranı.
- **Geri sayım aracı** — dairesel halkalı geri sayım + kronometre. Hazır süreler,
  özel süre, +15 sn, bitişte sesli/titreşimli uyarı. Sekme arka plandayken de
  çalışmaya devam eder.
- **Koyu / Aydınlık tema** — tek tıkla, tercih kaydedilir.
- **Veri yönetimi** — JSON olarak dışa/içe aktarma (yedekleme), örnek program
  yükleme, tüm verileri sıfırlama. İlk açılışta örnek bir haftalık program (İtiş /
  Çekiş / Bacak / Üst Vücut / Kardiyo) otomatik yüklenir.

## Mobil (PWA) kurulum

PWA, **güvenli bağlam** (HTTPS veya `localhost`) gerektirir. İki yol:

**a) Telefona kurmak için (önerilen):** projeyi ücretsiz bir statik sunucuda
yayınlayın (örn. Netlify / Vercel / GitHub Pages — sürükle-bırak yeterli). HTTPS
adresi telefonda açılınca:

- **iPhone (Safari):** Paylaş → **Ana Ekrana Ekle**.
- **Android (Chrome):** menü → **Uygulamayı yükle** / **Ana ekrana ekle**.

Kurulduktan sonra tam ekran açılır ve **internetsiz** çalışır (ilk açılışta her şey
önbelleğe alınır).

**b) Masaüstünde denemek için:** `http://localhost:8123` adresinde Chrome adres
çubuğundaki **yükle** simgesiyle kurabilirsiniz.

> Not: `file://` ile açıldığında uygulama çalışır ama service worker (çevrimdışı /
> kurulum) yalnızca HTTPS / localhost üzerinde etkinleşir.

## Dosya yapısı

```
ARNOULD/
├── index.html              # İskelet, modallar, PWA meta + SW kaydı
├── manifest.webmanifest    # PWA manifesti (ad, ikonlar, tema)
├── sw.js                   # Service worker (çevrimdışı önbellek)
├── css/styles.css          # Tasarım sistemi + koyu/aydınlık tema + safe-area
├── icons/                  # PWA ikonları (192 / 512 / maskable / apple-touch)
├── tools/make-icons.js     # İkonları yeniden üreten yardımcı (node)
└── js/
    ├── store.js            # Veri modeli + localStorage
    ├── timer.js            # Geri sayım / kronometre
    ├── ui.js               # Takvim, hafta, istatistik, modal render
    └── app.js              # Başlatma, olaylar, örnek program
```

İkonları değiştirmek isterseniz `tools/make-icons.js` içindeki marka/renkleri
düzenleyip `node tools/make-icons.js` çalıştırın.

## Veri saklama

Tüm program `localStorage` içinde `arnould.gym.v1` anahtarında tutulur. Tarayıcı
verisini temizlerseniz program da silinir — düzenli olarak **Menü → Dışa Aktar**
ile yedek almanız önerilir.

## Sürüm güncelleme

Uygulama dosyalarını değiştirdiğinizde service worker **ağ-önce** çalıştığı için
çevrimiçiyken en güncel sürümü gösterir. Yine de garanti olması için `sw.js`
içindeki `CACHE` adını yükseltin (örn. `arnould-v2` → `arnould-v3`).
