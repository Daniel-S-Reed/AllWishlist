const { JSDOM } = require("jsdom");
const fs = require("fs");
const dir = require("path").join(__dirname, "..") + "/";
const html = fs.readFileSync(dir + "index.html", "utf8").replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, "");
const w = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.com/" }).window;
w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new w.Event("close")); };
w.HTMLFormElement.prototype.requestSubmit = function () { this.dispatchEvent(new w.Event("submit", { cancelable: true })); };
w.confirm = () => true;
const opened = [];
w.fetch = async () => ({ ok: true, text: async () => "" });
w.open = (u) => opened.push(u);
const now = Date.now();
const store = [
  { id: "a", name: "Tee", image: "a.jpg", link: "https://www.amazon.com/dp/X", price: 20, tags: [], clothingTypes: [], group: "t", color: "Black", swatch: null, priceCheckedAt: now },
  { id: "b", name: "Tee", image: "b.jpg", link: "https://shop/b", price: 22, tags: [], clothingTypes: [], group: "t", color: "Red", swatch: null, priceCheckedAt: now },
  { id: "c", name: "Lamp", image: "c.jpg", link: "https://shop/l", price: 50, tags: [], clothingTypes: [], group: null, color: null, swatch: null, priceCheckedAt: now - 90 * 86400000 },
];
const saved = [], upd = [], listeners = [];
w.WishlistData = {
  configured: true, listId: "dan", list: { title: "T", eyebrow: "", lede: "" }, categories: [], clothingTypes: [],
  isOwner: () => true, whoami: () => ({ email: "a", uid: "u" }), onAuth: (cb) => listeners.push(cb),
  loadItems: async () => JSON.parse(JSON.stringify(store)), loadSettings: async () => null, saveSettings: async () => ({}),
  saveItem: async (id, p) => { saved.push({ id, p }); return id; },
  updatePrices: async (u) => { upd.push(...u); return u.length; },
  deleteItem: async () => {}, signIn: async () => {}, signOut: async () => {}, importFromSheet: async () => 0,
};
const tick = () => new Promise((r) => setTimeout(r, 40));
const q = (s) => w.document.querySelector(s), qa = (s) => [...w.document.querySelectorAll(s)];
let fails = 0;
const check = (n, ok, e) => { console.log((ok ? "PASS " : "FAIL ") + n + (e !== undefined ? " -> " + e : "")); if (!ok) fails++; };
(async () => {
  w.eval(fs.readFileSync(dir + "script.js", "utf8"));
  w.eval(fs.readFileSync(dir + "admin.js", "utf8"));
  await tick(); listeners.forEach((cb) => cb(true)); await tick();
  const lampCard = qa("#items .item-card").find((c) => c.textContent.includes("Lamp"));
  check("old price flagged for owner", !!lampCard.querySelector(".price-stale"));
  const teeCard = qa("#items .item-card").find((c) => c.querySelector(".item-name").textContent === "Tee");
  check("fresh price not flagged", !teeCard.querySelector(".price-stale"));

  [...teeCard.querySelectorAll(".owner-btn")].find((b) => b.textContent === "Edit").click();
  let f = q("dialog form");
  check("color chips shown", qa("dialog .admin-variant-chip").length === 2);
  check("open-link button points at the store", q("[data-open-link]").href === "https://www.amazon.com/dp/X" && !q("[data-open-link]").hidden);
  q("[data-check-price]").click();
  check("Amazon opens the page instead of scraping", opened.length === 1 && /dp\/X/.test(opened[0]));
  qa("dialog .admin-variant-chip")[1].click(); await tick();
  f = q("dialog form");
  check("chip jumps to the next color without saving", f.elements.color.value === "Red" && saved.length === 0, f.elements.color.value);
  f.elements.price.value = "25";
  q("[data-save-next]").click(); await tick(); await tick();
  check("save & next saved the red one", saved.length === 1 && saved[0].id === "b" && saved[0].p.price === "25");
  f = q("dialog form");
  check("save & next opened the black one", f && f.elements.color.value === "Black", f && f.elements.color.value);
  q("dialog [data-cancel]").click();

  qa("#admin-bar .owner-btn").find((b) => b.textContent === "Prices to review").click();
  check("review lists only the stale item", qa("dialog .admin-review-row").length === 1);
  const row = q("dialog .admin-review-row");
  row.querySelector("input").value = "55";
  [...row.querySelectorAll("button")].find((b) => b.textContent === "Price is right").click(); await tick();
  check("review saves price + checked time", upd.length === 1 && upd[0].id === "c" && upd[0].price === 55 && upd[0].priceCheckedAt > 0, JSON.stringify(upd));
  qa("#admin-bar .owner-btn").find((b) => b.textContent === "Refresh prices").click();
  await tick(); await tick();
  check("refresh-all skips Amazon", upd.filter((u) => u.id === "a").length === 0);
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
