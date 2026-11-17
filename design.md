# Panduan Desain Sistem Antarmuka (Design System & Specification)
## Simulasi Edukasi Mitigasi Erupsi Gunung Semeru
**Dokumen Desain Terpadu (UI-1, UI-2, UI-3) — Versi Revisi Final**

---

## 1. Ringkasan Eksekutif & Filosofi Desain

Aplikasi **Simulasi Edukasi Mitigasi Erupsi Gunung Semeru** merupakan media pembelajaran interaktif berbasis web yang memanfaatkan teknologi *Computer Vision* (MediaPipe Pose & Hand Landmark Detection) untuk mendeteksi gestur tubuh pengguna dalam merespons tahapan evakuasi bencana vulkanik.

Desain antarmuka ini mengintegrasikan tiga layar utama (**UI-1**, **UI-2**, dan **UI-3**) menjadi satu kesatuan sistem visual yang konsisten, estetis, bebas tumpang tindih (*zero component overlapping*), dan ergonomis:

1. **Clean Volcanic Aesthetic**: Menggabungkan warna oranye vulkanik hangat (*safety volcanic orange* `#EA580C` & `#F97316`) sebagai warna aksen dan identitas kebencanaan, dipadukan dengan latar belakang lanskap Gunung Semeru yang dinamis.
2. **Full Glassmorphism Container**: Seluruh blok konten teks pada layar pembuka (UI-1) dan penutup (UI-3) dibungkus dalam kartu *frosted glass* semi-transparan (`rgba(255, 255, 255, 0.92)` dengan `backdrop-filter: blur(20px)` dan border halus) sehingga seluruh tipografi memiliki kontras tinggi dan terbaca jelas di atas video apa pun tanpa distorsi visual.
3. **Ergonomis, Non-Overlapping Grid Layout**: Area simulasi interaktif (UI-2) mengadopsi tata letak horizontal terstruktur (*Horizontal Responsive Grid*) di area bawah layar. Kartu Informasi Bahaya (*Hazard Card*) dan Bilah Kontrol Gestur (*Gesture Controller*) berdampingan secara rapi tanpa pernah saling bertumpukan.
4. **Konsistensi Label & Stepper**: Penulisan setiap tahapan evakuasi menggunakan format *Title Case* yang konsisten (`Start`, `Zona 1`, `Zona 2`, `Zona 3`, `Zona Aman`). Indikator centang (`✓`) **hanya muncul** pada tahapan yang telah selesai dilewati (*completed*), bukan pada tahapan yang belum dilakukan.
5. **Tipografi Tunggal yang Bersih**: Seluruh antarmuka menggunakan font tunggal **Poppins** untuk memastikan keselarasan dan keterbacaan modern.

---

## 2. Palet Warna (Color Palette)

| Kategori Warna | Kode Hex | Nilai RGB | Penggunaan Utama |
| :--- | :--- | :--- | :--- |
| **Primary Lava Orange** | `#EA580C` | `rgb(234, 88, 12)` | Pill aktif pada stepper, tombol aksi utama, ring timer, indikator bahaya |
| **Volcanic Tangerine** | `#F97316` | `rgb(249, 115, 22)` | Badge "SIMULASI EDUKASI", ikon gestur, aksen gradasi |
| **Amber Warning** | `#F59E0B` | `rgb(245, 158, 11)` | Badge peringatan KRB II, status siaga, indikator jarak |
| **Safe Emerald** | `#10B981` | `rgb(16, 185, 129)` | Progress bar pengisian gestur, status sukses, indikator centang hijau |
| **Deep Forest Green** | `#059669` | `rgb(5, 150, 105)` | Status zona aman, verifikasi pengguna menghadap layar |
| **Peach / Cream Tint** | `#FFEDD5` | `rgb(255, 237, 213)` | Latar belakang kontainer ikon gestur, badge bahaya, highlight |
| **Soft Peach Glow** | `#FFF7ED` | `rgb(255, 247, 237)` | Kontainer arah sebaran lahar/awan panas, border glow |
| **Charcoal Navy (Text)**| `#0F172A` | `rgb(15, 23, 42)` | Tipografi judul utama, angka hitung mundur, teks label tebal |
| **Slate Gray (Subtext)**| `#475569` | `rgb(71, 85, 105)` | Teks deskripsi materi, instruksi sekunder, label netral |
| **Light Slate Border** | `#E2E8F0` | `rgb(226, 232, 240)` | Garis pembatas kartu, track progress bar, separator |
| **Glass White Card** | `rgba(255, 255, 255, 0.92)` | `hsla(0, 0%, 100%, 0.92)` | Kartu pembungkus hero landing, kartu cooldown, surface HUD |
| **Dark HUD Surface** | `rgba(11, 15, 25, 0.92)` | `hsla(223, 39%, 7%, 0.92)` | Card kamera MediaPipe, skeleton stream container |
| **Skeleton Cyan/Mint** | `#00FF99` & `#00CCFF` | `rgb(0, 255, 153)` | Garis skeleton pose tubuh & titik landmark tangan |

