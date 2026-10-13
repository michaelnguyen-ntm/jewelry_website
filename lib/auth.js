const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const COOKIE = 'aurelle_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
// Set JWT_SECRET in the environment for any real deployment.
const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length || 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  };
}

function startSession(res, user) {
  const token = jwt.sign({ name: user.name, email: user.email }, SECRET, {
    expiresIn: MAX_AGE_SECONDS,
  });
  res.cookie(COOKIE, token, { ...cookieOptions(), maxAge: MAX_AGE_SECONDS * 1000 });
}

function endSession(res) {
  res.clearCookie(COOKIE, cookieOptions());
}

// Returns { name, email } for a valid session cookie, otherwise null.
function currentUser(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  try {
    const { name, email } = jwt.verify(token, SECRET);
    return { name, email };
  } catch {
    return null;
  }
}

module.exports = { hashPassword, verifyPassword, startSession, endSession, currentUser };
