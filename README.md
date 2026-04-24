# 🌲 KROI Rezervime — Sistema e Rezervimeve Online

Sistem i plotë rezervimesh për **KROI Agroturizëm & Restorant** me Node.js, Express dhe MySQL.

---

## 📦 Struktura e Projektit

```
kroi-rezervime/
├── server.js              ← API serveri kryesor
├── database.sql           ← Skema SQL + të dhëna fillestare
├── .env.example           ← Template për konfigurimin
├── package.json
└── public/
    ├── rezervimi-tavolina.html   ← Faqja e tavolinave
    └── rezervimi-kabina.html     ← Faqja e kabinave
```

---

## 🚀 Instalimi (Hap pas Hapi)

### 1. Kërkesa
- Node.js (v16+)
- MySQL/MariaDB aktiv në XAMPP ose si shërbim Windows
- npm

### 2. Instalo varësitë
```bash
cd kroi-rezervime
npm install
```

### 3. Krijo databazën
Hap **phpMyAdmin** (ose MySQL Workbench) dhe ekzekuto:
```
database.sql
```
Kjo krijon databazën `kroi_rezervime` me të gjitha tabelat dhe kabinat/tavolinat.

### 4. Konfiguro .env
```bash
copy .env.example .env
```
Hap `.env` dhe vendos:
```
DB_HOST=127.0.0.1
DB_USER=root
DB_PASS=fjalëkalimi_yt  ← lëre bosh nëse nuk ka
DB_NAME=kroi_rezervime
PORT=3030
```

### 5. Niso serverin
```bash
node server.js
```

Serveri do të ngjitet në:
- **Tavolina** → http://localhost:3030/
- **Kabina**   → http://localhost:3030/kabina

---

## 🌐 Akses nga rrjeti lokal (LAN)

Nëse server-i është p.sh. në `172.16.101.220`:
- Tavolina: `http://172.16.101.220:3030/`
- Kabina:   `http://172.16.101.220:3030/kabina`

Kontrollo Windows Firewall — lejo portin **3030**.

---

## 🔌 API Endpoints

### Tavolina
| Metoda | URL | Përshkrim |
|--------|-----|-----------|
| GET | `/api/tavolina/disponueshme?data=&ora=` | Listo tavolinat me status live |
| POST | `/api/tavolina/rezervo` | Krijo rezervim |
| GET | `/api/tavolina/rezervimet?data=` | Lista e rezervimeve (admin) |
| DELETE | `/api/tavolina/rezervimet/:id` | Anulo rezervim |

### Kabina
| Metoda | URL | Përshkrim |
|--------|-----|-----------|
| GET | `/api/kabina/disponueshme?check_in=&check_out=` | Listo kabinat me status live |
| POST | `/api/kabina/rezervo` | Krijo rezervim |
| GET | `/api/kabina/rezervimet` | Lista e rezervimeve (admin) |
| DELETE | `/api/kabina/rezervimet/:id` | Anulo rezervim |

---

## ⚙️ Funksionaliteti

- ✅ Rezervimet ruhen menjëherë në databazë
- ✅ Tavolinat/kabinat bëhen **E zënë** automatikisht pas rezervimit
- ✅ **Auto-refresh çdo 30 sekonda** — nëse dikush rezervon nga shfletuesi tjetër, harta rifresohet
- ✅ Kontrolli i konfliktit të orës për tavolina (2 orë slot)
- ✅ Kontrolli i mbivendosjes së datave për kabina
- ✅ Toast notifications për feedback
- ✅ Modal konfirmimi me ID rezervimi

---

## 🔄 Për ta nisur si shërbim (opsional)

Instalo `pm2` për ta mbajtur serverin aktiv edhe pas rinisjeve:
```bash
npm install -g pm2
pm2 start server.js --name kroi-rezervime
pm2 startup
pm2 save
```

---

## 📝 Shënime

- Durimi i tavolinave: **2 orë** nga ora e rezervimit
- Anulimi i kabinave: **falas deri 48 orë** para check-in (politikë, nuk zbatohet automatikisht)
- Të gjitha të dhënat ruhen me **utf8mb4** për karakteret shqipe (ë, ç, etj.)