---

## 3. Sistem Tipografi (Poppins)

Sesuai arahan desain, seluruh bagian antarmuka menggunakan keluarga font **Poppins**:

* **Keluarga Font**: `'Poppins', sans-serif`
* **Google Fonts CDN**: `https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap`

### Hierarki Teks:
* **Eyebrow / Badge Label**:
  * Ukuran: `11px – 12px`
  * Ketebalan: `700 (Bold)`
  * Transformasi: `Uppercase`
  * Letter Spacing: `1.2px`
  * Contoh: `SIMULASI EDUKASI`, `KRB II • ZONA BAHAYA MENENGAH`, `PERINTAH GESTUR`
* **Hero Headline**:
  * Ukuran: `32px – 40px` (responsif)
  * Ketebalan: `800 (Extra Bold)`
  * Warna: `#0F172A`
  * Contoh: `Mitigasi Erupsi Gunung Semeru`, `Terima Kasih!`
* **Card Heading / Sub-headline**:
  * Ukuran: `18px – 22px`
  * Ketebalan: `700 (Bold)`
  * Contoh: `Zona 2 — Awan Panas`, `Angkat Dua Jari untuk Memulai`
* **Body / Paragraf Edukasi**:
  * Ukuran: `13px – 14.5px`
  * Ketebalan: `400 (Regular)` & `500 (Medium)`
  * Line Height: `1.5 – 1.6`
  * Warna: `#475569`
* **Countdown Digit**:
  * Ukuran: `46px – 50px`
  * Ketebalan: `800 (Extra Bold)`
  * Warna: `#0F172A`
  * Contoh: Angka `20` detik pada lingkaran timer murni

---

## 4. Spesifikasi Komponen & Penanganan Masalah Tampilan

### 4.1. UI-1: Layar Awal (Landing Screen)
* **Glassmorphism Central Card**: Seluruh elemen teks utama dibungkus dalam kartu kaca buram terpusat (`background: rgba(255, 255, 255, 0.92); backdrop-filter: blur(20px); border-radius: 28px; padding: 36px 40px; box-shadow: 0 16px 40px rgba(0,0,0,0.12)`). Hal ini memastikan teks tidak tenggelam dalam latar belakang pemandangan.
* **Logo Gunung**: Dihilangkan secara bersih agar tampilan lebih minimalis dan fokus langsung ke instruksi interaktif.
* **Badge Kategori**: Pill oranye `SIMULASI EDUKASI`.
* **Judul & Deskripsi**: Menggunakan font Poppins dengan kontras tajam.
* **Kartu CTA Gestur**:
  * Ikon tangan dua jari (*Peace Sign*).
  * Judul: `Angkat Dua Jari untuk Memulai`.
  * Deskripsi: `Hadapkan telapak tangan ke kamera dan tahan selama 2 detik hingga terdeteksi.`
  * Cincin aksi lingkaran indikator progres.
* **Bottom Toolbar**: Bilah kaca mengambang memuat 3 instruksi (*Gunakan Kamera*, *Ikuti Instruksi Gestur*, *Sesuaikan Jarak & Posisi*).

---

### 4.2. UI-2: Layar Simulasi Aktif (Hazard Simulation)
* **Konsistensi Top Stepper**:
  * Format teks konsisten: `Start` › `Zona 1` › `Zona 2` › `Zona 3` › `Zona Aman`.
  * **Aturan Centang**: Ikon centang (`✓`) disembunyikan secara *default* (`display: none`). Ikon centang hanya ditampilkan saat langkah memiliki kelas `.completed`.
  * Langkah aktif ditandai dengan pill oranye cerah (`background: #EA580C; color: white`).
* **Top-Right Vision HUD**:
  * Widget kamera MediaPipe minimalis (`720p • 30fps`, garis skeleton `#00FF99`).
  * Chip telemetri jarak dan posisi menghadap layar.
* **Tata Letak Bebas Tumpukan (Horizontal Bottom Grid)**:
  * Menggunakan kontainer grid horizontal:
    ```css
    .simulation-bottom-grid {
        position: absolute;
        bottom: 24px;
        left: 28px;
        right: 28px;
        display: grid;
        grid-template-columns: 420px 1fr;
        gap: 20px;
        align-items: end;
        z-index: 20;
    }
    ```
  * **Kolom Kiri**: *Educational Hazard Card* (Badge KRB, Judul Zona, Radius bahaya, Deskripsi ilmiah, Tindakan Cepat, dan Arah Sebaran).
  * **Kolom Kanan**: *Gesture Controller Bar* (Avatar gestur siluet, Perintah gestur, Durasi penahanan, dan Progress Bar hijau toska).
  * **Hasil**: Kedua komponen berada berdampingan pada baris bawah tanpa saling tumpang tindih.

