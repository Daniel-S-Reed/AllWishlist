const { JSDOM } = require("jsdom");
const fs = require("fs");
const dir = require("path").join(__dirname, "..") + "/";

const html = fs.readFileSync(dir + "index.html", "utf8")
  // we load scripts ourselves, with a mock data layer instead of Firebase
  .replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, "");

const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true });
const w = dom.window;

// jsdom has no <dialog> methods
w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new w.Event("close")); };
w.confirm = () => true;

let store = [
  { id: "a", name: "Wand", image: "w.jpg", link: "https://x/w", price: 30, tags: ["HarryPotter", "Fav"], clothingTypes: [], group: null, color: null },
  { id: "b", name: "Band Tee", image: "b1.jpg", link: "https://x/b1", price: 20, tags: ["Clothes"], clothingTypes: ["Short S"], group: "tee-1", color: "Black" },
  { id: "c", name: "Band Tee", image: "b2.jpg", link: "https://x/b2", price: 26, tags: ["Clothes"], clothingTypes: ["Short S"], group: "tee-1", color: "Red" },
  { id: "d", name: "Novel", image: null, link: null, price: null, tags: ["Books"], clothingTypes: [], group: null, color: null },
];
let owner = false;
const listeners = [];
let saved = [];

w.WishlistData = {
  configured: true, listId: "dan",
  list: { title: "Test List", eyebrow: "eyebrow", lede: "lede", legacySheetId: "abc" },
  categories: [{ value: "HarryPotter", label: "Harry Potter" }, { value: "Books", label: "Books" }, { value: "Clothes", label: "Clothes" }],
  clothingTypes: [{ value: "Short S", label: "Short Sleeve Shirt" }],
  isOwner: () => owner,
  onAuth: (cb) => listeners.push(cb),
  loadItems: async () => JSON.parse(JSON.stringify(store)),
  loadSettings: async () => null,
  saveItem: async (id, d) => { saved.push([id, d]); if (id) store = store.map(i => i.id === id ? { ...i, ...d } : i); else store.push({ id: "n" + store.length, ...d, price: parseFloat(d.price) || null }); return id || "new"; },
  deleteItem: async (id) => { store = store.filter(i => i.id !== id); },
  signIn: async () => { owner = true; listeners.forEach(cb => cb(true)); },
  signOut: async () => { owner = false; listeners.forEach(cb => cb(false)); },
  importFromSheet: async () => 0,
};

const tick = () => new Promise(r => setTimeout(r, 30));
const q = (s) => w.document.querySelector(s);
const qa = (s) => [...w.document.querySelectorAll(s)];
let fails = 0;
const check = (name, ok, extra) => { console.log((ok ? "PASS " : "FAIL ") + name + (extra ? "  -> " + extra : "")); if (!ok) fails++; };

(async () => {
  w.eval(fs.readFileSync(dir + "script.js", "utf8"));
  w.eval(fs.readFileSync(dir + "admin.js", "utf8"));
  await tick();

  check("heading filled from config", q("#site-title").textContent === "Test List" && w.document.title === "Test List");
  check("3 cards (two tee colors share one card)", qa("#items .item-card").length === 3, qa("#items .item-card").length);
  check("tee card has 2 swatches", qa("#items .item-card .swatch").length === 2);
  check("no owner tools while signed out", qa(".owner-tools").length === 0);
  check("login link visible, bar hidden", !q("#owner-login").hidden && q("#admin-bar").hidden);

  // category filter
  qa("#category-row .chip").find(b => b.textContent === "Books").click();
  await tick();
  check("Books filter -> 1 card", qa("#items .item-card").length === 1);
  qa("#category-row .chip").find(b => b.textContent === "All items").click();

  // sign in
  q("#owner-login").click();
  const pw = q("dialog input[name=password]");
  check("login dialog opens", !!pw);
  pw.value = "secret";
  q("dialog form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await tick();
  check("owner bar shown after sign-in", !q("#admin-bar").hidden && q("#admin-bar").textContent.includes("Add item"));
  check("login link hidden after sign-in", q("#owner-login").hidden);
  check("each card gets Edit / + Color / Delete", qa(".owner-tools").length === 3 && qa(".owner-btn-danger").length === 3);

  // edit
  qa(".owner-tools .owner-btn").find(b => b.textContent === "Edit").click();
  const nameInput = q("dialog input[name=name]");
  check("edit form opens prefilled", !!nameInput && nameInput.value.length > 0, nameInput && nameInput.value);
  nameInput.value = "Renamed Item";
  q("dialog form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await tick();
  check("edit saved and list reloaded", saved.length === 1 && qa("#items .item-name").some(n => n.textContent === "Renamed Item"));

  // add new item
  q("#admin-bar .owner-btn-primary").click();
  q("dialog input[name=name]").value = "Brand New";
  q("dialog input[name=price]").value = "12.5";
  q("dialog input[name=fav]").checked = true;
  q('dialog input[name=cat][value=Books]').checked = true;
  q("dialog form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await tick();
  const added = saved[saved.length - 1][1];
  check("new item saved with tags + fav", added.name === "Brand New" && added.tags.includes("Books") && added.tags.includes("Fav"), JSON.stringify(added.tags));
  check("new item card shows $12.50", qa("#items .item-price").some(p => p.textContent.includes("$12.50")));

  // + Color on an ungrouped item promotes the original into the group
  const before = saved.length;
  qa(".owner-tools .owner-btn").find(b => b.textContent === "+ Color").click();
  check("+ Color prefills a group id", q("dialog input[name=group]").value.length > 0, q("dialog input[name=group]").value);
  q("dialog input[name=color]").value = "Blue";
  q("dialog form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await tick();
  check("+ Color saves new variant (and groups the original when needed)", saved.length > before);

  // delete
  const card = qa("#items .item-card").find(c => c.querySelector(".item-name").textContent === "Novel");
  const count = qa("#items .item-card").length;
  card.querySelector(".owner-btn-danger").click();
  await tick();
  check("delete removes the card", qa("#items .item-card").length === count - 1 && !qa("#items .item-name").some(n => n.textContent === "Novel"));

  // sign out
  [...qa("#admin-bar .owner-btn")].find(b => b.textContent === "Sign out").click();
  await tick();
  check("sign-out hides owner tools", qa(".owner-tools").length === 0 && q("#admin-bar").hidden && !q("#owner-login").hidden);

  console.log(fails === 0 ? "\nALL PASSED" : "\n" + fails + " FAILED");
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error("CRASH", e); process.exit(1); });
