// Whisker &amp; Wag cart - client-side, lives in localStorage
var WWCart = (function () {
  var KEY = 'ww-cart';
  function get() {
    var raw;
    try { raw = JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { raw = []; }
    // sanitize: drop items with broken prices/qty (e.g. from an older bug)
    var clean = raw.filter(function (i) {
      return i && typeof i.name === 'string' && isFinite(Number(i.price)) && Number(i.price) > 0 && isFinite(Number(i.qty)) && Number(i.qty) > 0;
    }).map(function (i) {
      return { name: i.name, price: Number(i.price), qty: Math.floor(Number(i.qty)) };
    });
    if (clean.length !== raw.length) save(clean); // persist the cleanup
    return clean;
  }
  function save(cart) { localStorage.setItem(KEY, JSON.stringify(cart)); updateBadge(); }
  function add(name, price) {
    var cart = get();
    var found = cart.filter(function (i) { return i.name === name; })[0];
    if (found) found.qty += 1;
    else cart.push({ name: name, price: price, qty: 1 });
    save(cart);
  }
  function setQty(name, qty) {
    var cart = get();
    cart = cart.filter(function (i) {
      if (i.name !== name) return true;
      if (qty <= 0) return false;
      i.qty = qty; return true;
    });
    save(cart);
  }
  function remove(name) { setQty(name, 0); }
  function clear() { localStorage.removeItem(KEY); updateBadge(); }
  function total() {
    return get().reduce(function (sum, i) { return sum + i.price * i.qty; }, 0);
  }
  function count() {
    return get().reduce(function (sum, i) { return sum + i.qty; }, 0);
  }
  function updateBadge() {
    var badge = document.querySelector('.cart-count');
    if (!badge) return;
    var n = count();
    badge.textContent = n > 0 ? n : '';
    badge.style.display = n > 0 ? 'inline-block' : 'none';
  }
  document.addEventListener('DOMContentLoaded', updateBadge);
  return { get: get, add: add, setQty: setQty, remove: remove, clear: clear, total: total, count: count };
})();
