// Tests the category + color editors and how saved settings load on the page.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const dir = require("path").join(__dirname, "..") + "/";

const html = fs.readFileSync(dir + "index.html", "utf8").replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.com/" });
const w = dom.window;

w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
w.HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new w.Event("close")); };
w.confirm = () => true;

let store = [
  { id: "a", name: "Wand", image: "w.jpg", link: "https://x/w", price: 30, tags: ["HarryPotter"], clothingTypes: [], group: null, color: null },
  { id: "d", name: "Novel", image: null, link: null, price: 10, tags: ["Books"], clothingTypes: [], group: null, color: null },
];
let settingsStore = { categories: [{ value: "Books", label: "Reading" }, { value: "Games", label: "Games" }], theme: { accent: "#0000ff" } };
let owner = false;
const listeners = [];
const saveCalls = [];

w.WishlistData = {
  configured: true, listId: "dan",
  list: { title: "Test", eyebrow: "", lede: "", legacySheetId: null },
  categories: [{ value: "HarryPotter", label: "Harry Potter" }, { value: "Books", label: "Books" }],
  clothingTypes: [],
  isOwner: () => owner,
  whoami: () => ({ email: "a@b.c", uid: "u1" }),
  onAuth: (cb) => listeners.push(cb),
  loadItems: async () => JSON.parse(JSON.stringify(store)),
  loadSettings: async () => JSON.parse(JSON.stringify(settingsStore)),
  saveSettings: async (s) => {
    saveCalls.push(JSON.parse(JSON.stringify(s)));
    const out = {};
    if (s.categories) out.categories = s.categories;
    if (s.theme) out.theme = { ...s.theme };
    settingsStore = { ...settingsStore, ...out };
    return out;
  },
  saveItem: async () => "x", deleteItem: async () => {},
  signIn: async () => { owner = true; listeners.forEach((cb) => cb(true)); },
  signOut: async () => {}, importFromSheet: async () => 0,
};

const tick = () => new Promise((r) => setTimeout(r, 30));
const q = (s) => w.document.querySelector(s);
const qa = (s) => [...w.document.querySelectorAll(s)];
const cssVar = (name) => q(".wishlist-page").style.getPropertyValue(name);
const chipLabels = () => qa("#category-row .chip").map((b) => b.textContent);
let fails = 0;
const check = (name, ok, extra) => { console.log((ok ? "PASS " : "FAIL ") + name + (extra !== undefined ? "  -> " + extra : "")); if (!ok) fails++; };
const fire = (node, type) => node.dispatchEvent(new w.Event(type, { bubbles: true, cancelable: true }));

(async () => {
  w.eval(fs.readFileSync(dir + "script.js", "utf8"));
  w.eval(fs.readFileSync(dir + "admin.js", "utf8"));
  await tick();

  // ---- saved settings load on the page
  check("saved categories replace the config ones", chipLabels().join("|") === "All items|Reading|Games", chipLabels().join("|"));
  check("saved accent color applied", cssVar("--brass") === "#0000ff", cssVar("--brass"));
  check("dark accent -> white text on it", cssVar("--on-accent") === "#ffffff", cssVar("--on-accent"));
  check("settings cached for next visit", !!w.localStorage.getItem("wishlist-settings-dan"));

  // ---- sign in, open Categories
  listeners.forEach((cb) => cb(true));
  await tick();
  const barBtn = (t) => qa("#admin-bar .owner-btn").find((b) => b.textContent === t);
  check("owner bar has Categories and Colors buttons", !!barBtn("Categories") && !!barBtn("Colors"));

  barBtn("Categories").click();
  let rows = qa("dialog .admin-cat-row");
  check("category editor lists current categories", rows.length === 2, rows.length);
  check("item count shown for a category", rows[0].textContent.includes("1 item"), rows[0].textContent);

  // rename Games -> Video Games (value must stay "Games")
  const gamesInput = rows[1].querySelector("input");
  gamesInput.value = "Video Games"; fire(gamesInput, "input");
  // add a new one
  q("dialog [data-add]").click();
  let inputs = qa("dialog .admin-cat-row input");
  inputs[inputs.length - 1].value = "Board Games"; fire(inputs[inputs.length - 1], "input");
  // remove Reading (has 1 item; confirm() auto-accepts)
  qa("dialog .admin-cat-row")[0].querySelector(".owner-btn-danger").click();
  q("dialog form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await tick();

  const catSave = saveCalls[0] && saveCalls[0].categories;
  check("renamed category keeps its stored value", catSave && catSave[0].value === "Games" && catSave[0].label === "Video Games", JSON.stringify(catSave));
  check("new category gets a value from its name", catSave && catSave[1].value === "BoardGames", JSON.stringify(catSave));
  check("removed category is gone", catSave && catSave.length === 2);
  check("chips on the page updated", chipLabels().join("|") === "All items|Video Games|Board Games", chipLabels().join("|"));
  check("theme survived the category save", cssVar("--brass") === "#0000ff");

  // duplicate names are refused
  barBtn("Categories").click();
  let ins = qa("dialog .admin-cat-row input");
  ins[1].value = "video games"; fire(ins[1], "input");
  q("dialog form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await tick();
  check("duplicate category names refused", !q("dialog .admin-error").hidden && saveCalls.length === 1, q("dialog .admin-error").textContent);
  q("dialog [data-cancel]").click();

  // ---- Colors: preview, cancel reverts
  barBtn("Colors").click();
  check("color editor shows six colors", qa("dialog .admin-color-row").length === 6);
  [...qa("dialog .admin-presets .owner-btn")].find((b) => b.textContent === "Light").click();
  check("Light preset previews on the page", cssVar("--paper") === "#f6f4ef", cssVar("--paper"));
  q("dialog [data-cancel]").click();
  check("cancel puts the colors back", cssVar("--paper") === "#0b0f14" && cssVar("--brass") === "#0000ff", cssVar("--paper") + " " + cssVar("--brass"));
  check("cancel saved nothing", saveCalls.length === 1);

  // ---- Colors: change accent to a light color and save
  barBtn("Colors").click();
  const accentInput = qa("dialog .admin-color-row input")[0];
  accentInput.value = "#ffff00"; fire(accentInput, "input");
  check("light accent -> dark text on it", cssVar("--on-accent") === "#0b0f14", cssVar("--on-accent"));

  // make text unreadable to trigger the warning
  const textInput = qa("dialog .admin-color-row input")[3];
  textInput.value = "#0b0f14"; fire(textInput, "input");
  check("low-contrast warning appears", !q("dialog .admin-warn").hidden, q("dialog .admin-warn").textContent);
  textInput.value = "#e6edf3"; fire(textInput, "input");
  check("warning clears when readable again", q("dialog .admin-warn").hidden);

  q("dialog form").dispatchEvent(new w.Event("submit", { cancelable: true }));
  await tick();
  const themeSave = saveCalls[1] && saveCalls[1].theme;
  check("colors saved", themeSave && themeSave.accent === "#ffff00", JSON.stringify(themeSave));
  check("accent stays after saving", cssVar("--brass") === "#ffff00");
  check("categories survived the color save", chipLabels().join("|") === "All items|Video Games|Board Games");
  check("cache holds both categories and colors", (() => { const c = JSON.parse(w.localStorage.getItem("wishlist-settings-dan")); return c.categories.length === 2 && c.theme.accent === "#ffff00"; })());

  console.log(fails === 0 ? "\nALL PASSED" : "\n" + fails + " FAILED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
