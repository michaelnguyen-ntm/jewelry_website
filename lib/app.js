const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const products = require('./products');
const store = require('./store');
const auth = require('./auth');
const art = require('../public/js/art');

// Keep in sync with the constants at the top of public/js/app.js.
const FREE_SHIPPING_MIN = 12500000;
const SHIPPING_FEE = 625000;
const MAX_QTY = 10;

const CATEGORIES = ['rings', 'necklaces', 'earrings', 'bracelets'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SORTERS = {
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  name: (a, b) => a.name.localeCompare(b.name, 'vi'),
};

const app = express();
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

const text = (value, max = 200) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const fail = (res, status, error) => res.status(status).json({ error });

// ---------- Products ----------

app.get('/api/products', (req, res) => {
  const { category, sort } = req.query;
  let list = CATEGORIES.includes(category) ? products.filter((p) => p.category === category) : [...products];
  if (SORTERS[sort]) list.sort(SORTERS[sort]);
  res.json(list);
});

app.get('/api/products/:id', (req, res) => {
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return fail(res, 404, 'Không tìm thấy sản phẩm.');
  res.json(product);
});

// The generated illustration as an image file, for anything that needs a picture URL
// (e.g. product_image_url in the Insider integration).
app.get('/api/products/:id/image.svg', (req, res) => {
  const product = products.find((p) => p.id === req.params.id);
  if (!product) return fail(res, 404, 'Không tìm thấy sản phẩm.');
  res.set('Cache-Control', 'public, max-age=86400');
  res.type('image/svg+xml').send(art.svg(product));
});

// ---------- Auth ----------

app.post('/api/auth/signup', async (req, res) => {
  const body = req.body || {};
  const name = text(body.name, 80);
  const email = text(body.email, 200).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  if (!name) return fail(res, 400, 'Vui lòng nhập họ tên của bạn.');
  if (!EMAIL_RE.test(email)) return fail(res, 400, 'Vui lòng nhập địa chỉ email hợp lệ.');
  if (password.length < 8) return fail(res, 400, 'Mật khẩu phải có ít nhất 8 ký tự.');
  if (password.length > 200) return fail(res, 400, 'Mật khẩu quá dài.');

  const user = { name, email, passwordHash: auth.hashPassword(password), createdAt: new Date().toISOString() };
  const created = await store.setIfAbsent(`user:${email}`, user);
  if (!created) return fail(res, 409, 'Đã có tài khoản dùng email này.');

  auth.startSession(res, user);
  res.status(201).json({ user: { name, email } });
});

app.post('/api/auth/login', async (req, res) => {
  const body = req.body || {};
  const email = text(body.email, 200).toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';

  const user = email ? await store.get(`user:${email}`) : null;
  if (!user || !auth.verifyPassword(password, user.passwordHash)) {
    return fail(res, 401, 'Email hoặc mật khẩu không đúng.');
  }

  auth.startSession(res, user);
  res.json({ user: { name: user.name, email: user.email } });
});

app.post('/api/auth/logout', (req, res) => {
  auth.endSession(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: auth.currentUser(req) });
});

// ---------- Orders ----------

app.post('/api/orders', async (req, res) => {
  const body = req.body || {};
  if (!Array.isArray(body.items) || body.items.length === 0) return fail(res, 400, 'Giỏ hàng của bạn đang trống.');

  // Prices always come from the catalogue, never from the client.
  const items = [];
  for (const line of body.items) {
    const product = products.find((p) => p.id === (line && line.id));
    const qty = Number(line && line.qty);
    if (!product || !Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
      return fail(res, 400, 'Một sản phẩm trong giỏ hàng của bạn không còn bán nữa.');
    }
    if (items.some((i) => i.id === product.id)) return fail(res, 400, 'Giỏ hàng của bạn có sản phẩm bị trùng.');
    items.push({ id: product.id, name: product.name, price: product.price, qty, total: product.price * qty });
  }

  const input = body.customer || {};
  const customer = {
    name: text(input.name, 80),
    email: text(input.email, 200).toLowerCase(),
    address: text(input.address),
    city: text(input.city, 80),
    postalCode: text(input.postalCode, 20),
    country: text(input.country, 80),
  };
  if (!EMAIL_RE.test(customer.email)) return fail(res, 400, 'Vui lòng nhập địa chỉ email hợp lệ.');
  if (Object.values(customer).some((value) => !value)) {
    return fail(res, 400, 'Vui lòng điền đầy đủ thông tin liên hệ và giao hàng.');
  }

  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  const shipping = subtotal >= FREE_SHIPPING_MIN ? 0 : SHIPPING_FEE;
  const user = auth.currentUser(req);

  const order = {
    id: `AU-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    createdAt: new Date().toISOString(),
    account: user ? user.email : null,
    customer,
    items,
    subtotal,
    shipping,
    total: subtotal + shipping,
  };
  await store.set(`order:${order.id}`, order);

  res.status(201).json({ order });
});

// ---------- Fallbacks ----------

app.use('/api', (req, res) => fail(res, 404, 'Không tìm thấy.'));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  const status = err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status === 500) console.error(err);
  fail(res, status, status === 500 ? 'Đã xảy ra lỗi. Vui lòng thử lại.' : 'Yêu cầu không hợp lệ.');
});

module.exports = app;
