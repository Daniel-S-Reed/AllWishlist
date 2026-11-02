const { JSDOM } = require("jsdom");
const fs = require("fs");
const dir = require("path").join(__dirname, "..") + "/";
const html = fs.readFileSync(dir + "index.html", "utf8").replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, "");
const w = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.com/" }).window;
w.confirm = () => true;
const mk = (id, name, tags, claimed) => ({ id, name, image: null, link: null, price: 5, tags, clothingTypes: [], group: null, color: null, swatch: null, priceCheckedAt: Date.now(), claimed });
const store = [mk("a", "Apple", [], false), mk("b", "Zebra", ["Fav"], false), mk("c", "Mango", [], true)];
const calls = []; let fail = false; const listeners = [];
w.WishlistData = { configured: true, listId: "dan", list: { title: "T", eyebrow: "", lede: "" }, categories: [], clothingTypes: [],
  isOwner: () => false, whoami: () => ({}), onAuth: (cb) => listeners.push(cb),
  loadItems: async () => JSON.parse(JSON.stringify(store)), loadSettings: async () => null, saveSettings: async () => ({}),
  setClaimed: async (id, v) => { if (fail) throw new Error("Claiming isn't switched on yet"); calls.push([id, v]); } };
const tick = () => new Promise((r) => setTimeout(r, 40));
const qa = (s) => [...w.document.querySelectorAll(s)];
const names = () => qa("#items .item-name").map((n) => n.textContent).join();
let fails = 0; const check = (n, ok, e) => { console.log((ok ? "PASS " : "FAIL ") + n + (e !== undefined ? " -> " + e : "")); if (!ok) fails++; };
(async () => {
  w.eval(fs.readFileSync(dir + "script.js", "utf8")); await tick();
  w.document.getElementById("sort-fav").click(); await tick();
  check("Most wanted puts favorites first", names() === "Zebra,Apple,Mango", names());
  const card = (n) => qa("#items .item-card").find((c) => c.querySelector(".item-name").textContent === n);
  check("claimed item shows badge", !!card("Mango").querySelector(".claim-badge") && !!card("Mango").querySelector(".is-claimed"));
  card("Apple").querySelector(".claim-btn").click(); await tick();
  check("claiming calls the database and shows the badge", calls.length === 1 && calls[0][0] === "a" && calls[0][1] === true && !!card("Apple").querySelector(".claim-badge"));
  card("Apple").querySelector(".claim-btn").click(); await tick();
  check("undo works", calls[1][1] === false && !card("Apple").querySelector(".claim-badge"));
  fail = true;
  card("Zebra").querySelector(".claim-btn").click(); await tick();
  check("failure shows a message and no badge", !!card("Zebra").querySelector(".claim-error") && !card("Zebra").querySelector(".claim-badge"));
  // owner doesn't see claims
  listeners.forEach((cb) => cb(true)); await tick();
  check("owner sees no claim info by default", qa(".claim-badge").length === 0 && qa(".claim-btn").length === 0);
  w.eval(fs.readFileSync(dir + "admin.js", "utf8")); listeners.forEach((cb) => cb(true)); await tick();
  qa("#admin-bar .owner-btn").find((b) => /Show claimed/.test(b.textContent)).click(); await tick();
  check("owner can reveal claims, without buttons", qa(".claim-badge").length === 1 && qa(".claim-btn").length === 0);
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
