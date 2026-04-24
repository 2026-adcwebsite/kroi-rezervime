require('dotenv').config();
// ============================================
// KROI Rezervime - Server API v3
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

// ── Multer (upload fotosh) ────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'public', 'uploads', 'kabina');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext  = path.extname(file.originalname);
    const name = `k${req.params.id}_${Date.now()}${ext}`;
    cb(null, name);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /jpeg|jpg|png|webp|avif/.test(file.mimetype);
    cb(null, ok);
  }
});

// ════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════

async function cmimPerDate(kabina_id, dateStr) {
  const date = new Date(dateStr);
  const dow  = date.getDay();
  const [spec] = await db.query(`
    SELECT cmimi FROM cmime_speciale
    WHERE kabina_id = ? AND ? BETWEEN data_fillim AND data_mbarim
    ORDER BY data_fillim DESC LIMIT 1
  `, [kabina_id, dateStr]);
  if (spec.length) return parseFloat(spec[0].cmimi);
  const [kab] = await db.query('SELECT cmimi_nate, cmimi_fundjavë FROM kabinat WHERE id=?', [kabina_id]);
  if (!kab.length) return 0;
  const isWeekend = (dow === 0 || dow === 6);
  if (isWeekend && kab[0]['cmimi_fundjavë']) return parseFloat(kab[0]['cmimi_fundjavë']);
  return parseFloat(kab[0].cmimi_nate);
}

