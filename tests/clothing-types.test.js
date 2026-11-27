// Owner can add/rename/remove clothing types from the site.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const dir = require("path").join(__dirname, "..") + "/";
const html = fs.readFileSync(dir + "index.html", "utf8").replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, "");
const w = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.com/" }).window;
w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new w.Event("close")); };
w.confirm = () => true;
const mk = (id, name, types) => ({ id, name, image: null, link: null, price: 5, tags: ["Clothes"], clothingTypes: types, group: null, color: null, swatch: null, priceCheckedAt: Date.now() });
const store = [mk("a", "Cap", ["Hat"]), mk("b", "Plain tee", [])];
const saves = []; const listeners = [];
w.WishlistData = { configured: true, listId: "dan", list: { title: "T", eyebrow: "", lede: "" },
  categories: [{ value: "Clothes", label: "Clothes" }], clothingTypes: [{ value: "Hat", label: "Hats" }, { value: "Pants", label: "Pants" }],
  isOwner: () => true, whoami: () => ({}), onAuth: (cb) => listeners.push(cb),
  loadItems: async () => JSON.parse(JSON.stringify(store)), loadSettings: async () => null,
  saveSettings: async (s) => { saves.push(JSON.parse(JSON.stringify(s))); return s; }, saveItem: async () => "x" };
const tick = () => new Promise((r) => setTimeout(r, 40));
const q = (s) => w.document.querySelector(s), qa = (s) => [...w.document.querySelectorAll(s)];
const fire = (n, t) => n.dispatchEvent(new w.Event(t, { bubbles: true, cancelable: true }));
let fails = 0; const check = (n, ok, e) => { console.log((ok ? "PASS " : "FAIL ") + n + (e !== undefined ? " -> " + e : "")); if (!ok) fails++; };
(async () => {
  w.eval(fs.readFileSync(dir + "script.js", "utf8")); w.eval(fs.readFileSync(dir + "admin.js", "utf8"));
  await tick(); listeners.forEach((cb) => cb(true)); await tick();
  qa("#category-row .chip").find((b) => b.textContent === "Clothes").click(); await tick();
  check("clothes with no type still shown when nothing is narrowed", qa("#items .item-name").length === 2);
  qa("#admin-bar .owner-btn").find((b) => b.textContent === "Clothing types").click();
  check("editor lists current types", qa("dialog .admin-cat-row").length === 2);
  check("item count shown", qa("dialog .admin-cat-row")[0].textContent.includes("1 item"));
  q("dialog [data-add]").click();
  const ins = qa("dialog .admin-cat-row input"); const last = ins[ins.length - 1];
  last.value = "Ties"; fire(last, "input");
  q("dialog form").dispatchEvent(new w.Event("submit", { cancelable: true })); await tick();
  const sv = saves[0] && saves[0].clothingTypes;
  check("saved with a generated value", sv && sv.length === 3 && sv[2].value === "Ties" && sv[2].label === "Ties", JSON.stringify(sv));
  check("Ties filter button appears, selected by default", qa("#clothing-row .chip").map((b) => b.textContent).join("|").includes("Ties"), qa("#clothing-row .chip").map((b) => b.textContent).join("|"));
  qa("#items .owner-btn").find((b) => b.textContent === "Edit").click();
  check("item form offers the new type", qa('dialog input[name="clothing"]').some((i) => i.value === "Ties"));
  console.log(fails ? fails + " FAILED" : "ALL PASSED"); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
