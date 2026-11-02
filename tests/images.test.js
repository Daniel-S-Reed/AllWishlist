// Tests image fallback: direct -> relay -> "not available" box.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const dir = require("path").join(__dirname, "..") + "/";

const html = fs.readFileSync(dir + "index.html", "utf8").replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/g, "");
const dom = new JSDOM(html, { runScripts: "outside-only", pretendToBeVisual: true, url: "https://example.com/" });
const w = dom.window;

const store = [
  { id: "a", name: "Lego Set", image: "https://www.lego.com/cdn/set.png", link: "https://x", price: 30, tags: [], clothingTypes: [], group: null, color: null },
  { id: "b", name: "No Photo", image: null, link: null, price: 5, tags: [], clothingTypes: [], group: null, color: null },
  { id: "c", name: "Tee", image: "https://img/tee-black.jpg", link: "https://x", price: 20, tags: [], clothingTypes: [], group: "t", color: "Black" },
  { id: "d", name: "Tee", image: "https://img/tee-red.jpg", link: "https://x", price: 20, tags: [], clothingTypes: [], group: "t", color: "Red" },
];

w.WishlistData = {
  configured: true, listId: "t", list: { title: "T", eyebrow: "", lede: "" },
  categories: [], clothingTypes: [], isOwner: () => false, onAuth: () => {},
  loadItems: async () => JSON.parse(JSON.stringify(store)), loadSettings: async () => null,
};

const tick = () => new Promise((r) => setTimeout(r, 30));
const qa = (s) => [...w.document.querySelectorAll(s)];
let fails = 0;
const check = (name, ok, extra) => { console.log((ok ? "PASS " : "FAIL ") + name + (extra !== undefined ? "  -> " + extra : "")); if (!ok) fails++; };
const cardByName = (n) => qa("#items .item-card").find((c) => c.querySelector(".item-name").textContent === n);
const fail = (img) => img.dispatchEvent(new w.Event("error"));

(async () => {
  w.eval(fs.readFileSync(dir + "script.js", "utf8"));
  await tick();

  const lego = cardByName("Lego Set");
  const img = lego.querySelector("img");
  check("image first loads resized through the relay", img.getAttribute("src").startsWith("https://wsrv.nl/?url=https%3A%2F%2Fwww.lego.com") && /w=640/.test(img.getAttribute("src")), img.getAttribute("src"));

  fail(img);
  check("first failure falls back to the original address", img.getAttribute("src") === "https://www.lego.com/cdn/set.png", img.getAttribute("src"));
  check("no 'unavailable' box yet", !lego.querySelector(".item-image-missing"));

  fail(img);
  check("second failure tries the plain relay", img.getAttribute("src") === "https://wsrv.nl/?url=" + encodeURIComponent("https://www.lego.com/cdn/set.png"), img.getAttribute("src"));

  fail(img);
  check("third failure shows the unavailable box", !!lego.querySelector(".item-image-missing") && img.hidden);
  check("box keeps the original address in its tooltip", lego.querySelector(".item-image-missing").title === "https://www.lego.com/cdn/set.png");

  const none = cardByName("No Photo");
  check("item without a picture says 'No image'", none.querySelector(".item-image-missing").textContent === "No image");

  // color-variant card: a failed color shouldn't poison the next one
  const tee = cardByName("Tee");
  const teeImg = tee.querySelector("img");
  fail(teeImg); fail(teeImg); fail(teeImg);
  check("failed color shows the box", !!tee.querySelector(".item-image-missing"));
  tee.querySelectorAll(".swatch")[1].click();
  check("switching color clears the box and loads the new picture", !tee.querySelector(".item-image-missing") && !teeImg.hidden && teeImg.getAttribute("src").includes(encodeURIComponent("https://img/tee-red.jpg")), teeImg.getAttribute("src"));
  fail(teeImg);
  check("new color also gets its fallback", teeImg.getAttribute("src") === "https://img/tee-red.jpg", teeImg.getAttribute("src"));

  console.log(fails === 0 ? "\nALL PASSED" : "\n" + fails + " FAILED");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("CRASH", e); process.exit(1); });
