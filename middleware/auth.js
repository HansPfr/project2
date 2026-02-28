function requireClient(req, res, next) {
  if (req.session && req.session.clientId) return next();
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  res.redirect('/login');
}

module.exports = { requireClient, requireAdmin };
