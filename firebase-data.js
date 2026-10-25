/* ============================================================
   Data layer — talks to Firebase (Firestore + Auth).
   Loaded as an ES module; exposes window.WishlistData for the
   plain scripts (script.js, admin.js) to use.

   Data layout in Firestore:
     lists/{listId}/items/{itemId}  ->  { name, image, link, price, tags[],
                                          clothingTypes[], group, color, createdAt }
   Anyone can read. Only that list's owner can write (see firestore.rules).
   ============================================================ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  setDoc,
  deleteDoc,
  doc,
  writeBatch,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";

const cfg = window.WISHLIST_CONFIG;

/* ---------- Which list is this page? ---------- */

const params = new URLSearchParams(window.location.search);
let listId = params.get("list") || document.body.dataset.list || cfg.defaultList;
if (!cfg.lists[listId]) listId = cfg.defaultList;
const list = cfg.lists[listId];

const configured = !String(cfg.firebase.apiKey).startsWith("PASTE");

let db = null;
let auth = null;
let currentUser = null;
const authListeners = [];

if (configured) {
  const app = initializeApp(cfg.firebase);
  db = getFirestore(app);
  auth = getAuth(app);

  onAuthStateChanged(auth, (user) => {
    currentUser = user;
    authListeners.forEach((cb) => cb(isOwner()));
  });
}

/* ---------- Helpers ---------- */

function isOwner() {
  return (
    !!currentUser &&
    !!currentUser.email &&
    !!list.ownerEmail &&
    currentUser.email.toLowerCase() === list.ownerEmail.toLowerCase()
  );
}

function itemsCol() {
  return collection(db, "lists", listId, "items");
}

function splitCsv(value) {
  return String(value || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function asArray(value) {
  return Array.isArray(value) ? value : splitCsv(value);
}

// Turns whatever the form/sheet gives us into a clean document.
function cleanItem(data) {
  const name = String(data.name || "").trim();
  // Accepts "24", "24.99", "$24.99", "$1,299" …
  const priceNum = parseFloat(String(data.price == null ? "" : data.price).replace(/[^0-9.]/g, ""));

  return {
    name: name || "Untitled item",
    image: String(data.image || "").trim() || null,
    link: String(data.link || "").trim() || null,
    price: isNaN(priceNum) ? null : priceNum,
    tags: asArray(data.tags),
    clothingTypes: asArray(data.clothingTypes),
    group: String(data.group || "").trim() || null,
    color: String(data.color || "").trim() || null,
  };
}

function friendlyError(err) {
  const code = (err && err.code) || "";
  if (code === "permission-denied") console.error("Firestore permission denied:", err);
  if (code === "permission-denied")
    return "Firebase refused the change. Are you signed in as this list's owner, and are the security rules published?";
  if (code === "unavailable") return "Couldn't reach Firebase. Check your connection and try again.";
  return (err && err.message) || "Something went wrong.";
}

/* ---------- Public API ---------- */

async function loadItems() {
  if (!configured) {
    throw new Error("Firebase isn't set up yet. Fill in firebase-config.js.");
  }

  const snap = await getDocs(itemsCol());

  return snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      name: data.name || "Untitled item",
      image: data.image || null,
      link: data.link || null,
      price: typeof data.price === "number" ? data.price : null,
      tags: data.tags || [],
      clothingTypes: data.clothingTypes || [],
      group: data.group || null,
      color: data.color || null,
    };
  });
}

