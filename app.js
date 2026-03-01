const express = require('express');
const session = require('express-session');
const https   = require('https');
const fs      = require('fs');
const path    = require('path');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8, secure: true } // 8 hours; secure=true requires HTTPS
}));

// Make session available in all views
app.use((req, res, next) => {
  res.locals.session = req.session;
  next();
});

app.use('/', require('./routes/auth'));
app.use('/client', require('./routes/client'));
app.use('/admin', require('./routes/admin'));

// Load TLS certificate and key
const SSL_DIR  = path.join(__dirname, 'ssl');
const CERT_PATH = path.join(SSL_DIR, 'cert.pem');
const KEY_PATH  = path.join(SSL_DIR, 'key.pem');

if (!fs.existsSync(CERT_PATH) || !fs.existsSync(KEY_PATH)) {
  console.error('ERROR: SSL certificate files not found.');
  console.error('  Expected: ssl/cert.pem  (certificate)');
  console.error('  Expected: ssl/key.pem   (private key)');
  console.error('Place both files in the ssl/ directory and restart the server.');
  process.exit(1);
}

const sslOptions = {
  cert: fs.readFileSync(CERT_PATH),
  key:  fs.readFileSync(KEY_PATH),
};

const PORT = process.env.PORT || 3443;
https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`Customer portal running at https://localhost:${PORT}`);
});
