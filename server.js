require('dotenv').config();
// ============================================
// KROI Rezervime - Server API v4
// Sistem kërkese (pritje → aktive/anuluar)
// ============================================
const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');
const path    = require('path');
const multer  = require('multer');
const XLSX    = require('xlsx');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3030;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Database ─────────────────────────────────
const db = mysql.createPool({
  host:               process.env.DB_HOST || '127.0.0.1',
  port:               parseInt(process.env.DB_PORT) || 3306,
  user:               process.env.DB_USER || 'root',
  password:           process.env.DB_PASS || '',
  database:           process.env.DB_NAME || 'kroi_rezervime',
  waitForConnections: true,
  connectionLimit:    10,
  charset:            'utf8mb4',
});
db.query('SELECT 1')
  .then(() => console.log('✅ Database u lidh me sukses.'))
  .catch(e => console.error('❌ Gabim database:', e.message));

// ── Multer ────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads', 'kabina');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    cb(null, `k${req.params.id}_${Date.now()}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /jpeg|jpg|png|webp|avif/.test(file.mimetype))
});

// ════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════

async function cmimPerDate(kabina_id, dateStr) {
  const dow = new Date(dateStr).getDay();
  const [spec] = await db.query(`
    SELECT cmimi FROM cmime_speciale
    WHERE kabina_id=? AND ? BETWEEN data_fillim AND data_mbarim
    ORDER BY data_fillim DESC LIMIT 1
  `, [kabina_id, dateStr]);
  if (spec.length) return parseFloat(spec[0].cmimi);
  const [kab] = await db.query('SELECT cmimi_nate, `cmimi_fundjavë` FROM kabinat WHERE id=?', [kabina_id]);
  if (!kab.length) return 0;
  const isWeekend = (dow === 0 || dow === 6);
  if (isWeekend && kab[0]['cmimi_fundjavë']) return parseFloat(kab[0]['cmimi_fundjavë']);
  return parseFloat(kab[0].cmimi_nate);
}

async function llogaritTotal(kabina_id, check_in, check_out) {
  let total = 0, cur = new Date(check_in);
  const end = new Date(check_out), breakdown = [];
  while (cur < end) {
    const ds = cur.toISOString().split('T')[0];
    const cmimi = await cmimPerDate(kabina_id, ds);
    breakdown.push({ date: ds, cmimi });
    total += cmimi;
    cur.setDate(cur.getDate() + 1);
  }
  return { total, breakdown };
}

// ════════════════════════════════════════════
//  KABINAT
// ════════════════════════════════════════════