async function saveItem(id, data) {
  const clean = cleanItem(data);
  try {
    if (id) {
      await setDoc(doc(db, "lists", listId, "items", id), clean, { merge: true });
      return id;
    }
    clean.createdAt = serverTimestamp();
    const ref = await addDoc(itemsCol(), clean);
    return ref.id;
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

async function deleteItem(id) {
  try {
    await deleteDoc(doc(db, "lists", listId, "items", id));
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

async function signIn(password) {
  if (!configured) throw new Error("Firebase isn't set up yet. Fill in firebase-config.js.");
  if (!list.ownerEmail) throw new Error("No ownerEmail is set for this list in firebase-config.js.");

  try {
    await signInWithEmailAndPassword(auth, list.ownerEmail, password);
  } catch (err) {
    const code = (err && err.code) || "";
    if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found")
      throw new Error("That password didn't work.");
    if (code === "auth/too-many-requests")
      throw new Error("Too many attempts. Wait a few minutes and try again.");
    throw new Error(friendlyError(err));
  }

  if (!isOwner()) throw new Error("That account isn't the owner of this list.");
}

async function signOut() {
  if (auth) await fbSignOut(auth);
}

function onAuth(cb) {
  authListeners.push(cb);
  // If auth already resolved, report the current state straight away.
  if (auth && auth.currentUser !== undefined && currentUser !== null) cb(isOwner());
}

/* ---------- Reading an old Google Sheet ---------- */

// Original layout: image, link, name, price, tags, clothing types, group, color.
function sheetToItemsByPosition(table) {
  return table.rows.map((row) => {
    const cell = (i) => (row.c[i] ? row.c[i].v : null);
    return cleanItem({
      image: cell(0),
      link: cell(1),
      name: cell(2),
      price: cell(3),
      tags: cell(4),
      clothingTypes: cell(5),
      group: cell(6),
      color: cell(7),
    });
  });
}

// Which words in a column heading mean which field. Checked in this order, and
// each column is used by the first field it matches ("Link to the item" is a
// link, not a name).
const HEADER_FIELDS = [
  ["image", ["image", "photo", "picture", "pic"]],
  ["link", ["link", "url", "website", "site", "buy"]],
  ["price", ["price", "cost", "amount", "dollar"]],
  ["clothingTypes", ["clothingtype", "clothtype", "typeofclothing"]],
  ["tags", ["categor", "tag"]],
  ["color", ["color", "colour"]],
  ["group", ["group"]],
  ["name", ["name", "title", "product", "item", "wish", "what"]],
];

function normalizeHeader(label) {
  return String(label || "").toLowerCase().replace(/[^a-z]/g, "");
}

// Google Form response sheets: find the columns by their headings instead of position.
function sheetToItemsByHeader(table) {
  const headers = table.cols.map((c) => normalizeHeader(c.label));
  const colFor = {};
  const used = new Set();

  HEADER_FIELDS.forEach(([field, words]) => {
    const idx = headers.findIndex((h, i) => !used.has(i) && words.some((w) => h.includes(w)));
    if (idx !== -1) {
      colFor[field] = idx;
      used.add(idx);
    }
  });

  if (colFor.name === undefined) {
    throw new Error(
      "Couldn't find a Name column in the sheet. Headings found: " +
        table.cols.map((c) => c.label || "(blank)").join(", ")
    );
  }

  // Let answers like "games" or "Harry Potter" match this list's real categories.
  const categoryByText = {};
  list.categories.forEach((c) => {
    categoryByText[normalizeHeader(c.value)] = c.value;
    categoryByText[normalizeHeader(c.label)] = c.value;
  });

  return table.rows.map((row) => {
    const cell = (field) =>
      colFor[field] === undefined ? null : row.c[colFor[field]] ? row.c[colFor[field]].v : null;

    return cleanItem({
      name: cell("name"),
      price: cell("price"),
      link: cell("link"),
      image: cell("image"),
      tags: splitCsv(cell("tags")).map((t) => categoryByText[normalizeHeader(t)] || t),
      clothingTypes: cell("clothingTypes"),
      group: cell("group"),
      color: cell("color"),
    });
  });
}

// One-time copy of the old Google Sheet rows into this list.
async function importFromSheet() {
  if (!list.legacySheetId) throw new Error("No Google Sheet is configured for this list.");

  // "auto" = find columns by their headings (use this for a Google Form's
  // response sheet). Otherwise the original fixed column order is used.
  const auto = list.legacyColumns === "auto";

  const url =
    "https://docs.google.com/spreadsheets/d/" +
    list.legacySheetId +
    "/gviz/tq?sheet=" +
    encodeURIComponent(list.legacyTab || "Sheet1") +
    "&tq=" +
    encodeURIComponent("select * ") +
    (auto ? "&headers=1" : "");

  let table;
  try {
    const text = await (await fetch(url)).text();
    table = JSON.parse(text.substring(47).slice(0, -2)).table;
  } catch (err) {
    throw new Error(
      "Couldn't read the Google Sheet. Check that it's shared as \"Anyone with the link can view\" and that the tab name in firebase-config.js is right."
    );
  }

  const items = (auto ? sheetToItemsByHeader(table) : sheetToItemsByPosition(table)).filter(
    (item) => item.name !== "Untitled item"
  );

  if (items.length === 0) throw new Error("The sheet had no items to import.");

  try {
    // Firestore batches hold up to 500 writes; stay well under.
    for (let i = 0; i < items.length; i += 400) {
      const batch = writeBatch(db);
      items.slice(i, i + 400).forEach((item) => {
        batch.set(doc(itemsCol()), { ...item, createdAt: serverTimestamp() });
      });
      await batch.commit();
    }
  } catch (err) {
    throw new Error(friendlyError(err));
  }

  return items.length;
}

window.WishlistData = {
  configured,
  listId,
  list,
  categories: list.categories,
  clothingTypes: cfg.clothingTypes,
  isOwner,
  whoami: () => (currentUser ? { email: currentUser.email, uid: currentUser.uid } : null),
  onAuth,
  loadItems,
  saveItem,
  deleteItem,
  signIn,
  signOut,
  importFromSheet,
};
