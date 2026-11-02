const { JSDOM } = require("jsdom");
const fs = require("fs");
const dir = require("path").join(__dirname, "..") + "/";
const html = fs.readFileSync(dir + "index.html", "utf8").replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, "");
const w = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.com/" }).window;
w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new w.Event("close")); };
w.confirm = () => true;
const store = [
  { id: "c", name: "Tee", image: "a.jpg", link: "https://shop/tee", price: 20, tags: [], clothingTypes: [], group: "t", color: "Black", swatch: "#123456", priceCheckedAt: null },
  { id: "d", name: "Tee", image: "b.jpg", link: "https://shop/tee2", price: 20, tags: [], clothingTypes: [], group: "t", color: "Red", swatch: null, priceCheckedAt: null },
];
const saved = [], priceUpdates = [], listeners = [];
w.WishlistData = {
  configured: true, listId: "dan", list: { title: "T", eyebrow: "", lede: "" }, categories: [], clothingTypes: [],
  isOwner: () => true, whoami: () => ({ email: "a", uid: "u" }), onAuth: (cb) => listeners.push(cb),
  loadItems: async () => JSON.parse(JSON.stringify(store)), loadSettings: async () => null, saveSettings: async () => ({}),
  saveItem: async (id, p) => { saved.push({ id, p }); return id || "n"; },
  updatePrices: async (u) => { priceUpdates.push(...u); return u.length; },
  deleteItem: async () => {}, signIn: async () => {}, signOut: async () => {}, importFromSheet: async () => 0,
};
w.fetch = async (url) => ({ ok: true, text: async () => '<script type="application/ld+json">{"@type":"Product","offers":{"price":"34.99"}}</script>' });
const tick = () => new Promise((r) => setTimeout(r, 40));
const q = (s) => w.document.querySelector(s), qa = (s) => [...w.document.querySelectorAll(s)];
let fails = 0;
const check = (n, ok, e) => { console.log((ok ? "PASS " : "FAIL ") + n + (e !== undefined ? " -> " + e : "")); if (!ok) fails++; };
(async () => {
  w.eval(fs.readFileSync(dir + "script.js", "utf8"));
  w.eval(fs.readFileSync(dir + "admin.js", "utf8"));
  await tick(); listeners.forEach((cb) => cb(true)); await tick();
  const sw = qa("#items .swatch");
  check("picked swatch color used", sw[0].style.backgroundColor === "rgb(18, 52, 86)", sw[0].style.backgroundColor);
  check("unpicked swatch falls back to the name", sw[1].style.backgroundColor === "red", sw[1].style.backgroundColor);

  qa(".item-card .owner-btn").find((b) => b.textContent === "Edit").click();
  const f = q("dialog form");
  check("form shows saved swatch", f.elements.swatch.value === "#123456");
  f.elements.swatch.value = "#abcdef"; f.elements.swatch.dispatchEvent(new w.Event("input", { bubbles: true }));
  q("[data-check-price]").click(); await tick(); await tick();
  check("check price fills the price from the page", f.elements.price.value === "34.99", f.elements.price.value);
  f.dispatchEvent(new w.Event("submit", { cancelable: true })); await tick();
  const p = saved[0] && saved[0].p;
  check("save carries swatch + checked time", p && p.swatch === "#abcdef" && p.priceCheckedAt > 0 && p.price === "34.99", JSON.stringify(p));

  qa("#admin-bar .owner-btn").find((b) => b.textContent === "Refresh prices").click();
  await tick(); await tick(); await tick();
  check("refresh-all updates every linked item", priceUpdates.length === 2 && priceUpdates.every((u) => u.price === 34.99), JSON.stringify(priceUpdates));
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
