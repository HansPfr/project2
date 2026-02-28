const express = require('express');
const db = require('../db/database');
const { requireClient } = require('../middleware/auth');
const router = express.Router();

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

// Contacts (phones & emails)
router.get('/contacts', (req, res) => {
  const phones = db.prepare('SELECT * FROM phone_numbers WHERE client_id = ?').all(req.session.clientId);
  const emails = db.prepare('SELECT * FROM email_addresses WHERE client_id = ?').all(req.session.clientId);
  res.render('client/contacts', { phones, emails, success: req.query.success || null, error: null });
});

// Phone routes
router.post('/contacts/phones', (req, res) => {
  const { type, number } = req.body;
  db.prepare('INSERT INTO phone_numbers (client_id, type, number) VALUES (?, ?, ?)')
    .run(req.session.clientId, type, number);
  res.redirect('/client/contacts?success=Phone+number+added.');
});

router.post('/contacts/phones/:id/edit', (req, res) => {
  const { type, number } = req.body;
  const phone = db.prepare('SELECT * FROM phone_numbers WHERE id = ? AND client_id = ?')
    .get(req.params.id, req.session.clientId);
  if (!phone) return res.redirect('/client/contacts');
  db.prepare('UPDATE phone_numbers SET type = ?, number = ? WHERE id = ?')
    .run(type, number, req.params.id);
  res.redirect('/client/contacts?success=Phone+number+updated.');
});

router.post('/contacts/phones/:id/delete', (req, res) => {
  db.prepare('DELETE FROM phone_numbers WHERE id = ? AND client_id = ?')
    .run(req.params.id, req.session.clientId);
  res.redirect('/client/contacts?success=Phone+number+deleted.');
});

// Email routes
router.post('/contacts/emails', (req, res) => {
  const { type, address } = req.body;
  db.prepare('INSERT INTO email_addresses (client_id, type, address) VALUES (?, ?, ?)')
    .run(req.session.clientId, type, address);
  res.redirect('/client/contacts?success=Email+address+added.');
});

router.post('/contacts/emails/:id/edit', (req, res) => {
  const { type, address } = req.body;
  const email = db.prepare('SELECT * FROM email_addresses WHERE id = ? AND client_id = ?')
    .get(req.params.id, req.session.clientId);
  if (!email) return res.redirect('/client/contacts');
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
