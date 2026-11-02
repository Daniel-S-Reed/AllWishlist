// "Most wanted" sort puts favorites first, then A-Z.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const dir = require("path").join(__dirname, "..") + "/";
const html = fs.readFileSync(dir + "index.html", "utf8").replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, "");
const w = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.com/" }).window;
const mk = (id, name, tags) => ({ id, name, image: null, link: null, price: 5, tags, clothingTypes: [], group: null, color: null, swatch: null, priceCheckedAt: Date.now() });
const store = [mk("a", "Apple", []), mk("b", "Zebra", ["Fav"]), mk("c", "Mango", [])];
w.WishlistData = { configured: true, listId: "dan", list: { title: "T", eyebrow: "", lede: "" }, categories: [], clothingTypes: [],
  isOwner: () => false, whoami: () => ({}), onAuth: () => {},
  loadItems: async () => JSON.parse(JSON.stringify(store)), loadSettings: async () => null };
const tick = () => new Promise((r) => setTimeout(r, 40));
const names = () => [...w.document.querySelectorAll("#items .item-name")].map((n) => n.textContent).join();
let fails = 0; const check = (n, ok, e) => { console.log((ok ? "PASS " : "FAIL ") + n + (e !== undefined ? " -> " + e : "")); if (!ok) fails++; };
(async () => {
  w.eval(fs.readFileSync(dir + "script.js", "utf8")); await tick();
  check("starts A-Z", names() === "Apple,Mango,Zebra", names());
  w.document.getElementById("sort-fav").click(); await tick();
  check("Most wanted puts favorites first", names() === "Zebra,Apple,Mango", names());
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