app.get('/api/kabinat', async (req, res) => {
  try {
    const [kabinat] = await db.query('SELECT * FROM kabinat WHERE aktive=1 ORDER BY id');
    const [fotot]   = await db.query('SELECT * FROM kabina_fotot ORDER BY kabina_id, renditja');
    res.json(kabinat.map(k => ({
      ...k,
      fotot: fotot.filter(f => f.kabina_id === k.id).map(f => '/uploads/kabina/' + f.filename)
    })));
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.get('/api/kabinat/:id/kalendar', async (req, res) => {
  try {
    const kabina_id = req.params.id;
    const muaji = req.query.muaji || new Date().toISOString().substring(0, 7);
    const [year, month] = muaji.split('-').map(Number);
    const fillim = new Date(year, month - 1, 1);
    const mbarim = new Date(year, month, 0);
    // Blloko datat me statusi 'aktive' ose 'pritje'
    const [rez] = await db.query(`
      SELECT check_in, check_out FROM rezervimet_kabina
      WHERE kabina_id=? AND statusi IN ('aktive','pritje')
        AND check_out > ? AND check_in < ?
    `, [kabina_id, fillim.toISOString().split('T')[0], new Date(year, month, 1).toISOString().split('T')[0]]);
    const blocked = new Set();
    rez.forEach(r => {
      let d = new Date(r.check_in);
      const e = new Date(r.check_out);
      while (d < e) { blocked.add(d.toISOString().split('T')[0]); d.setDate(d.getDate() + 1); }
    });
    const ditet = [];
    let cur = new Date(fillim);
    while (cur <= mbarim) {
      const ds = cur.toISOString().split('T')[0];
      const cmimi = await cmimPerDate(kabina_id, ds);
      ditet.push({ date: ds, cmimi, bllokuar: blocked.has(ds) });
      cur.setDate(cur.getDate() + 1);
    }
    res.json({ kabina_id, muaji, ditet });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.put('/api/kabinat/:id/cmime', async (req, res) => {
  try {
    const { cmimi_nate, cmimi_fundjavë } = req.body;
    await db.query('UPDATE kabinat SET cmimi_nate=?, `cmimi_fundjavë`=? WHERE id=?',
      [cmimi_nate, cmimi_fundjavë || null, req.params.id]);
    res.json({ sukses: true });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// ════════════════════════════════════════════
//  KABINA DISPONUESHMËRIA
// ════════════════════════════════════════════

app.get('/api/kabina/disponueshme', async (req, res) => {
  try {
    const { check_in, check_out } = req.query;
    if (!check_in || !check_out) {
      const [k] = await db.query('SELECT * FROM kabinat WHERE aktive=1 ORDER BY id');
      return res.json(k.map(x => ({ ...x, e_zene: false })));
    }
    // E zënë nëse ka rezervim aktive OSE pritje
    const [kabinat] = await db.query(`
      SELECT k.*, CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END AS e_zene
      FROM kabinat k
      LEFT JOIN rezervimet_kabina r
        ON r.kabina_id=k.id AND r.statusi IN ('aktive','pritje')
        AND r.check_in < ? AND r.check_out > ?
      WHERE k.aktive=1 ORDER BY k.id
    `, [check_out, check_in]);
    const result = await Promise.all(kabinat.map(async k => {
      const { total, breakdown } = await llogaritTotal(k.id, check_in, check_out);
      return { ...k, total_periudha: total, breakdown };
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// ════════════════════════════════════════════
//  KABINA REZERVIMET (KËRKESA)
// ════════════════════════════════════════════

// POST — klienti dërgon kërkesë (statusi = 'pritje')
app.post('/api/kabina/kerkese', async (req, res) => {
  try {
    const { kabina_id, emri, telefon, email, persona, check_in, check_out, kerkesa } = req.body;
    if (!kabina_id || !emri || !telefon || !check_in || !check_out)
      return res.status(400).json({ gabim: 'Mungojnë të dhënat e detyrueshme.' });
    if (new Date(check_out) <= new Date(check_in))
      return res.status(400).json({ gabim: 'Check-out duhet të jetë pas check-in.' });
    // Kontrollo konfliktin (vetëm aktive + pritje)
    const [k] = await db.query(`
      SELECT id FROM rezervimet_kabina
      WHERE kabina_id=? AND statusi IN ('aktive','pritje')
        AND check_in<? AND check_out>?
    `, [kabina_id, check_out, check_in]);
    if (k.length) return res.status(409).json({ gabim: 'Kabina është e rezervuar për këto data.' });
    const { total } = await llogaritTotal(kabina_id, check_in, check_out);
    const [result] = await db.query(`
      INSERT INTO rezervimet_kabina
        (kabina_id,emri,telefon,email,persona,check_in,check_out,totali,kerkesa,burim,statusi)
      VALUES (?,?,?,?,?,?,?,?,?,'online','pritje')
    `, [kabina_id, emri, telefon, email||null, persona||2, check_in, check_out, total, kerkesa||null]);
    res.status(201).json({ sukses: true, id: result.insertId, totali: total });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.get('/api/kabina/rezervimet', async (req, res) => {
  try {
    const { statusi } = req.query;
    const ku = statusi ? 'WHERE r.statusi=?' : '';
    const params = statusi ? [statusi] : [];
    const [rows] = await db.query(`
      SELECT r.*, k.emri AS kabina_emri, k.lloji, k.cmimi_nate
      FROM rezervimet_kabina r JOIN kabinat k ON k.id=r.kabina_id
      ${ku} ORDER BY r.krijuar_me DESC
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// ════════════════════════════════════════════
//  ADMIN API
// ════════════════════════════════════════════

// PATCH status kabina (konfirmo/refuzo/perfundo)
app.patch('/api/admin/kabina/rezervimet/:id/status', async (req, res) => {
  try {
    const { statusi } = req.body;
    if (!['pritje','aktive','anuluar','perfunduar'].includes(statusi))
      return res.status(400).json({ gabim: 'Status i pavlefshëm.' });
    await db.query('UPDATE rezervimet_kabina SET statusi=? WHERE id=?', [statusi, req.params.id]);
    res.json({ sukses: true });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// POST rezervim manual admin (direkt aktive)
app.post('/api/admin/kabina/rezervo', async (req, res) => {
  try {
    const { kabina_id, emri, telefon, email, persona, check_in, check_out, kerkesa } = req.body;
    if (!kabina_id || !emri || !check_in || !check_out)
      return res.status(400).json({ gabim: 'Mungojnë të dhënat.' });
    const [k] = await db.query(`
      SELECT id FROM rezervimet_kabina
      WHERE kabina_id=? AND statusi IN ('aktive','pritje') AND check_in<? AND check_out>?
    `, [kabina_id, check_out, check_in]);
    if (k.length) return res.status(409).json({ gabim: 'Kabina është e rezervuar për këto data.' });
    const { total } = await llogaritTotal(kabina_id, check_in, check_out);
    const [r] = await db.query(`
      INSERT INTO rezervimet_kabina
        (kabina_id,emri,telefon,email,persona,check_in,check_out,totali,kerkesa,burim,statusi)
      VALUES (?,?,?,?,?,?,?,?,?,'admin','aktive')
    `, [kabina_id, emri, telefon||'—', email||null, persona||2, check_in, check_out, total, kerkesa||null]);
    res.status(201).json({ sukses: true, id: r.insertId, totali: total });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// GET kalendar admin per kabinë
app.get('/api/admin/kabina/:id/kalendar-rezervime', async (req, res) => {
  try {
    const muaji = req.query.muaji || new Date().toISOString().substring(0,7);
    const [y, m] = muaji.split('-').map(Number);
    const fillim = muaji + '-01';
    const mbarim = new Date(y, m, 1).toISOString().split('T')[0];
    const [rez] = await db.query(`
      SELECT r.id, r.emri, r.telefon, r.email, r.persona,
             r.check_in, r.check_out, r.netet, r.totali,
             r.kerkesa, r.burim, r.statusi, r.krijuar_me
      FROM rezervimet_kabina r
      WHERE r.kabina_id=?
        AND r.statusi IN ('pritje','aktive','perfunduar')
        AND r.check_out > ? AND r.check_in < ?
      ORDER BY r.check_in
    `, [req.params.id, fillim, mbarim]);
    res.json(rez);
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// GET plan pune ditor — ardhje dhe ikje
app.get('/api/admin/plan-ditor', async (req, res) => {
  try {
    const data = req.query.data || new Date().toISOString().split('T')[0];
    // Check-in sot (arrivals)
    const [ardhje] = await db.query(`
      SELECT r.*, k.emri AS kabina_emri, k.kodi
      FROM rezervimet_kabina r JOIN kabinat k ON k.id=r.kabina_id
      WHERE r.check_in=? AND r.statusi='aktive'
      ORDER BY k.id
    `, [data]);
    // Check-out sot (departures)
    const [ikje] = await db.query(`
      SELECT r.*, k.emri AS kabina_emri, k.kodi
      FROM rezervimet_kabina r JOIN kabinat k ON k.id=r.kabina_id
      WHERE r.check_out=? AND r.statusi IN ('aktive','perfunduar')
      ORDER BY k.id
    `, [data]);
    // Kabinat të zëna sot
    const [zena] = await db.query(`
      SELECT k.id, k.kodi, k.emri AS kabina_emri,
             r.emri, r.check_in, r.check_out, r.statusi
      FROM kabinat k
      LEFT JOIN rezervimet_kabina r
        ON r.kabina_id=k.id AND r.statusi='aktive'
        AND r.check_in<=? AND r.check_out>?
      WHERE k.aktive=1 ORDER BY k.id
    `, [data, data]);
    res.json({ data, ardhje, ikje, zena });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// GET disponueshmëria për datë të ardhshme (admin)
app.get('/api/admin/disponueshme', async (req, res) => {
  try {
    const { check_in, check_out } = req.query;
    if (!check_in || !check_out)
      return res.status(400).json({ gabim: 'Duhen check_in dhe check_out.' });
    const [kabinat] = await db.query(`
      SELECT k.*, CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END AS e_zene
      FROM kabinat k
      LEFT JOIN rezervimet_kabina r
        ON r.kabina_id=k.id AND r.statusi IN ('aktive','pritje')
        AND r.check_in<? AND r.check_out>?
      WHERE k.aktive=1 ORDER BY k.id
    `, [check_out, check_in]);
    res.json(kabinat);
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// ── UPLOAD FOTOSH ─────────────────────────────
app.post('/api/admin/kabina/:id/foto', upload.array('fotot', 10), async (req, res) => {
  try {
    if (!req.files?.length) return res.status(400).json({ gabim: 'Asnjë foto.' });
    const rows = req.files.map((f, i) => [req.params.id, f.filename, null, i]);
    await db.query('INSERT INTO kabina_fotot (kabina_id,filename,caption,renditja) VALUES ?', [rows]);
    res.json({ sukses: true, fotot: req.files.map(f => '/uploads/kabina/' + f.filename) });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.delete('/api/admin/kabina/:id/foto/:fotoId', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT filename FROM kabina_fotot WHERE id=? AND kabina_id=?',
      [req.params.fotoId, req.params.id]);
    if (!rows.length) return res.status(404).json({ gabim: 'Foto nuk u gjet.' });
    const fpath = path.join(__dirname, 'public', 'uploads', 'kabina', rows[0].filename);
    if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
    await db.query('DELETE FROM kabina_fotot WHERE id=?', [req.params.fotoId]);
    res.json({ sukses: true });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// ── EXPORT EXCEL ──────────────────────────────
app.get('/api/admin/export/kabina', async (req, res) => {
  try {
    const { data_fillim, data_mbarim, statusi } = req.query;
    let ku = '', params = [];
    const conditions = [];
    if (data_fillim && data_mbarim) { conditions.push('r.check_in BETWEEN ? AND ?'); params.push(data_fillim, data_mbarim); }
    if (statusi) { conditions.push('r.statusi=?'); params.push(statusi); }
    if (conditions.length) ku = 'WHERE ' + conditions.join(' AND ');
    const [rows] = await db.query(`
      SELECT r.id, r.emri, r.telefon, r.email, k.emri AS kabina,
             k.lloji, r.persona, r.check_in, r.check_out, r.netet,
             r.totali, r.kerkesa, r.burim, r.statusi, r.krijuar_me
      FROM rezervimet_kabina r JOIN kabinat k ON k.id=r.kabina_id
      ${ku} ORDER BY r.check_in DESC
    `, params);
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      'ID': r.id, 'Emri': r.emri, 'Telefon': r.telefon, 'Email': r.email||'—',
      'Kabina': r.kabina, 'Lloji': r.lloji, 'Persona': r.persona,
      'Check-in': r.check_in, 'Check-out': r.check_out, 'Netë': r.netet,
      'Totali (L)': r.totali, 'Kërkesa': r.kerkesa||'—',
      'Burimi': r.burim, 'Statusi': r.statusi,
      'Krijuar': new Date(r.krijuar_me).toLocaleString('sq-AL')
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kabinat');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="rezervimet-${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// Export plan ditor Excel
app.get('/api/admin/export/plan-ditor', async (req, res) => {
  try {
    const data = req.query.data || new Date().toISOString().split('T')[0];
    const [ardhje] = await db.query(`
      SELECT k.emri AS kabina, r.emri, r.telefon, r.persona, r.check_in, r.check_out, r.netet
      FROM rezervimet_kabina r JOIN kabinat k ON k.id=r.kabina_id
      WHERE r.check_in=? AND r.statusi='aktive' ORDER BY k.id
    `, [data]);
    const [ikje] = await db.query(`
      SELECT k.emri AS kabina, r.emri, r.telefon, r.persona, r.check_in, r.check_out
      FROM rezervimet_kabina r JOIN kabinat k ON k.id=r.kabina_id
      WHERE r.check_out=? AND r.statusi IN ('aktive','perfunduar') ORDER BY k.id
    `, [data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ardhje.map(r => ({
      'Kabina': r.kabina, 'Klienti': r.emri, 'Telefon': r.telefon,
      'Persona': r.persona, 'Check-in': r.check_in, 'Check-out': r.check_out, 'Netë': r.netet
    }))), 'Ardhje (Check-in)');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ikje.map(r => ({
      'Kabina': r.kabina, 'Klienti': r.emri, 'Telefon': r.telefon,
      'Persona': r.persona, 'Check-in': r.check_in, 'Check-out': r.check_out
    }))), 'Ikje (Check-out)');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="plan-ditor-${data}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// ════════════════════════════════════════════
//  AUTO-CLOSE — Mbyll rezervimet e kaluara
// ════════════════════════════════════════════
async function autoCloseExpired() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [r1] = await db.query(
      "UPDATE rezervimet_kabina SET statusi='perfunduar' WHERE statusi='aktive' AND check_out<=?", [today]);
    if (r1.affectedRows > 0) console.log(`⏰ Auto-close: ${r1.affectedRows} kabina u mbyllën.`);
  } catch (e) { console.error('Auto-close error:', e.message); }
}
autoCloseExpired();
setInterval(autoCloseExpired, 5 * 60 * 1000);

// ── FAQET HTML ────────────────────────────────
app.get('/',           (req, res) => res.sendFile(path.join(__dirname, 'public', 'rezervimi-kabina.html')));
app.get('/kabina',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'rezervimi-kabina.html')));
app.get('/admin',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/rreth-nesh', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rreth-nesh.html')));

// ── START ─────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌲 KROI Server aktiv!\n`);
  console.log(`   https://kroi-rezervime-production.up.railway.app\n`);
});
