(() => {
  'use strict';

  // Keep in sync with the constants at the top of lib/app.js.
  const FREE_SHIPPING_MIN = 12500000;
  const SHIPPING_FEE = 625000;
  const MAX_QTY = 10;

  const CART_KEY = 'aurelle_cart';
  const ORDER_KEY = 'aurelle_last_order';
  const TRACKED_ORDER_KEY = 'aurelle_tracked_order';
  const CATEGORIES = ['rings', 'necklaces', 'earrings', 'bracelets'];
  const CATEGORY_LABELS = { rings: 'Nhẫn', necklaces: 'Dây chuyền', earrings: 'Bông tai', bracelets: 'Vòng tay' };

  // ---------- Helpers ----------

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const money = (n) => Number(n).toLocaleString('vi-VN') + ' ₫';
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const label = (category) => CATEGORY_LABELS[category] || cap(category);
  // Vietnamese names put the given name last.
  const givenName = (name) => name.trim().split(/\s+/).pop();
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch('/api' + path, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Đã xảy ra lỗi. Vui lòng thử lại.');
    return data;
  }

  let productsPromise;
  const getProducts = () => (productsPromise ||= api('/products'));

  let mePromise;
  const getMe = () => (mePromise ||= api('/auth/me').then((d) => d.user).catch(() => null));

  function toast(message) {
    let el = $('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ---------- Cart (stored in the browser) ----------

  const Cart = {
    items() {
      try {
        const items = JSON.parse(localStorage.getItem(CART_KEY));
        return Array.isArray(items) ? items : [];
      } catch {
        return [];
      }
    },
    save(items) {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
      updateCartCount();
    },
    add(id, qty = 1) {
      const items = this.items();
      const line = items.find((i) => i.id === id);
      const before = line ? line.qty : 0;
      const after = Math.min(MAX_QTY, before + qty);
      if (line) line.qty = after;
      else items.push({ id, qty: after });
      this.save(items);
      trackCartChange(id, after - before);
    },
    setQty(id, qty) {
      const line = this.items().find((i) => i.id === id);
      if (!line) return;
      const after = Math.max(0, Math.min(MAX_QTY, qty));
      const items = this.items().map((i) => (i.id === id ? { ...i, qty: after } : i));
      this.save(items.filter((i) => i.qty > 0));
      trackCartChange(id, after - line.qty);
    },
    remove(id) {
      const line = this.items().find((i) => i.id === id);
      this.save(this.items().filter((i) => i.id !== id));
      if (line) trackCartChange(id, -line.qty);
    },
    clear() {
      this.save([]);
    },
    count() {
      return this.items().reduce((sum, i) => sum + i.qty, 0);
    },
  };

  // Joins the stored cart with the catalogue, dropping anything no longer sold.
  function cartLines(products) {
    return Cart.items()
      .map((item) => {
        const product = products.find((p) => p.id === item.id);
        return product && { product, qty: item.qty, total: product.price * item.qty };
      })
      .filter(Boolean);
  }

  function totals(lines) {
    const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
    const shipping = subtotal >= FREE_SHIPPING_MIN ? 0 : SHIPPING_FEE;
    return { subtotal, shipping, total: subtotal + shipping };
  }

  function summaryRows({ subtotal, shipping, total }) {
    return `
      <div class="summary-row"><span>Tạm tính</span><span>${money(subtotal)}</span></div>
      <div class="summary-row"><span>Phí vận chuyển</span><span>${shipping ? money(shipping) : 'Miễn phí'}</span></div>
      <div class="summary-row summary-total"><span>Tổng cộng</span><span>${money(total)}</span></div>`;
  }

  function updateCartCount() {
    const count = Cart.count();
    $$('.cart-count').forEach((el) => {
      el.textContent = count;
      el.hidden = count === 0;
    });
  }

  // ---------- Insider (Web SDK) ----------
  //
  // The queue and ins.js are set up in each page's <head>. Every page view pushes, in
  // this order: user data (user, currency, cart) → one page type → init.

  const track = (type, value) => window.InsiderQueue.push(value === undefined ? { type } : { type, value });
  const absolute = (path) => new URL(path, location.origin).href;

  function insiderProduct(p, quantity) {
    const item = {
      id: p.id,
      name: p.name,
      taxonomy: [label(p.category)],
      unit_price: p.price,
      unit_sale_price: p.price,
      url: absolute(`/product?id=${encodeURIComponent(p.id)}`),
      product_image_url: absolute(p.image || `/api/products/${encodeURIComponent(p.id)}/image.svg`),
      custom: { material: p.material, gem: p.gem },
    };
    if (quantity) item.quantity = quantity;
    return item;
  }

  // Insider's cart total includes shipping.
  function insiderCart(lines) {
    if (!lines.length) return { total: 0, items: [] };
    const sum = totals(lines);
    return {
      total: sum.total,
      items: lines.map(({ product, qty }) => insiderProduct(product, qty)),
      shipping_cost: sum.shipping,
    };
  }

  function insiderUser({ name, email }, extra) {
    const parts = name.trim().split(/\s+/);
    const user = { email, name: parts.pop(), language: 'vi_VN', ...extra };
    if (parts.length) user.surname = parts.join(' ');
    return user;
  }

  // Sends one page view. `customer` (an order's contact details) identifies guests on
  // the confirmation page and adds the shipping city and country.
  async function trackPage(type, value, customer) {
    try {
      const [me, products] = await Promise.all([getMe(), getProducts().catch(() => [])]);
      const identity = me || customer;
      if (identity) {
        track('user', insiderUser(identity, customer && { city: customer.city, country: customer.country }));
      }
      track('currency', 'VND');
      // A cart push also sets the page type to cart, so the real page type goes after it.
      const lines = cartLines(products);
      if (type === 'cart' || lines.length) track('cart', insiderCart(lines));
      if (type !== 'cart') track(type, value);
      track('init');
    } catch (err) {
      console.error(err);
    }
  }

  // Reports a change in one cart line's quantity.
  function trackCartChange(id, delta) {
    if (!delta) return;
    getProducts()
      .then((products) => {
        const p = products.find((x) => x.id === id);
        if (p) track(delta > 0 ? 'add_to_cart' : 'remove_from_cart', insiderProduct(p, Math.abs(delta)));
      })
      .catch(() => {});
  }

  async function trackPurchase(order) {
    // Reloading the confirmation page must not report the order twice.
    if (sessionStorage.getItem(TRACKED_ORDER_KEY) === order.id) {
      return trackPage('other', { name: 'Order confirmation' });
    }
    sessionStorage.setItem(TRACKED_ORDER_KEY, order.id);
    const products = await getProducts().catch(() => []);
    const items = order.items
      .map((item) => {
        const p = products.find((x) => x.id === item.id);
        return p && { ...insiderProduct(p, item.qty), unit_price: item.price, unit_sale_price: item.price };
      })
      .filter(Boolean);
    return trackPage(
      'purchase',
      { order_id: order.id, total: order.total, items, shipping_cost: order.shipping },
      order.customer
    );
  }

  // ---------- Product illustrations ----------

  // Returns markup for a product's picture: its `image` if set, otherwise a generated SVG (js/art.js).
  function productArt(p) {
    if (p.image) return `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`;
    return AurelleArt.svg(p);
  }

  function productCard(p) {
    const href = `/product?id=${encodeURIComponent(p.id)}`;
    return `
      <article class="card">
        <a class="card-media art" href="${href}">
          ${productArt(p)}
          ${p.badge ? `<span class="badge">${esc(p.badge)}</span>` : ''}
        </a>
        <div class="card-body">
          <p class="card-meta">${esc(p.material)}</p>
          <h3 class="card-title"><a href="${href}">${esc(p.name)}</a></h3>
          <div class="card-foot">
            <span class="price">${money(p.price)}</span>
            <button class="link-btn" type="button" data-add="${esc(p.id)}" data-name="${esc(p.name)}">Thêm vào giỏ</button>
          </div>
        </div>
      </article>`;
  }

  // ---------- Header & footer ----------

  function renderChrome() {
    const categoryLinks = CATEGORIES.map((c) => `<a href="/collection?category=${c}">${label(c)}</a>`).join('');

    $('#site-header').innerHTML = `
      <div class="announce">Miễn phí vận chuyển có bảo hiểm cho đơn hàng trên ${money(FREE_SHIPPING_MIN)}</div>
      <div class="nav container">
        <button class="nav-toggle" type="button" aria-label="Mở hoặc đóng menu"><span></span><span></span></button>
        <a class="logo" href="/" aria-label="PNJ — Trang chủ"><img src="/img/brand/pnj-logo.png" alt="PNJ" width="114" height="46"></a>
        <nav class="nav-links" aria-label="Chính">
          <a href="/collection">Tất cả sản phẩm</a>
          ${categoryLinks}
        </nav>
        <div class="nav-actions">
          <span class="account-slot"></span>
          <a class="cart-link" href="/cart">Giỏ hàng <span class="cart-count" hidden>0</span></a>
        </div>
      </div>`;

    $('#site-footer').innerHTML = `
      <div class="container footer-grid">
        <div>
          <a class="logo" href="/" aria-label="PNJ — Trang chủ"><img src="/img/brand/pnj-logo-white.png" alt="PNJ" width="129" height="52"></a>
          <p>PNJ — Niềm tin và Phong cách. Trang sức vàng, bạc, kim cương và đá quý được chế tác tinh xảo để đồng hành cùng bạn trọn đời.</p>
        </div>
        <div>
          <h4>Mua sắm</h4>
          <a href="/collection">Tất cả sản phẩm</a>
          ${categoryLinks}
        </div>
        <div>
          <h4>Tài khoản</h4>
          <a href="/login">Đăng nhập</a>
          <a href="/signup">Tạo tài khoản</a>
          <a href="/cart">Giỏ hàng của bạn</a>
        </div>
        <div>
          <h4>Cam kết của chúng tôi</h4>
          <p>Đá quý có nguồn gốc trách nhiệm<br>Kim loại quý tái chế<br>Đổi trả trong 30 ngày</p>
        </div>
      </div>
      <div class="container footer-base">© ${new Date().getFullYear()} PNJ. Cửa hàng demo — không có đơn hàng thật nào được xử lý.</div>`;

    $('.nav-toggle').addEventListener('click', () => $('#site-header').classList.toggle('open'));
    updateCartCount();

    getMe().then((user) => {
      $('.account-slot').innerHTML = user
        ? `<span class="nav-user">Xin chào, ${esc(givenName(user.name))}</span>
           <button class="link-btn" type="button" data-logout>Đăng xuất</button>`
        : `<a href="/login">Đăng nhập</a>`;
    });
  }

  document.addEventListener('click', async (event) => {
    const add = event.target.closest('[data-add]');
    if (add) {
      Cart.add(add.dataset.add, Number(add.dataset.qty) || 1);
      toast(`Đã thêm ${add.dataset.name || 'sản phẩm'} vào giỏ hàng`);
      return;
    }
    if (event.target.closest('[data-logout]')) {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      location.href = '/';
    }
  });

  // ---------- Pages ----------

  const pages = {
    async home() {
      trackPage('home', {});
      const products = await getProducts();
      $$('[data-art-category]').forEach((el) => {
        const category = el.dataset.artCategory;
        el.innerHTML = `<img src="/img/categories/${esc(category)}.png" alt="${esc(label(category))}">`;
      });
      $('#featured-grid').innerHTML = products
        .filter((p) => p.featured)
        .slice(0, 4)
        .map(productCard)
        .join('');
    },

    async collection() {
      const params = new URLSearchParams(location.search);
      let category = CATEGORIES.includes(params.get('category')) ? params.get('category') : '';
      const chips = $('#category-chips');
      const sort = $('#sort');
      let tracked;

      async function load() {
        // Switching category counts as a new page view; re-sorting does not.
        if (tracked !== category) {
          tracked = category;
          trackPage('category', { breadcrumb: [category ? label(category) : 'Tất cả sản phẩm'] });
        }
        $('#collection-title').textContent = category ? label(category) : 'Bộ sưu tập';
        document.title = `${category ? label(category) : 'Tất cả sản phẩm'} | PNJ`;
        chips.innerHTML = ['', ...CATEGORIES]
          .map(
            (c) =>
              `<button type="button" class="chip${c === category ? ' active' : ''}" data-category="${c}">${c ? label(c) : 'Tất cả'}</button>`
          )
          .join('');
        const products = await api(`/products?category=${category}&sort=${sort.value}`);
        $('#collection-count').textContent = `${products.length} sản phẩm`;
        $('#collection-grid').innerHTML = products.map(productCard).join('');
      }

      chips.addEventListener('click', (event) => {
        const chip = event.target.closest('[data-category]');
        if (!chip) return;
        category = chip.dataset.category;
        history.replaceState(null, '', category ? `/collection?category=${category}` : '/collection');
        load().catch(showError);
      });
      sort.addEventListener('change', () => load().catch(showError));
      await load();
    },

    async product() {
      const root = $('#product-root');
      const id = new URLSearchParams(location.search).get('id') || '';
      let p;
      try {
        p = await api(`/products/${encodeURIComponent(id)}`);
      } catch {
        root.innerHTML = `
          <div class="empty">
            <h1>Chúng tôi không tìm thấy sản phẩm này</h1>
            <p>Có thể sản phẩm đã bán hết hoặc đã được chuyển đi.</p>
            <a class="btn" href="/collection">Xem bộ sưu tập</a>
          </div>`;
        trackPage('other', { name: 'Product not found' });
        return;
      }
      trackPage('product', { ...insiderProduct(p), description: p.description, brand: 'PNJ' });

      document.title = `${p.name} | PNJ`;
      root.innerHTML = `
        <nav class="crumbs">
          <a href="/">Trang chủ</a> / <a href="/collection?category=${p.category}">${label(p.category)}</a> / <span>${esc(p.name)}</span>
        </nav>
        <div class="product">
          <div class="product-media art">${productArt(p)}</div>
          <div class="product-info">
            <p class="eyebrow">${esc(p.material)}</p>
            <h1>${esc(p.name)}</h1>
            <p class="product-price">${money(p.price)}</p>
            <p class="product-desc">${esc(p.description)}</p>
            <div class="buy-row">
              <div class="qty" aria-label="Số lượng">
                <button type="button" data-step="-1" aria-label="Giảm số lượng">−</button>
                <span id="qty-value">1</span>
                <button type="button" data-step="1" aria-label="Tăng số lượng">+</button>
              </div>
              <button class="btn" type="button" id="add-to-bag" data-add="${esc(p.id)}" data-name="${esc(p.name)}" data-qty="1">Thêm vào giỏ</button>
            </div>
            <dl class="specs">
              <div><dt>Kim loại</dt><dd>${esc(cap(p.material))}</dd></div>
              <div><dt>Đá</dt><dd>${esc(p.gem)}</dd></div>
            </dl>
            <ul class="details">${p.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
            <p class="assurance">Miễn phí gói quà · Đổi trả trong 30 ngày · Chăm sóc trọn đời</p>
          </div>
        </div>`;

      $('.qty', root).addEventListener('click', (event) => {
        const step = Number(event.target.dataset.step);
        if (!step) return;
        const button = $('#add-to-bag');
        const qty = Math.min(MAX_QTY, Math.max(1, Number(button.dataset.qty) + step));
        button.dataset.qty = qty;
        $('#qty-value').textContent = qty;
      });

      const products = await getProducts();
      const others = products.filter((x) => x.id !== p.id);
      const related = [...others.filter((x) => x.category === p.category), ...others.filter((x) => x.category !== p.category)];
      $('#related-grid').innerHTML = related.slice(0, 4).map(productCard).join('');
      $('#related').hidden = false;
    },

    async cart() {
      const root = $('#cart-root');
      trackPage('cart');
      const products = await getProducts();

      function render() {
        const lines = cartLines(products);
        if (!lines.length) {
          root.innerHTML = `
            <div class="empty">
              <h1>Giỏ hàng của bạn đang trống</h1>
              <p>Hãy khám phá món trang sức bạn sẽ trân quý.</p>
              <a class="btn" href="/collection">Mua bộ sưu tập</a>
            </div>`;
          return;
        }
        const sum = totals(lines);
        const remaining = FREE_SHIPPING_MIN - sum.subtotal;
        root.innerHTML = `
          <h1 class="page-title">Giỏ hàng của bạn</h1>
          <div class="split">
            <div class="cart-lines">
              ${lines
                .map(
                  ({ product: p, qty, total }) => `
                <div class="cart-line">
                  <a class="cart-thumb art" href="/product?id=${encodeURIComponent(p.id)}">${productArt(p)}</a>
                  <div class="cart-line-info">
                    <a class="cart-line-name" href="/product?id=${encodeURIComponent(p.id)}">${esc(p.name)}</a>
                    <p class="card-meta">${esc(p.material)}</p>
                    <div class="qty small">
                      <button type="button" data-id="${esc(p.id)}" data-qty="-1" aria-label="Giảm số lượng">−</button>
                      <span>${qty}</span>
                      <button type="button" data-id="${esc(p.id)}" data-qty="1" aria-label="Tăng số lượng">+</button>
                    </div>
                  </div>
                  <div class="cart-line-end">
                    <span class="price">${money(total)}</span>
                    <button class="link-btn" type="button" data-remove="${esc(p.id)}">Xóa</button>
                  </div>
                </div>`
                )
                .join('')}
            </div>
            <aside class="summary">
              <h2>Tóm tắt đơn hàng</h2>
              ${summaryRows(sum)}
              ${remaining > 0 ? `<p class="summary-note">Mua thêm ${money(remaining)} để được miễn phí vận chuyển.</p>` : ''}
              <a class="btn block" href="/checkout">Tiến hành thanh toán</a>
              <a class="summary-link" href="/collection">Tiếp tục mua sắm</a>
            </aside>
          </div>`;
      }

      root.addEventListener('click', (event) => {
        const button = event.target.closest('[data-qty], [data-remove]');
        if (!button) return;
        if (button.dataset.remove) {
          Cart.remove(button.dataset.remove);
        } else {
          const line = Cart.items().find((i) => i.id === button.dataset.id);
          if (line) Cart.setQty(line.id, line.qty + Number(button.dataset.qty));
        }
        render();
      });
      render();
    },

    async checkout() {
      const lines = cartLines(await getProducts());
      if (!lines.length) {
        location.replace('/cart');
        return;
      }
      trackPage('other', { name: 'Checkout' });

      $('#checkout-summary').innerHTML = `
        <h2>Đơn hàng của bạn</h2>
        ${lines
          .map(
            ({ product: p, qty, total }) => `
          <div class="mini-line">
            <div class="mini-thumb art">${productArt(p)}<span class="mini-qty">${qty}</span></div>
            <span class="mini-name">${esc(p.name)}</span>
            <span>${money(total)}</span>
          </div>`
          )
          .join('')}
        ${summaryRows(totals(lines))}`;

      const form = $('#checkout-form');
      const user = await getMe();
      if (user) {
        form.elements.name.value = user.name;
        form.elements.email.value = user.email;
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const field = (name) => form.elements[name].value;
        // Card fields are for show only and are never sent to the server.
        const customer = {
          name: field('name'),
          email: field('email'),
          address: field('address'),
          city: field('city'),
          postalCode: field('postalCode'),
          country: field('country'),
        };
        await submitForm(form, async () => {
          const { order } = await api('/orders', { method: 'POST', body: { items: Cart.items(), customer } });
          sessionStorage.setItem(ORDER_KEY, JSON.stringify(order));
          Cart.clear();
          location.href = `/success?order=${encodeURIComponent(order.id)}`;
        });
      });
    },

    success() {
      const id = new URLSearchParams(location.search).get('order') || '';
      let order = null;
      try {
        order = JSON.parse(sessionStorage.getItem(ORDER_KEY));
      } catch {}
      if (!order || order.id !== id) {
        if (id) $('#order-number').textContent = `Đơn hàng ${id}`;
        trackPage('other', { name: 'Order confirmation' });
        return;
      }
      trackPurchase(order);

      const c = order.customer;
      $('#order-number').textContent = `Đơn hàng ${order.id}`;
      $('#order-lead').textContent = `Cảm ơn bạn, ${givenName(c.name)}. Đơn hàng của bạn đã được xác nhận và đang được chuẩn bị chu đáo.`;
      $('#order-details').innerHTML = `
        <div class="summary">
          <h2>Chi tiết đơn hàng</h2>
          ${order.items
            .map(
              (item) => `
            <div class="summary-row"><span>${esc(item.name)} × ${item.qty}</span><span>${money(item.total)}</span></div>`
            )
            .join('')}
          <hr>
          ${summaryRows(order)}
          <hr>
          <h3>Giao đến</h3>
          <p class="address">${esc(c.name)}<br>${esc(c.address)}<br>${esc(c.city)} ${esc(c.postalCode)}<br>${esc(c.country)}</p>
        </div>`;
    },

    login() {
      trackPage('other', { name: 'Login' });
      authForm('/auth/login', (form) => ({ email: form.elements.email.value, password: form.elements.password.value }));
    },

    signup() {
      trackPage('other', { name: 'Sign up' });
      authForm('/auth/signup', (form) => ({
        name: form.elements.name.value,
        email: form.elements.email.value,
        password: form.elements.password.value,
      }));
    },

    notfound() {
      trackPage('other', { name: 'Page not found' });
    },
  };

  // Only follow same-site paths, so ?next= can't be used to bounce people elsewhere.
  function nextPath() {
    const next = new URLSearchParams(location.search).get('next') || '';
    return /^\/(?![/\\])/.test(next) ? next : '/';
  }

  function authForm(endpoint, readFields) {
    const form = $('#auth-form');
    const next = new URLSearchParams(location.search).get('next');
    if (next) $$('[data-keep-next]').forEach((a) => (a.href += `?next=${encodeURIComponent(next)}`));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      await submitForm(form, async () => {
        await api(endpoint, { method: 'POST', body: readFields(form) });
        location.href = nextPath();
      });
    });
  }

  // Runs a form action with a disabled button while pending and an inline error on failure.
  async function submitForm(form, action) {
    const button = $('button[type="submit"]', form);
    const error = $('.form-error', form);
    error.hidden = true;
    button.disabled = true;
    try {
      await action();
    } catch (err) {
      error.textContent = err.message;
      error.hidden = false;
      button.disabled = false;
    }
  }

  function showError() {
    toast('Không thể tải trang này. Vui lòng tải lại và thử lại.');
  }

  renderChrome();
  const init = pages[document.body.dataset.page];
  if (init) Promise.resolve().then(init).catch(showError);
})();
