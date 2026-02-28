const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const router = express.Router();

// Unified login
router.get('/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin/dashboard');
  if (req.session.clientId) return res.redirect('/client/dashboard');
  res.render('auth/login', { error: null });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  // Check admins first
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (admin && bcrypt.compareSync(password, admin.password_hash)) {
    req.session.adminId = admin.id;
    req.session.adminName = admin.username;
    return req.session.save(() => res.redirect('/admin/dashboard'));
  }

  // Check clients
  const client = db.prepare('SELECT * FROM clients WHERE username = ?').get(username);
  if (client && bcrypt.compareSync(password, client.password_hash)) {
    req.session.clientId = client.id;
    req.session.clientName = client.first_name || client.username;
    return req.session.save(() => res.redirect('/client/dashboard'));
  }

  res.render('auth/login', { error: 'Invalid username or password.' });
});

// Redirect old admin login URL to unified login
router.get('/admin/login', (req, res) => res.redirect('/login'));

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

router.get('/', (req, res) => res.redirect('/login'));

module.exports = router;
