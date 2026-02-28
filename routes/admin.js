const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.use(requireAdmin);

// Dashboard — list all clients
router.get('/dashboard', (req, res) => {
  const clients = db.prepare('SELECT * FROM clients ORDER BY created_at DESC').all();
  res.render('admin/dashboard', { clients, success: req.query.success || null });
});

// Create new client
router.get('/clients/new', (req, res) => {
  res.render('admin/create', { error: null });
});

router.post('/clients/new', (req, res) => {
  const { username, password, first_name, last_name, date_of_birth } = req.body;

  const existing = db.prepare('SELECT id FROM clients WHERE username = ?').get(username);
  if (existing) {
    return res.render('admin/create', { error: `Username "${username}" is already taken.` });
  }

  const hash = bcrypt.hashSync(password, 10);
  db.prepare(
    'INSERT INTO clients (username, password_hash, first_name, last_name, date_of_birth) VALUES (?, ?, ?, ?, ?)'
  ).run(username, hash, first_name || null, last_name || null, date_of_birth || null);

  res.redirect('/admin/dashboard?success=Client+created+successfully.');
});

// Edit client
router.get('/clients/:id/edit', (req, res) => {
  const record = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!record) return res.redirect('/admin/dashboard');
  res.render('admin/edit', { record, error: null, success: null });
});

router.post('/clients/:id/edit', (req, res) => {
  const { username, first_name, last_name, date_of_birth, password } = req.body;
  const record = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!record) return res.redirect('/admin/dashboard');

  const conflict = db.prepare('SELECT id FROM clients WHERE username = ? AND id != ?').get(username, req.params.id);
  if (conflict) {
    return res.render('admin/edit', { record, error: `Username "${username}" is already taken.`, success: null });
  }

  db.prepare('UPDATE clients SET username = ?, first_name = ?, last_name = ?, date_of_birth = ? WHERE id = ?')
    .run(username, first_name || null, last_name || null, date_of_birth || null, req.params.id);

  if (password && password.trim().length >= 6) {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE clients SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  }

  const updated = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  res.render('admin/edit', { record: updated, error: null, success: 'Client updated successfully.' });
});

// Delete client
router.post('/clients/:id/delete', (req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.redirect('/admin/dashboard?success=Client+deleted.');
});

module.exports = router;