---

### 4.3. UI-3: Layar Selesai (Completion & Cooldown)
* **Glassmorphism Central Card**: Membungkus teks `SIMULASI SELESAI`, `Terima Kasih!`, deskripsi hitung mundur, dan lingkaran timer ke dalam kartu kaca terpadu.
* **Timer Lingkaran Murni (Clean Circular Timer)**:
  * Lingkaran timer SVG presisi (radius 66, keliling 414.7).
  * Efek ornamen percikan (*splash/sparkles*) di samping lingkaran **dihapus seutuhnya**, mempertahankan hanya lingkaran progres oranye dan angka hitung mundur yang bersih.
* **Kartu Siaga Bawah**: Memuat pesan mitigasi kesiapsiagaan dan tombol mulai ulang.

---

### 4.4. Penempatan Toolbar Pengujian / Demo (Collapsible Menu — Zero Overlap)
* Toolbar kontrol demo (`Kamera`, `Audio`, `Pilihan Jarak`, dan `Lewati Gestur`) dirancang sebagai **tombol menu lipat (*collapsible dropdown*)** di sudut kiri atas (`top: 18px; left: 20px`).
* Dalam keadaan *default*, kontrol ini hanya berupa tombol pill kecil (`[⚙️ Demo]`, lebar ~76px), sehingga menyisakan ratusan piksel ruang kosong terhadap bilah stepper tengah (*Top Stepper*) dan tidak pernah bertumpukan.
* Saat ditekan atau dengan menekan tombol keyboard `[D]`, menu akan membuka popover vertikal ke bawah yang rapi tanpa menyentuh komponen interaksi lainnya.

---

### 4.5. Pencegahan Overflow & Pengaturan Margin
* Seluruh viewport dibatasi pada `width: 100vw; height: 100vh; max-height: 100vh; overflow: hidden;`.
* Menggunakan `box-sizing: border-box` pada semua elemen.
* Jarak aman tepi layar (*safe margins*) minimal `24px` di semua sisi, dengan ukuran elemen berbasis persentase fleksibel dan `min()` / `clamp()`.

---

## 5. Alur Tahapan Edukasi & Pemetaan Gestur

```
[UI-1: LANDING]
   │  Gestur: Dua Jari (Peace Sign) - Tahan 2 detik
   ▼
[BRIEFING EVAKUASI]
   │  Video Pembekalan Evakuasi (briefing.mp4)
   │  Gestur: Jempol ke Atas (Thumbs Up) - Tahan 2 detik
   ▼
[ERUPSI GUNUNG SEMERU]
   │  Video Erupsi Letusan Awal (gunung_meletus.mp4) - Peringatan Darurat
   ▼
[UI-2: ZONA 1 - LONTARAN MATERIAL] (KRB III, Radius ≤ 5 km)
   │  Video: lontaran_material.mp4
   │  Tindakan Cepat: Lindungi kepala dari batu pijar & abu vulkanik
   │  Gestur: Angkat Kedua Tangan di Atas Kepala - Tahan 5 detik
   ▼
[UI-2: ZONA 2 - AWAN PANAS GUGURAN] (KRB II, Radius ≤ 13 km)
   │  Video: awan_panas.mp4
   │  Tindakan Cepat: Jauhi aliran piroklastik Besuk Kobokan, evakuasi horizontal
   │  Gestur: Arahkan Satu Tangan ke Kanan - Tahan 5 detik
   ▼
[UI-2: ZONA 3 - LAHAR HUJAN] (KRB I, Radius ≤ 17 km)
   │  Video: lahar_hujan.mp4
   │  Tindakan Cepat: Menjauh dari daerah aliran sungai & jembatan rentan
   │  Gestur: Silangkan Kedua Tangan di Depan Dada (Crossed Arms) - Tahan 5 detik
   ▼
[ZONA AMAN - POSKO PENGUNGSIAN] (Radius > 20 km)
   │  Video: zona_aman.mp4
   │  Tindakan Cepat: Berkumpul di posko aman, laporkan diri ke petugas
   │  Gestur: Lambaikan Tangan (Wave)
   ▼
[UI-3: SELESAI / COOLDOWN]
   │  Hitung mundur 20 detik (Clean Circular Progress Clock)
   ▼
[RESET OTOMATIS KE UI-1]
```
