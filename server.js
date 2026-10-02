// Whisker &amp; Wag server - accounts + static store
// Deps: express only. Passwords hashed with scrypt, sessions via signed cookie.
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const PROD = process.env.NODE_ENV === 'production';
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'users.json');

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(__dirname));

// ---------- tiny JSON db ----------
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch { return { users: [] }; }
}
function saveDB(db) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---------- password hashing (scrypt) ----------
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

// ---------- signed cookie session ----------
function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(token) {
  if (!token) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (payload.exp < Date.now()) return null;
  return payload;
}
function setSession(res, user) {
  const token = sign({ uid: user.id, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 });
  res.setHeader('Set-Cookie',
    `session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${PROD ? '; Secure' : ''}`);
}
function currentUser(req) {
  const cookies = Object.fromEntries((req.headers.cookie || '').split(';')
    .map(c => c.trim().split('=')).filter(x => x.length === 2));
  const payload = verifyToken(cookies.session);
  if (!payload) return null;
  return loadDB().users.find(u => u.id === payload.uid) || null;
}

// ---------- auth routes ----------
app.post('/api/signup', (req, res) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password || password.length < 8) return res.redirect('/signup.html?error=1');
  const db = loadDB();
  if (db.users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.redirect('/signup.html?error=exists');
  }
  const user = {
    id: crypto.randomUUID(),
    name: String(name).slice(0, 80),
    email: String(email).slice(0, 120).toLowerCase(),
    phone: phone ? String(phone).trim().slice(0, 20) : '',
    password: hashPassword(password),
    created: new Date().toISOString()
  };
  db.users.push(user);
  saveDB(db);
  setSession(res, user);
  res.redirect('/account.html');
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body || {};
  const db = loadDB();
  const user = db.users.find(u => u.email.toLowerCase() === String(email || '').toLowerCase());
  if (!user || !verifyPassword(String(password || ''), user.password)) {
    return res.redirect('/login.html?error=1');
  }
  user.last_login = new Date().toISOString();
  db.users = db.users.map(u => u.id === user.id ? user : u);
  saveDB(db);
  setSession(res, user);
  res.redirect('/account.html');
});

app.post('/api/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
  res.redirect('/index.html');
});

app.get('/api/me', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'not logged in' });
  res.json({ name: user.name, email: user.email, phone: user.phone || '' });
});

// ---------- checkout (test mode) ----------
// Records what the site relayed: brand + last4 only. The full card number
// never leaves the browser and the CVC is never transmitted at all.
app.post('/api/checkout', (req, res) => {
  const b = req.body || {};
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const brandOf = (d) => d.startsWith('4') ? 'Visa' : d.startsWith('5') ? 'Mastercard' : d.startsWith('3') ? 'Amex' : d.startsWith('6') ? 'Discover' : 'Card';
  // defense in depth: if a full number somehow arrives, mask it here too
  let card = { brand: 'Card', last4: '', exp: '' };
  if (b.card && typeof b.card === 'object') {
    const d = digits(b.card.last4);
    card = { brand: String(b.card.brand || 'Card').slice(0, 12), last4: d.slice(-4), exp: String(b.card.exp || '').slice(0, 7) };
  }
  if (!card.last4 && b.cardNumber) {
    const d = digits(b.cardNumber);
    card = { brand: brandOf(d), last4: d.slice(-4), exp: String(b.card.exp || '').slice(0, 7) };
  }
  const items = (Array.isArray(b.items) ? b.items.slice(0, 50) : [])
    .map(it => ({ name: String((it || {}).name || '').slice(0, 80), price: Number((it || {}).price), qty: Math.floor(Number((it || {}).qty)) }))
    .filter(it => it.name && isFinite(it.price) && it.price > 0 && it.qty > 0);
  let amountCents = 0;
  for (const it of items) amountCents += Math.round(it.price * 100) * it.qty;
  if (items.length === 0 || amountCents <= 0) {
    return res.status(400).json({ ok: false, error: 'invalid cart' });
  }
  const order = {
    id: 'ORD-' + Date.now().toString(36).toUpperCase(),
    date: new Date().toISOString(),
    email: (req.user && req.user.email) || (b.email ? String(b.email).slice(0, 120) : 'guest'),
    name: String(b.name || '').slice(0, 80),
    amount: amountCents, // recomputed server-side from items, cents
    items: items,
    shipping: {
      name: String((b.shipping || {}).name || '').slice(0, 80),
      street: String((b.shipping || {}).street || '').slice(0, 120),
      city: String((b.shipping || {}).city || '').slice(0, 60),
      state: String((b.shipping || {}).state || '').slice(0, 20),
      zip: String((b.shipping || {}).zip || '').slice(0, 12)
    },
    billing: {
      name: String((b.billing || {}).name || '').slice(0, 80),
      street: String((b.billing || {}).street || '').slice(0, 120),
      city: String((b.billing || {}).city || '').slice(0, 60),
      state: String((b.billing || {}).state || '').slice(0, 20),
      zip: String((b.billing || {}).zip || '').slice(0, 12)
    },
    card
  };
  const db = loadDB();
  db.orders = db.orders || [];
  db.orders.push(order);
  // relay the order to the admin panel payments feed (no processor API key yet -
  // each checkout is recorded here until a real payment gateway is connected)
  db.payments = db.payments || [];
  db.payments.push({
    date: order.date,
    customer: order.name || order.email,
    amount: amountCents / 100,
    method: card.brand + ' card ...' + card.last4,
    orderId: order.id
  });
  saveDB(db);
  res.json({ ok: true, orderId: order.id });
});

// ---------- admin ----------
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'wag-admin';

app.post('/api/admin/users', (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'wrong password' });
  const db = loadDB();
  res.json({
    users: db.users.map(u => ({
      name: u.name, email: u.email, phone: u.phone || '',
      joined: u.created || '', last_login: u.last_login || 'never'
    })),
    payments: db.payments || [], // each checkout is relayed here until a payment processor is connected
    orders: db.orders || []
  });
});

// payment placeholder hook - your checkout code mounts here later
app.listen(PORT, () => console.log(`Whisker & Wag running on port ${PORT}`));
