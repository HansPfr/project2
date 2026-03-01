const express = require('express');
const https = require('https');
const dns   = require('dns').promises;
const db = require('../db/database');
const { requireClient } = require('../middleware/auth');
const router = express.Router();

// --- Nominatim (OpenStreetMap) address search ---
const nominatimCache = new Map(); // simple in-memory cache to respect 1 req/s policy

function nominatimSearch(q) {
  const cacheKey = q.toLowerCase();
  const cached = nominatimCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 60_000) return Promise.resolve(cached.data);

  return new Promise(resolve => {
    const path = '/search?' + new URLSearchParams({
      q, format: 'json', addressdetails: '1', limit: '8', countrycodes: 'us,ca'
    });
    https.get(
      { hostname: 'nominatim.openstreetmap.org', path,
        headers: { 'User-Agent': 'CustomerPortal/1.0', 'Accept-Language': 'en' } },
      res => {
        const chunks = [];
        res.on('data', d => chunks.push(d));
        res.on('end', () => {
          try {
            const data = JSON.parse(chunks.join(''));
            nominatimCache.set(cacheKey, { data, ts: Date.now() });
            resolve(data);
          } catch { resolve([]); }
        });
      }
    ).on('error', () => resolve([]));
  });
}

function parseNominatim(items) {
  const seen = new Set();
  return items
    .filter(r => r.address && r.address.house_number && r.address.road)
    .map(r => {
      const a = r.address;
      const street      = `${a.house_number} ${a.road}`;
      const city        = a.city || a.town || a.village || a.municipality || '';
      const lvl4        = a['ISO3166-2-lvl4'] || '';
      const state       = lvl4 ? lvl4.split('-').slice(1).join('-') : '';
      const postal_code = a.postcode || '';
      const country     = a.country_code === 'us' ? 'USA'
                        : a.country_code === 'ca' ? 'Canada' : '';
      return { street, city, state, postal_code, country };
    })
    .filter(a => {
      const key = `${a.street}|${a.city}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

router.use(requireClient);

// Dashboard
router.get('/dashboard', (req, res) => {
  const record = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.session.clientId);
  res.render('client/dashboard', { record });
});

// Personal data
router.get('/personal', (req, res) => {
  const record = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.session.clientId);
  res.render('client/personal', { record, success: null, error: null });
});

router.post('/personal', (req, res) => {
  const { first_name, last_name, date_of_birth } = req.body;
  db.prepare(
    'UPDATE clients SET first_name = ?, last_name = ?, date_of_birth = ? WHERE id = ?'
  ).run(first_name, last_name, date_of_birth || null, req.session.clientId);
  req.session.clientName = first_name || req.session.clientName;
  const record = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.session.clientId);
  res.render('client/personal', { record, success: 'Personal data updated.', error: null });
});

// Address autocomplete – local DB + Nominatim (OpenStreetMap)
router.get('/addresses/autocomplete', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json([]);

    // 1. Local DB: addresses already saved in this portal
    const local = db.prepare(
      `SELECT DISTINCT street, city, state, postal_code, country
       FROM addresses WHERE street LIKE ? ORDER BY street LIMIT 5`
    ).all(q + '%');

    // 2. Public database: Nominatim / OpenStreetMap
    const raw      = await nominatimSearch(q);
    const external = parseNominatim(raw);

    // 3. Merge – local first, then external not already represented locally
    const localKeys = new Set(local.map(a => `${a.street}|${a.city}`.toLowerCase()));
    const merged = [
      ...local,
      ...external.filter(a => !localKeys.has(`${a.street}|${a.city}`.toLowerCase()))
    ].slice(0, 10);

    res.json(merged);
  } catch {
    res.json([]);
  }
});

// Addresses
router.get('/addresses', (req, res) => {
  const addresses = db.prepare('SELECT * FROM addresses WHERE client_id = ?').all(req.session.clientId);
  res.render('client/addresses', { addresses, success: req.query.success || null, error: null });
});

router.post('/addresses', (req, res) => {
  const { type, street, street2, city, state, postal_code, country } = req.body;
  db.prepare(
    'INSERT INTO addresses (client_id, type, street, street2, city, state, postal_code, country) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.session.clientId, type, street, street2 || null, city, state || null, postal_code, country);
  res.redirect('/client/addresses?success=Address+added.');
});

router.post('/addresses/:id/edit', (req, res) => {
  const { type, street, street2, city, state, postal_code, country } = req.body;
  const addr = db.prepare('SELECT * FROM addresses WHERE id = ? AND client_id = ?')
    .get(req.params.id, req.session.clientId);
  if (!addr) return res.redirect('/client/addresses');
  db.prepare(
    'UPDATE addresses SET type = ?, street = ?, street2 = ?, city = ?, state = ?, postal_code = ?, country = ? WHERE id = ?'
  ).run(type, street, street2 || null, city, state || null, postal_code, country, req.params.id);
  res.redirect('/client/addresses?success=Address+updated.');
});

router.post('/addresses/:id/delete', (req, res) => {
  db.prepare('DELETE FROM addresses WHERE id = ? AND client_id = ?')
    .run(req.params.id, req.session.clientId);
  res.redirect('/client/addresses?success=Address+deleted.');
});

// Digit-count rules matching the client-side COUNTRIES table in phone-fields.ejs
const PHONE_RULES = {
  '+1':'+1','+7':'+7','+27':'+27','+31':'+31','+32':'+32','+33':'+33',
  '+34':'+34','+39':'+39','+41':'+41','+43':'+43','+44':'+44','+45':'+45',
  '+46':'+46','+47':'+47','+48':'+48','+49':'+49','+52':'+52','+55':'+55',
  '+60':'+60','+61':'+61','+62':'+62','+63':'+63','+64':'+64','+65':'+65',
  '+81':'+81','+82':'+82','+86':'+86','+90':'+90','+91':'+91',
  '+966':'+966','+971':'+971','+972':'+972'
};
const PHONE_DIGIT_LIMITS = {
  '+1':{min:10,max:10},'+7':{min:10,max:10},'+27':{min:9,max:9},
  '+31':{min:9,max:9},'+32':{min:8,max:9},'+33':{min:9,max:9},
  '+34':{min:9,max:9},'+39':{min:9,max:11},'+41':{min:9,max:9},
  '+43':{min:7,max:13},'+44':{min:10,max:10},'+45':{min:8,max:8},
  '+46':{min:9,max:9},'+47':{min:8,max:8},'+48':{min:9,max:9},
  '+49':{min:10,max:11},'+52':{min:10,max:10},'+55':{min:10,max:11},
  '+60':{min:9,max:10},'+61':{min:9,max:9},'+62':{min:8,max:12},
  '+63':{min:10,max:10},'+64':{min:8,max:10},'+65':{min:8,max:8},
  '+81':{min:10,max:11},'+82':{min:9,max:10},'+86':{min:11,max:11},
  '+90':{min:10,max:10},'+91':{min:10,max:10},'+966':{min:9,max:9},
  '+971':{min:9,max:9},'+972':{min:9,max:9}
};

function validatePhoneServer(dialCode, number) {
  const digits = (number || '').replace(/\D/g, '');
  if (!digits) return 'Phone number cannot be empty.';
  const rule = PHONE_DIGIT_LIMITS[dialCode];
  if (!rule) return null; // unknown dial code – accept as-is
  if (digits.length < rule.min) return `Too short for ${dialCode} (need ${rule.min} digits, got ${digits.length}).`;
  if (digits.length > rule.max) return `Too long for ${dialCode} (max ${rule.max} digits, got ${digits.length}).`;
  return null;
}

// Contacts (phones & emails)
router.get('/contacts', (req, res) => {
  const phones = db.prepare('SELECT * FROM phone_numbers WHERE client_id = ?').all(req.session.clientId);
  const emails = db.prepare('SELECT * FROM email_addresses WHERE client_id = ?').all(req.session.clientId);
  res.render('client/contacts', {
    phones, emails,
    success: req.query.success || null,
    error:   req.query.error   || null
  });
});

// Phone routes
router.post('/contacts/phones', (req, res) => {
  const { type, number, dial_code } = req.body;
  const err = validatePhoneServer(dial_code, number);
  if (err) return res.redirect('/client/contacts?error=' + encodeURIComponent(err));
  db.prepare('INSERT INTO phone_numbers (client_id, type, dial_code, number) VALUES (?, ?, ?, ?)')
    .run(req.session.clientId, type, dial_code || '+1', number);
  res.redirect('/client/contacts?success=Phone+number+added.');
});

router.post('/contacts/phones/:id/edit', (req, res) => {
  const { type, number, dial_code } = req.body;
  const phone = db.prepare('SELECT * FROM phone_numbers WHERE id = ? AND client_id = ?')
    .get(req.params.id, req.session.clientId);
  if (!phone) return res.redirect('/client/contacts');
  const err = validatePhoneServer(dial_code, number);
  if (err) return res.redirect('/client/contacts?error=' + encodeURIComponent(err));
  db.prepare('UPDATE phone_numbers SET type = ?, dial_code = ?, number = ? WHERE id = ?')
    .run(type, dial_code || '+1', number, req.params.id);
  res.redirect('/client/contacts?success=Phone+number+updated.');
});

router.post('/contacts/phones/:id/delete', (req, res) => {
  db.prepare('DELETE FROM phone_numbers WHERE id = ? AND client_id = ?')
    .run(req.params.id, req.session.clientId);
  res.redirect('/client/contacts?success=Phone+number+deleted.');
});

// Email validation helpers
const EMAIL_REGEX = /^[^\s@]+@[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

async function checkMx(domain) {
  try {
    const records = await Promise.race([
      dns.resolveMx(domain),
      new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error(), { code: 'ETIMEOUT' })), 5000))
    ]);
    return records && records.length > 0 ? 'ok' : 'no_mx';
  } catch (e) {
    if (e.code === 'ENOTFOUND')  return 'no_domain';
    if (e.code === 'ENODATA')    return 'no_mx';
    return 'timeout'; // network issue – give benefit of the doubt
  }
}

async function validateEmailServer(address) {
  const val = (address || '').trim();
  if (!val) return 'Email address cannot be empty.';
  if (!EMAIL_REGEX.test(val)) return `"${val}" is not a valid email address.`;
  const domain = val.split('@')[1];
  const mx = await checkMx(domain);
  if (mx === 'no_domain') return `Domain "${domain}" does not exist.`;
  if (mx === 'no_mx')     return `Domain "${domain}" has no mail servers — email cannot be delivered.`;
  return null; // valid
}

// Live domain check endpoint (called by client-side JS)
router.get('/contacts/emails/check-domain', async (req, res) => {
  const domain = (req.query.domain || '').trim().toLowerCase();
  if (!domain || !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) {
    return res.json({ status: 'invalid' });
  }
  const result = await checkMx(domain);
  res.json({ status: result });
});

// Email routes
router.post('/contacts/emails', async (req, res) => {
  const { type, address } = req.body;
  const err = await validateEmailServer(address);
  if (err) return res.redirect('/client/contacts?error=' + encodeURIComponent(err));
  db.prepare('INSERT INTO email_addresses (client_id, type, address) VALUES (?, ?, ?)')
    .run(req.session.clientId, type, address);
  res.redirect('/client/contacts?success=Email+address+added.');
});

router.post('/contacts/emails/:id/edit', async (req, res) => {
  const { type, address } = req.body;
  const email = db.prepare('SELECT * FROM email_addresses WHERE id = ? AND client_id = ?')
    .get(req.params.id, req.session.clientId);
  if (!email) return res.redirect('/client/contacts');
  const err = await validateEmailServer(address);
  if (err) return res.redirect('/client/contacts?error=' + encodeURIComponent(err));
  db.prepare('UPDATE email_addresses SET type = ?, address = ? WHERE id = ?')
    .run(type, address, req.params.id);
  res.redirect('/client/contacts?success=Email+address+updated.');
});

router.post('/contacts/emails/:id/delete', (req, res) => {
  db.prepare('DELETE FROM email_addresses WHERE id = ? AND client_id = ?')
    .run(req.params.id, req.session.clientId);
  res.redirect('/client/contacts?success=Email+address+deleted.');
});

module.exports = router;
