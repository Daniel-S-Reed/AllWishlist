const { JSDOM } = require("jsdom");
const fs = require("fs");
const dir = require("path").join(__dirname, "..") + "/";
const html = fs.readFileSync(dir + "index.html", "utf8").replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, "");
const w = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.com/" }).window;
w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new w.Event("close")); };
const store = [{ id: "c", name: "Lamp", image: "c.jpg", link: "https://shop/l", price: 50, tags: [], clothingTypes: [], group: null, color: null, swatch: null, priceCheckedAt: Date.now() - 90 * 86400000 }];
const upd = [], listeners = [];
w.WishlistData = { configured: true, listId: "dan", list: { title: "T", eyebrow: "", lede: "" }, categories: [], clothingTypes: [],
  isOwner: () => true, whoami: () => ({}), onAuth: (cb) => listeners.push(cb),
  loadItems: async () => JSON.parse(JSON.stringify(store)), loadSettings: async () => null, saveSettings: async () => ({}),
  saveItem: async () => "x", updatePrices: async (u) => { upd.push(...u); store[0].priceCheckedAt = u[0].priceCheckedAt; return 1; },
  deleteItem: async () => {}, signIn: async () => {}, signOut: async () => {}, importFromSheet: async () => 0 };
const tick = () => new Promise((r) => setTimeout(r, 40));
const q = (s) => w.document.querySelector(s);
let fails = 0; const check = (n, ok, e) => { console.log((ok ? "PASS " : "FAIL ") + n + (e !== undefined ? " -> " + e : "")); if (!ok) fails++; };
(async () => {
  w.eval(fs.readFileSync(dir + "script.js", "utf8")); w.eval(fs.readFileSync(dir + "admin.js", "utf8"));
  await tick(); listeners.forEach((cb) => cb(true)); await tick();
  check("starts flagged", !!q(".price-stale"));
  [...w.document.querySelectorAll(".item-card .owner-btn")].find((b) => b.textContent === "Edit").click();
  q("[data-confirm-price]").click(); await tick(); await tick();
  check("one click saves price + date", upd.length === 1 && upd[0].price === 50 && upd[0].priceCheckedAt > Date.now() - 5000, JSON.stringify(upd));
  check("note says confirmed", /Confirmed today/.test(q("[data-price-note]").textContent), q("[data-price-note]").textContent);
  check("warning gone from card", !q(".price-stale"));
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
