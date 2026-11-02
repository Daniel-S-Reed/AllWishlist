// cache, lazy admin, stale filter
const { JSDOM } = require("jsdom");
const fs = require("fs");
const dir = require("path").join(__dirname, "..") + "/";
const html = fs.readFileSync(dir + "index.html", "utf8").replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, "");
const w = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.com/" }).window;
const now = Date.now();
const store = [
  { id: "a", name: "Fresh", image: null, link: "https://x", price: 5, tags: [], clothingTypes: [], group: null, color: null, swatch: null, priceCheckedAt: now },
  { id: "b", name: "Old", image: null, link: "https://x", price: 6, tags: [], clothingTypes: [], group: null, color: null, swatch: null, priceCheckedAt: now - 90 * 86400000 },
];
let loads = 0, listeners = [];
w.localStorage.setItem("wishlist-items-dan", JSON.stringify({ t: now - 3600000, items: [{ ...store[0], name: "Cached" }] }));
w.WishlistData = { configured: true, listId: "dan", list: { title: "T", eyebrow: "", lede: "" }, categories: [], clothingTypes: [],
  isOwner: () => true, whoami: () => ({}), onAuth: (cb) => listeners.push(cb),
  loadItems: async () => { loads++; return JSON.parse(JSON.stringify(store)); }, loadSettings: async () => null, saveSettings: async () => ({}),
  updatePrices: async () => 1 };
const tick = () => new Promise((r) => setTimeout(r, 40));
const qa = (s) => [...w.document.querySelectorAll(s)];
let fails = 0; const check = (n, ok, e) => { console.log((ok ? "PASS " : "FAIL ") + n + (e !== undefined ? " -> " + e : "")); if (!ok) fails++; };
(async () => {
  w.eval(fs.readFileSync(dir + "script.js", "utf8"));
  check("cached list rendered immediately", qa("#items .item-name").some((n) => n.textContent === "Cached"));
  await tick();
  check("old cache refreshed from the database", loads === 1 && qa("#items .item-name").map((n) => n.textContent).sort().join() === "Fresh,Old", qa("#items .item-name").map((n) => n.textContent).join());
  check("fresh copy written back to cache", JSON.parse(w.localStorage.getItem("wishlist-items-dan")).items.length === 2);
  // fresh cache -> no database read
  const w2 = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.com/" }).window;
  let loads2 = 0;
  w2.localStorage.setItem("wishlist-items-dan", JSON.stringify({ t: Date.now(), items: store }));
  w2.WishlistData = { ...w.WishlistData, loadItems: async () => { loads2++; return store; }, onAuth: () => {} };
  w2.eval(fs.readFileSync(dir + "script.js", "utf8")); await tick();
  check("recent cache skips the database read", loads2 === 0 && w2.document.querySelectorAll("#items .item-card").length === 2);
  // lazy admin: owner sign-in triggers script injection
  listeners.forEach((cb) => cb(true)); await tick();
  check("signing in asks for the editor script", !!w.document.querySelector('script[src="admin.js"]'));
  // stale filter
  w.eval(fs.readFileSync(dir + "admin.js", "utf8")); listeners.forEach((cb) => cb(true)); await tick();
  const btn = qa("#admin-bar .owner-btn").find((b) => /Needs checking/.test(b.textContent));
  check("filter button shows the count", btn && /\(1\)/.test(btn.textContent), btn && btn.textContent);
  btn.click(); await tick();
  check("filter narrows to the stale item", qa("#items .item-name").map((n) => n.textContent).join() === "Old", qa("#items .item-name").map((n) => n.textContent).join());
  btn.click(); await tick();
  check("filter toggles off", qa("#items .item-card").length === 2);
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