async function llogaritTotal(kabina_id, check_in, check_out) {
  let total = 0;
  let cur = new Date(check_in);
  const end = new Date(check_out);
  const breakdown = [];
  while (cur < end) {
    const ds    = cur.toISOString().split('T')[0];
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
    const result = kabinat.map(k => ({
      ...k,
      fotot: fotot.filter(f => f.kabina_id === k.id).map(f => '/uploads/kabina/' + f.filename)
    }));
    res.json(result);
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.get('/api/kabinat/:id/kalendar', async (req, res) => {
  try {
    const kabina_id = req.params.id;
    const muaji     = req.query.muaji || new Date().toISOString().substring(0, 7);
    const [year, month] = muaji.split('-').map(Number);
    const fillim = new Date(year, month - 1, 1);
    const mbarim = new Date(year, month, 0);
    const [rez] = await db.query(`
      SELECT check_in, check_out FROM rezervimet_kabina
      WHERE kabina_id=? AND statusi='aktive'
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
      const ds    = cur.toISOString().split('T')[0];
      const cmimi = await cmimPerDate(kabina_id, ds);
      ditet.push({ date: ds, cmimi, bllokuar: blocked.has(ds) });
      cur.setDate(cur.getDate() + 1);
    }
    res.json({ kabina_id, muaji, ditet });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.post('/api/kabinat/:id/cmim-special', async (req, res) => {
  try {
    const { data_fillim, data_mbarim, cmimi, pershkrimi } = req.body;
    if (!data_fillim || !data_mbarim || !cmimi)
      return res.status(400).json({ gabim: 'Mungojnë të dhënat.' });
    await db.query(
      'INSERT INTO cmime_speciale (kabina_id,data_fillim,data_mbarim,cmimi,pershkrimi) VALUES (?,?,?,?,?)',
      [req.params.id, data_fillim, data_mbarim, cmimi, pershkrimi || null]
    );
    res.json({ sukses: true });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.put('/api/kabinat/:id/cmime', async (req, res) => {
  try {
    const { cmimi_nate, cmimi_fundjavë } = req.body;
    await db.query(
      'UPDATE kabinat SET cmimi_nate=?, `cmimi_fundjavë`=? WHERE id=?',
      [cmimi_nate, cmimi_fundjavë || null, req.params.id]
    );
    res.json({ sukses: true });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// ════════════════════════════════════════════
//  KABINA DISPONUESHMËRIA & REZERVIMET
// ════════════════════════════════════════════

app.get('/api/kabina/disponueshme', async (req, res) => {
  try {
    const { check_in, check_out } = req.query;
    if (!check_in || !check_out) {
      const [k] = await db.query('SELECT * FROM kabinat WHERE aktive=1 ORDER BY id');
      return res.json(k.map(x => ({ ...x, e_zene: false })));
    }
    const [kabinat] = await db.query(`
      SELECT k.*, CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END AS e_zene
      FROM kabinat k
      LEFT JOIN rezervimet_kabina r
        ON r.kabina_id=k.id AND r.statusi='aktive'
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

app.post('/api/kabina/rezervo', async (req, res) => {
  try {
    const { kabina_id, emri, telefon, email, persona, check_in, check_out, kerkesa, burim } = req.body;
    if (!kabina_id || !emri || !telefon || !check_in || !check_out)
      return res.status(400).json({ gabim: 'Mungojnë të dhënat e detyrueshme.' });
    if (new Date(check_out) <= new Date(check_in))
      return res.status(400).json({ gabim: 'Check-out duhet të jetë pas check-in.' });
    const [konflikt] = await db.query(`
      SELECT id FROM rezervimet_kabina
      WHERE kabina_id=? AND statusi='aktive' AND check_in<? AND check_out>?
    `, [kabina_id, check_out, check_in]);
    if (konflikt.length) return res.status(409).json({ gabim: 'Kabina është e rezervuar për këto data.' });
    const { total } = await llogaritTotal(kabina_id, check_in, check_out);
    const [result] = await db.query(`
      INSERT INTO rezervimet_kabina
        (kabina_id,emri,telefon,email,persona,check_in,check_out,totali,kerkesa,burim)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [kabina_id, emri, telefon, email||null, persona||2, check_in, check_out, total, kerkesa||null, burim||'online']);
    res.status(201).json({ sukses: true, id: result.insertId, totali: total });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.get('/api/kabina/rezervimet', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT r.*, k.emri AS kabina_emri, k.lloji, k.cmimi_nate
      FROM rezervimet_kabina r JOIN kabinat k ON k.id=r.kabina_id
      ORDER BY r.check_in DESC
    `);
    res.json(rows);
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.delete('/api/kabina/rezervimet/:id', async (req, res) => {
  try {
    await db.query("UPDATE rezervimet_kabina SET statusi='anuluar' WHERE id=?", [req.params.id]);
    res.json({ sukses: true });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// ════════════════════════════════════════════
//  TAVOLINA API
// ════════════════════════════════════════════

app.get('/api/tavolina/disponueshme', async (req, res) => {
  try {
    const { data, ora } = req.query;
    if (!data || !ora) {
      const [t] = await db.query('SELECT * FROM tavolinat WHERE aktive=1 ORDER BY CAST(numri AS UNSIGNED)');
      return res.json(t.map(x => ({ ...x, e_zene: false })));
    }
    const [tavolinat] = await db.query(`
      SELECT t.*, CASE WHEN r.id IS NOT NULL THEN 1 ELSE 0 END AS e_zene
      FROM tavolinat t
      LEFT JOIN rezervimet_tavolina r
        ON r.tavolina_id=t.id AND r.data_rez=? AND r.statusi='aktive'
        AND ?<r.ora_mbarim AND ?>=r.ora_rez
      WHERE t.aktive=1 ORDER BY CAST(t.numri AS UNSIGNED)
    `, [data, ora, ora]);
    res.json(tavolinat);
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.post('/api/tavolina/rezervo', async (req, res) => {
  try {
    const { tavolina_id, emri, telefon, email, persona, data_rez, ora_rez, kerkesa, burim } = req.body;
    if (!tavolina_id || !emri || !telefon || !data_rez || !ora_rez)
      return res.status(400).json({ gabim: 'Mungojnë të dhënat e detyrueshme.' });
    const [h, m] = ora_rez.split(':').map(Number);
    const mb = new Date(0, 0, 0, h + 2, m);
    const ora_mbarim = `${String(mb.getHours()).padStart(2,'0')}:${String(mb.getMinutes()).padStart(2,'0')}`;
    const [k] = await db.query(`
      SELECT id FROM rezervimet_tavolina
      WHERE tavolina_id=? AND data_rez=? AND statusi='aktive' AND ?<ora_mbarim AND ?>=ora_rez
    `, [tavolina_id, data_rez, ora_rez, ora_rez]);
    if (k.length) return res.status(409).json({ gabim: 'Tavolina është e rezervuar për këtë orë.' });
    const [result] = await db.query(`
      INSERT INTO rezervimet_tavolina
        (tavolina_id,emri,telefon,email,persona,data_rez,ora_rez,ora_mbarim,kerkesa,burim)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `, [tavolina_id, emri, telefon, email||null, persona||2, data_rez, ora_rez, ora_mbarim, kerkesa||null, burim||'online']);
    res.status(201).json({ sukses: true, id: result.insertId });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.get('/api/tavolina/rezervimet', async (req, res) => {
  try {
    const { data } = req.query;
    const ku     = data ? 'WHERE r.data_rez=?' : '';
    const params = data ? [data] : [];
    const [rows] = await db.query(`
      SELECT r.*, t.numri, t.zona, t.kapaciteti
      FROM rezervimet_tavolina r JOIN tavolinat t ON t.id=r.tavolina_id
      ${ku} ORDER BY r.data_rez DESC, r.ora_rez DESC
    `, params);
    res.json(rows);
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.delete('/api/tavolina/rezervimet/:id', async (req, res) => {
  try {
    await db.query("UPDATE rezervimet_tavolina SET statusi='anuluar' WHERE id=?", [req.params.id]);
    res.json({ sukses: true });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// ════════════════════════════════════════════
//  ADMIN API
// ════════════════════════════════════════════

// PATCH status tavolina
app.patch('/api/admin/tavolina/rezervimet/:id/status', async (req, res) => {
  try {
    const { statusi } = req.body;
    if (!['aktive','anuluar','perfunduar'].includes(statusi))
      return res.status(400).json({ gabim: 'Status i pavlefshëm.' });
    await db.query('UPDATE rezervimet_tavolina SET statusi=? WHERE id=?', [statusi, req.params.id]);
    res.json({ sukses: true });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// PATCH status kabina
app.patch('/api/admin/kabina/rezervimet/:id/status', async (req, res) => {
  try {
    const { statusi } = req.body;
    if (!['aktive','anuluar','perfunduar'].includes(statusi))
      return res.status(400).json({ gabim: 'Status i pavlefshëm.' });
    await db.query('UPDATE rezervimet_kabina SET statusi=? WHERE id=?', [statusi, req.params.id]);
    res.json({ sukses: true });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// PATCH - Liro tavolinën manualisht (ora_mbarim = tani)
app.patch('/api/admin/tavolina/rezervimet/:id/liro', async (req, res) => {
  try {
    const now = new Date();
    const oraFund = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    await db.query(
      "UPDATE rezervimet_tavolina SET statusi='perfunduar', ora_mbarim=? WHERE id=?",
      [oraFund, req.params.id]
    );
    res.json({ sukses: true, ora_liruar: oraFund });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// GET timeline tavolinash për ditën
app.get('/api/admin/tavolina/timeline', async (req, res) => {
  try {
    const data = req.query.data || new Date().toISOString().split('T')[0];
    const [tavolinat] = await db.query(
      'SELECT * FROM tavolinat WHERE aktive=1 ORDER BY CAST(numri AS UNSIGNED)'
    );
    const [rezervimet] = await db.query(`
      SELECT r.*, t.numri, t.zona, t.kapaciteti
      FROM rezervimet_tavolina r
      JOIN tavolinat t ON t.id=r.tavolina_id
      WHERE r.data_rez=? AND r.statusi IN ('aktive','perfunduar')
      ORDER BY r.ora_rez
    `, [data]);
    res.json({ tavolinat, rezervimet });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// GET kalendar rezervimesh per kabinë (admin)
app.get('/api/admin/kabina/:id/kalendar-rezervime', async (req, res) => {
  try {
    const kabina_id = req.params.id;
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
        AND r.statusi IN ('aktive','perfunduar')
        AND r.check_out > ? AND r.check_in < ?
      ORDER BY r.check_in
    `, [kabina_id, fillim, mbarim]);
    res.json(rez);
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// POST rezervim manual tavolinë (admin)
app.post('/api/admin/tavolina/rezervo', async (req, res) => {
  try {
    const { tavolina_id, emri, telefon, email, persona, data_rez, ora_rez, kerkesa } = req.body;
    if (!tavolina_id || !emri || !data_rez || !ora_rez)
      return res.status(400).json({ gabim: 'Mungojnë të dhënat.' });
    const [h, m] = ora_rez.split(':').map(Number);
    const mb = new Date(0, 0, 0, h + 2, m);
    const ora_mbarim = `${String(mb.getHours()).padStart(2,'0')}:${String(mb.getMinutes()).padStart(2,'0')}`;
    const [k] = await db.query(`
      SELECT id FROM rezervimet_tavolina
      WHERE tavolina_id=? AND data_rez=? AND statusi='aktive' AND ?<ora_mbarim AND ?>=ora_rez
    `, [tavolina_id, data_rez, ora_rez, ora_rez]);
    if (k.length) return res.status(409).json({ gabim: 'Tavolina është e rezervuar për këtë orë.' });
    const [r] = await db.query(`
      INSERT INTO rezervimet_tavolina (tavolina_id,emri,telefon,email,persona,data_rez,ora_rez,ora_mbarim,kerkesa,burim)
      VALUES (?,?,?,?,?,?,?,?,?,'admin')
    `, [tavolina_id, emri, telefon||'—', email||null, persona||2, data_rez, ora_rez, ora_mbarim, kerkesa||null]);
    res.status(201).json({ sukses: true, id: r.insertId });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// POST rezervim manual kabinë (admin)
app.post('/api/admin/kabina/rezervo', async (req, res) => {
  try {
    const { kabina_id, emri, telefon, email, persona, check_in, check_out, kerkesa } = req.body;
    if (!kabina_id || !emri || !check_in || !check_out)
      return res.status(400).json({ gabim: 'Mungojnë të dhënat.' });
    if (new Date(check_out) <= new Date(check_in))
      return res.status(400).json({ gabim: 'Check-out duhet të jetë pas check-in.' });
    const [k] = await db.query(`
      SELECT id FROM rezervimet_kabina
      WHERE kabina_id=? AND statusi='aktive' AND check_in<? AND check_out>?
    `, [kabina_id, check_out, check_in]);
    if (k.length) return res.status(409).json({ gabim: 'Kabina është e rezervuar për këto data.' });
    const { total } = await llogaritTotal(kabina_id, check_in, check_out);
    const [r] = await db.query(`
      INSERT INTO rezervimet_kabina (kabina_id,emri,telefon,email,persona,check_in,check_out,totali,kerkesa,burim)
      VALUES (?,?,?,?,?,?,?,?,?,'admin')
    `, [kabina_id, emri, telefon||'—', email||null, persona||2, check_in, check_out, total, kerkesa||null]);
    res.status(201).json({ sukses: true, id: r.insertId, totali: total });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// ── UPLOAD FOTOSH ─────────────────────────────
app.post('/api/admin/kabina/:id/foto', upload.array('fotot', 10), async (req, res) => {
  try {
    if (!req.files || !req.files.length)
      return res.status(400).json({ gabim: 'Asnjë foto e ngarkuar.' });
    const rows = req.files.map((f, i) => [req.params.id, f.filename, req.body.caption || null, i]);
    await db.query('INSERT INTO kabina_fotot (kabina_id,filename,caption,renditja) VALUES ?', [rows]);
    res.json({ sukses: true, fotot: req.files.map(f => '/uploads/kabina/' + f.filename) });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.delete('/api/admin/kabina/:id/foto/:fotoId', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT filename FROM kabina_fotot WHERE id=? AND kabina_id=?', [req.params.fotoId, req.params.id]);
    if (!rows.length) return res.status(404).json({ gabim: 'Foto nuk u gjet.' });
    const fpath = path.join(__dirname, 'public', 'uploads', 'kabina', rows[0].filename);
    if (fs.existsSync(fpath)) fs.unlinkSync(fpath);
    await db.query('DELETE FROM kabina_fotot WHERE id=?', [req.params.fotoId]);
    res.json({ sukses: true });
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// ── EXPORT EXCEL ──────────────────────────────
app.get('/api/admin/export/tavolina', async (req, res) => {
  try {
    const { data_fillim, data_mbarim } = req.query;
    let ku = '', params = [];
    if (data_fillim && data_mbarim) { ku = 'WHERE r.data_rez BETWEEN ? AND ?'; params = [data_fillim, data_mbarim]; }
    const [rows] = await db.query(`
      SELECT r.id, r.emri, r.telefon, r.email, t.numri AS tavolina,
             t.zona, r.persona, r.data_rez, r.ora_rez, r.ora_mbarim,
             r.kerkesa, r.burim, r.statusi, r.krijuar_me
      FROM rezervimet_tavolina r JOIN tavolinat t ON t.id=r.tavolina_id
      ${ku} ORDER BY r.data_rez DESC, r.ora_rez DESC
    `, params);
    const ws = XLSX.utils.json_to_sheet(rows.map(r => ({
      'ID': r.id, 'Emri': r.emri, 'Telefon': r.telefon, 'Email': r.email||'—',
      'Tavolina Nr.': r.tavolina, 'Zona': r.zona==='indoor'?'Salla':'Terraca',
      'Persona': r.persona, 'Data': r.data_rez, 'Ora Fillim': r.ora_rez,
      'Ora Mbarim': r.ora_mbarim, 'Kërkesa': r.kerkesa||'—',
      'Burimi': r.burim, 'Statusi': r.statusi,
      'Krijuar': new Date(r.krijuar_me).toLocaleString('sq-AL')
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tavolinat');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename="rezervimet-tavolina-${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

app.get('/api/admin/export/kabina', async (req, res) => {
  try {
    const { data_fillim, data_mbarim } = req.query;
    let ku = '', params = [];
    if (data_fillim && data_mbarim) { ku = 'WHERE r.check_in BETWEEN ? AND ?'; params = [data_fillim, data_mbarim]; }
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
    res.setHeader('Content-Disposition', `attachment; filename="rezervimet-kabina-${Date.now()}.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (e) { res.status(500).json({ gabim: e.message }); }
});

// ── FAQET HTML ────────────────────────────────
app.get('/',           (req, res) => res.sendFile(path.join(__dirname, 'public', 'rezervimi-tavolina.html')));
app.get('/kabina',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'rezervimi-kabina.html')));
app.get('/admin',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/rreth-nesh', (req, res) => res.sendFile(path.join(__dirname, 'public', 'rreth-nesh.html')));

// ── START ─────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌲 KROI Server aktiv!\n`);
  console.log(`   localhost:`);
  console.log(`   Tavolina  : http://localhost:${PORT}/`);
  console.log(`   Kabina    : http://localhost:${PORT}/kabina`);
  console.log(`   Rreth     : http://localhost:${PORT}/rreth-nesh`);
  console.log(`   Admin     : http://localhost:${PORT}/admin`);
  console.log(`\n   LAN (172.16.101.231):`);
  console.log(`   Tavolina  : http://172.16.101.245:${PORT}/`);
  console.log(`   Kabina    : http://172.16.101.245:${PORT}/kabina`);
  console.log(`   Admin     : http://172.16.101.245:${PORT}/admin\n`);
});
