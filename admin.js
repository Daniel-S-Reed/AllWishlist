/* ============================================================
   Owner tools — login, add / edit / delete items, sheet import.
   Everything here is only a convenience. The real lock is the
   Firestore security rules: even if someone edits this page in
   their browser, Firebase refuses writes from anyone but the owner.
   ============================================================ */

(function () {
  "use strict";

  var data = window.WishlistData;
  var host = document.querySelector(".wishlist-page") || document.body;

  var loginLink = document.getElementById("owner-login");
  var bar = document.getElementById("admin-bar");

  /* ---------- Small helpers ---------- */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function app() {
    return window.WishlistApp;
  }

  function makeGroupId(name) {
    var slug = String(name || "item")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30);
    return (slug || "item") + "-" + Math.random().toString(36).slice(2, 6);
  }

  function say(message) {
    var status = document.getElementById("admin-status");
    if (status) status.textContent = message;
  }

  /* ---------- Dialog scaffolding ---------- */

  function makeDialog(title) {
    var dlg = document.createElement("dialog");
    dlg.className = "admin-dialog";
    dlg.setAttribute("aria-labelledby", "dlg-title-" + title.replace(/\W+/g, ""));

    var h = el("h2", "admin-dialog-title", title);
    h.id = "dlg-title-" + title.replace(/\W+/g, "");
    dlg.appendChild(h);

    // Clicking the dim backdrop closes the dialog.
    dlg.addEventListener("click", function (e) {
      if (e.target === dlg) dlg.close();
    });

    // Remove it from the page once closed so we never accumulate copies.
    dlg.addEventListener("close", function () {
      dlg.remove();
    });

    host.appendChild(dlg);
    return dlg;
  }

  /* ---------- Login ---------- */

  function openLogin() {
    var dlg = makeDialog("Owner login");

    var form = el("form", "admin-form");
    form.innerHTML =
      '<p class="admin-hint">Enter the password for this list to edit it.</p>' +
      '<label class="admin-field"><span>Password</span>' +
      '<input type="password" name="password" autocomplete="current-password" required></label>' +
      '<p class="admin-error" role="alert" hidden></p>' +
      '<div class="admin-actions">' +
      '<button type="button" class="owner-btn" data-cancel>Cancel</button>' +
      '<button type="submit" class="owner-btn owner-btn-primary">Sign in</button>' +
      "</div>";

    var errorEl = form.querySelector(".admin-error");
    var submit = form.querySelector('[type="submit"]');

    form.querySelector("[data-cancel]").addEventListener("click", function () {
      dlg.close();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorEl.hidden = true;
      submit.disabled = true;
      submit.textContent = "Signing in…";

      data
        .signIn(form.elements.password.value)
        .then(function () {
          dlg.close();
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
          submit.disabled = false;
          submit.textContent = "Sign in";
          form.elements.password.select();
        });
    });

    dlg.appendChild(form);
    dlg.showModal();
    form.elements.password.focus();
  }

  /* ---------- Swatch + price helpers ---------- */

  var NAMED = {
    black: "#1a1a1a", white: "#f5f5f5", red: "#d32f2f", blue: "#1976d2", navy: "#1a2a52",
    green: "#388e3c", yellow: "#fbc02d", orange: "#f57c00", purple: "#7b1fa2", pink: "#ec6fa1",
    gray: "#808080", grey: "#808080", brown: "#6d4c41", tan: "#c8a87a", beige: "#d9c6a5",
    cream: "#f3ead3", gold: "#c9a227", silver: "#bdbdbd", teal: "#00897b", maroon: "#7b1e2b",
    olive: "#6b6b2a", khaki: "#b5a66b", charcoal: "#36454f",
  };

  // Turns a color name into a hex value if the browser (or our list) knows it.
  function nameToHex(name) {
    var n = String(name || "").trim().toLowerCase();
    if (!n) return null;
    if (NAMED[n]) return NAMED[n];
    var probe = document.createElement("span");
    probe.style.color = "";
    probe.style.color = n;
    if (!probe.style.color) return null;
    var c = document.createElement("canvas").getContext && document.createElement("canvas").getContext("2d");
    if (!c) return null;
    c.fillStyle = "#000000";
    c.fillStyle = n;
    return /^#[0-9a-f]{6}$/i.test(c.fillStyle) ? c.fillStyle : null;
  }

  function ageText(ms) {
    var days = Math.floor((Date.now() - ms) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 30) return days + " days ago";
    var months = Math.floor(days / 30);
    return months === 1 ? "a month ago" : months + " months ago";
  }

  // Pulls a price out of a store page's HTML (structured data first).
  function priceFromHtml(html) {
    var m;
    var re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
    while ((m = re.exec(html))) {
      try {
        var found = priceFromJson(JSON.parse(m[1]));
        if (found !== null) return found;
      } catch (e) {}
    }
    var metas = [
      /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount|twitter:data1)["'][^>]*content=["']\$?([\d.,]+)["']/i,
      /<meta[^>]+content=["']\$?([\d.,]+)["'][^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i,
      /itemprop=["']price["'][^>]*content=["']([\d.,]+)["']/i,
      /content=["']([\d.,]+)["'][^>]*itemprop=["']price["']/i,
    ];
    for (var i = 0; i < metas.length; i++) {
      m = html.match(metas[i]);
      if (m) {
        var v = parseFloat(m[1].replace(/,/g, ""));
        if (isFinite(v) && v > 0) return v;
      }
    }
    return null;
  }

  function priceFromJson(node) {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        var r = priceFromJson(node[i]);
        if (r !== null) return r;
      }
      return null;
    }
    var raw = node.price !== undefined ? node.price : node.lowPrice;
    if (raw !== undefined && raw !== null && raw !== "") {
      var v = parseFloat(String(raw).replace(/,/g, ""));
      if (isFinite(v) && v > 0) return v;
    }
    for (var k in node) {
      if (node[k] && typeof node[k] === "object") {
        var r2 = priceFromJson(node[k]);
        if (r2 !== null) return r2;
      }
    }
    return null;
  }

  var STALE_DAYS = 30;

  // Amazon refuses automatic price lookups, so those items are checked by hand.
  function isAmazon(url) {
    try {
      var h = new URL(url).hostname.toLowerCase();
      return /(^|\.)amazon\.[a-z.]+$/.test(h) || /(^|\.)amzn\.[a-z]+$/.test(h) || h === "a.co";
    } catch (e) {
      return false;
    }
  }

  function isStale(it) {
    return !it.priceCheckedAt || Date.now() - it.priceCheckedAt > STALE_DAYS * 86400000;
  }

  function safeHref(url) {
    try {
      var u = new URL(String(url).trim());
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : null;
    } catch (e) {
      return null;
    }
  }

  var RELAYS = [
    function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); },
    function (u) { return "https://corsproxy.io/?" + encodeURIComponent(u); },
  ];

  // Browsers can't read other sites directly, so go through a public relay.
  // Resolves to a number, or null when no price could be found.
  function fetchPrice(url) {
    var tryRelay = function (i) {
      if (i >= RELAYS.length) return Promise.reject(new Error("unreachable"));
      return fetch(RELAYS[i](url))
        .then(function (res) {
          if (!res.ok) throw new Error("bad status");
          return res.text();
        })
        .then(function (html) {
          return priceFromHtml(html);
        })
        .catch(function () {
          return tryRelay(i + 1);
        });
    };
    return tryRelay(0);
  }

  /* ---------- Add / edit form ---------- */

  // opts: { item, prefill, afterSave }
  function openItemForm(opts) {
    var item = opts.item || null; // existing item being edited, or null for new
    var start = opts.prefill || item || {};
    var categories = app().getCategories();
    var clothing = app().getClothingTypes();

    var knownValues = categories.map(function (c) {
      return c.value;
    });
    var startTags = start.tags || [];

    var dlg = makeDialog(item ? "Edit item" : "Add item");
    var form = el("form", "admin-form");

    // Tags the form has no checkbox for (old price buckets, retired categories…)
    // are carried through untouched so editing never loses data.
    var extraTags = startTags.filter(function (t) {
      return knownValues.indexOf(t) === -1 && t !== "Fav";
    });

    var groupOptions = [];
    app()
      .getItems()
      .forEach(function (it) {
        if (it.group && groupOptions.indexOf(it.group) === -1) groupOptions.push(it.group);
      });

    form.innerHTML =
      '<div class="admin-variants" data-variants hidden></div>' +
      '<label class="admin-field"><span>Name *</span>' +
      '<input type="text" name="name" required maxlength="120"></label>' +
      '<div class="admin-row">' +
      '<label class="admin-field"><span>Price ($)</span>' +
      '<input type="number" name="price" min="0" step="0.01" inputmode="decimal"></label>' +
      '<button type="button" class="owner-btn admin-check-price" data-check-price>Check price</button>' +
      '<button type="button" class="owner-btn admin-check-price" data-confirm-price title="The price shown is still correct">Price is right ✓</button>' +
      '<label class="admin-check admin-check-fav"><input type="checkbox" name="fav"> <span>Favorite</span></label>' +
      "</div>" +
      '<p class="admin-hint" data-price-note hidden></p>' +
      '<label class="admin-field"><span>Link to buy</span>' +
      '<input type="url" name="link" placeholder="https://…"></label>' +
      '<a class="owner-btn admin-open-link" data-open-link target="_blank" rel="noopener noreferrer" hidden>Open link ↗</a>' +
      '<label class="admin-field"><span>Image URL</span>' +
      '<input type="url" name="image" placeholder="https://…"></label>' +
      '<img class="admin-preview" alt="" hidden>' +
      '<fieldset class="admin-fieldset"><legend>Categories</legend><div class="admin-checks" data-cats></div></fieldset>' +
      '<fieldset class="admin-fieldset" data-clothing-box hidden><legend>Clothing type</legend><div class="admin-checks" data-clothing></div></fieldset>' +
      '<details class="admin-details"><summary>Color or price options (optional)</summary>' +
      '<p class="admin-hint">Items that share a Group ID appear on one card with color swatches. Each color keeps its own photo, price and link.</p>' +
      '<div class="admin-row">' +
      '<label class="admin-field"><span>Group ID</span><input type="text" name="group" list="admin-groups" maxlength="60"></label>' +
      '<label class="admin-field"><span>Color name</span><input type="text" name="color" maxlength="40" placeholder="e.g. Black"></label>' +
      "</div>" +
      '<div class="admin-field admin-swatch-field"><span>Swatch color</span>' +
      '<div class="admin-swatch-row">' +
      '<input type="color" name="swatch" value="#999999" aria-label="Swatch color">' +
      '<span class="admin-swatch-note" data-swatch-note></span>' +
      '<button type="button" class="owner-btn" data-swatch-auto>Match the name</button>' +
      "</div></div>" +
      '<datalist id="admin-groups"></datalist>' +
      "</details>" +
      '<p class="admin-error" role="alert" hidden></p>' +
      '<div class="admin-actions">' +
      '<button type="button" class="owner-btn" data-cancel>Cancel</button>' +
      '<button type="button" class="owner-btn" data-save-next hidden>Save &amp; next color →</button>' +
      '<button type="submit" class="owner-btn owner-btn-primary">Save</button>' +
      "</div>";

    // Fill in values (set as properties so quotes etc. can't break the markup).
    form.elements.name.value = start.name || "";
    form.elements.price.value =
      start.price !== null && start.price !== undefined ? start.price : "";
    form.elements.link.value = start.link || "";
    form.elements.image.value = start.image || "";
    form.elements.group.value = start.group || "";
    form.elements.color.value = start.color || "";
    form.elements.fav.checked = startTags.indexOf("Fav") !== -1;

    if (start.group || start.color || start.swatch) form.querySelector(".admin-details").open = true;

    // Swatch color: the owner's pick, or (when never touched) a guess from the name.
    var swatchInput = form.elements.swatch;
    var swatchNote = form.querySelector("[data-swatch-note]");
    var swatchPicked = !!start.swatch;
    function guessFromName() {
      return nameToHex(form.elements.color.value);
    }
    function refreshSwatch() {
      if (!swatchPicked) {
        var g = guessFromName();
        if (g) swatchInput.value = g;
      }
      swatchNote.textContent = swatchPicked
        ? "Your pick"
        : guessFromName()
        ? "Matched from the name"
        : "Pick one";
    }
    if (start.swatch) swatchInput.value = start.swatch;
    swatchInput.addEventListener("input", function () {
      swatchPicked = true;
      refreshSwatch();
    });
    form.elements.color.addEventListener("input", refreshSwatch);
    form.querySelector("[data-swatch-auto]").addEventListener("click", function () {
      swatchPicked = false;
      refreshSwatch();
    });
    refreshSwatch();

    // Open-link button: lets you look at the store page without leaving the form.
    var openLink = form.querySelector("[data-open-link]");
    function syncOpenLink() {
      var href = safeHref(form.elements.link.value);
      openLink.hidden = !href;
      if (href) openLink.href = href;
    }
    form.elements.link.addEventListener("input", syncOpenLink);
    syncOpenLink();

    // Other colors of the same item: jump between them without going back to the page.
    var siblings = item && item.group
      ? app().getItems().filter(function (it) {
          return it.group === item.group;
        })
      : [];
    var saveNextBtn = form.querySelector("[data-save-next]");
    var startSnapshot = null;
    function snapshot() {
      return JSON.stringify([
        form.elements.name.value, form.elements.price.value, form.elements.link.value,
        form.elements.image.value, form.elements.color.value, form.elements.group.value,
        form.elements.fav.checked, swatchPicked ? swatchInput.value : null,
        Array.prototype.map.call(form.querySelectorAll("input[name=cat]:checked"), function (i) { return i.value; }),
      ]);
    }
    function nextSibling() {
      var i = siblings.findIndex(function (it) { return it.id === item.id; });
      return siblings.length > 1 ? siblings[(i + 1) % siblings.length] : null;
    }
    if (siblings.length > 1) {
      var vbox = form.querySelector("[data-variants]");
      vbox.hidden = false;
      vbox.appendChild(el("span", "admin-variants-label", "Colors:"));
      siblings.forEach(function (sib, n) {
        var chip = el("button", "owner-btn admin-variant-chip", sib.color || "Option " + (n + 1));
        chip.type = "button";
        if (sib.id === item.id) {
          chip.setAttribute("aria-current", "true");
          chip.disabled = true;
        }
        chip.addEventListener("click", function () {
          if (snapshot() !== startSnapshot && !window.confirm("Discard your unsaved changes to this color?")) return;
          dlg.close();
          openItemForm({ item: sib });
        });
        vbox.appendChild(chip);
      });
      saveNextBtn.hidden = false;
    }

    // Price: stamp when it was checked, and offer a one-click check from the link.
    var priceNote = form.querySelector("[data-price-note]");
    var checkedAt = start.priceCheckedAt || null;
    var startPrice = form.elements.price.value;
    function showPriceNote(extra) {
      var bits = [];
      if (checkedAt) bits.push("Price last checked " + ageText(checkedAt) + ".");
      if (extra) bits.push(extra);
      priceNote.textContent = bits.join(" ");
      priceNote.hidden = bits.length === 0;
    }
    showPriceNote();
    form.elements.price.addEventListener("input", function () {
      checkedAt = Date.now();
      showPriceNote();
    });
    // One click to say "the price above is still accurate": stamps today's date
    // (and saves it right away for an existing item) without retyping the price.
    var confirmBtn = form.querySelector("[data-confirm-price]");
    confirmBtn.addEventListener("click", function () {
      checkedAt = Date.now();
      var v = parseFloat(form.elements.price.value);
      if (!item) {
        showPriceNote("Confirmed today. It will be saved with the item.");
        return;
      }
      confirmBtn.disabled = true;
      var upd = { id: item.id, priceCheckedAt: checkedAt };
      if (isFinite(v) && v >= 0) upd.price = v;
      data
        .updatePrices([upd])
        .then(function () {
          showPriceNote("Confirmed today and saved.");
          return app().reload();
        })
        .catch(function (err) {
          showPriceNote("Couldn't save: " + err.message);
        })
        .then(function () {
          confirmBtn.disabled = false;
        });
    });

    var checkBtn = form.querySelector("[data-check-price]");
    checkBtn.addEventListener("click", function () {
      var url = form.elements.link.value.trim();
      if (!url) {
        showPriceNote("Add a link first so there is a page to check.");
        return;
      }
      if (isAmazon(url)) {
        var amz = safeHref(url);
        if (amz) window.open(amz, "_blank", "noopener,noreferrer");
        showPriceNote("Amazon doesn't allow automatic checks. The page opened in a new tab — type the price here when you've read it.");
        return;
      }
      checkBtn.disabled = true;
      checkBtn.textContent = "Checking…";
      fetchPrice(url)
        .then(function (found) {
          if (found === null) {
            showPriceNote("Couldn't read a price from that page. Type it in yourself.");
          } else {
            form.elements.price.value = found;
            checkedAt = Date.now();
            showPriceNote("Found $" + found + " on the page.");
          }
        })
        .catch(function () {
          showPriceNote("Couldn't reach that page. Type the price in yourself.");
        })
        .then(function () {
          checkBtn.disabled = false;
          checkBtn.textContent = "Check price";
        });
    });

    groupOptions.forEach(function (g) {
      var opt = document.createElement("option");
      opt.value = g;
      form.querySelector("#admin-groups").appendChild(opt);
    });

    // Category checkboxes
    var catBox = form.querySelector("[data-cats]");
    categories.forEach(function (c) {
      var label = el("label", "admin-check");
      var input = document.createElement("input");
      input.type = "checkbox";
      input.name = "cat";
      input.value = c.value;
      input.checked = startTags.indexOf(c.value) !== -1;
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + c.label));
      catBox.appendChild(label);
    });

    // Clothing-type checkboxes (only visible while "Clothes" is ticked)
    var clothingBox = form.querySelector("[data-clothing]");
    var startClothing = start.clothingTypes || [];
    clothing.forEach(function (c) {
      var label = el("label", "admin-check");
      var input = document.createElement("input");
      input.type = "checkbox";
      input.name = "clothing";
      input.value = c.value;
      input.checked = startClothing.indexOf(c.value) !== -1;
      label.appendChild(input);
      label.appendChild(document.createTextNode(" " + c.label));
      clothingBox.appendChild(label);
    });

    function syncClothingVisibility() {
      var clothesTicked = !!form.querySelector('input[name="cat"][value="Clothes"]:checked');
      form.querySelector("[data-clothing-box]").hidden = !clothesTicked;
    }
    catBox.addEventListener("change", syncClothingVisibility);
    syncClothingVisibility();

    // Live image preview
    var preview = form.querySelector(".admin-preview");
    function syncPreview() {
      var url = form.elements.image.value.trim();
      if (url) {
        preview.src = url;
        preview.hidden = false;
      } else {
        preview.hidden = true;
      }
    }
    preview.addEventListener("error", function () {
      preview.hidden = true;
    });
    form.elements.image.addEventListener("input", syncPreview);
    syncPreview();

    var errorEl = form.querySelector(".admin-error");
    var submit = form.querySelector('[type="submit"]');

    form.querySelector("[data-cancel]").addEventListener("click", function () {
      dlg.close();
    });

    var goNext = false;
    saveNextBtn.addEventListener("click", function () {
      goNext = true;
      if (form.requestSubmit) form.requestSubmit();
      else form.dispatchEvent(new Event("submit", { cancelable: true }));
    });
    startSnapshot = snapshot();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorEl.hidden = true;
      var wantNext = goNext;
      goNext = false;

      var tags = Array.prototype.map
        .call(form.querySelectorAll('input[name="cat"]:checked'), function (i) {
          return i.value;
        })
        .concat(extraTags);

      if (form.elements.fav.checked) tags.push("Fav");

      var clothesTicked = tags.indexOf("Clothes") !== -1;
      var clothingTypes = clothesTicked
        ? Array.prototype.map.call(
            form.querySelectorAll('input[name="clothing"]:checked'),
            function (i) {
              return i.value;
            }
          )
        : [];

      var payload = {
        name: form.elements.name.value,
        price: form.elements.price.value,
        link: form.elements.link.value,
        image: form.elements.image.value,
        tags: tags,
        clothingTypes: clothingTypes,
        group: form.elements.group.value,
        color: form.elements.color.value,
        swatch: swatchPicked ? swatchInput.value : null,
        priceCheckedAt: checkedAt,
      };

      submit.disabled = true;
      submit.textContent = "Saving…";

      data
        .saveItem(item ? item.id : null, payload)
        .then(function () {
          return opts.afterSave ? opts.afterSave(payload) : null;
        })
        .then(function () {
          dlg.close();
          say(item ? "Saved changes." : "Item added.");
          return app().reload().then(function () {
            if (!wantNext || !item) return;
            var fresh = app().getItems().filter(function (it) {
              return it.group && it.group === (payload.group || "").trim();
            });
            var idx = fresh.findIndex(function (it) { return it.id === item.id; });
            var nxt = fresh.length > 1 ? fresh[(idx + 1) % fresh.length] : null;
            if (nxt) openItemForm({ item: nxt });
          });
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
          submit.disabled = false;
          submit.textContent = "Save";
        });
    });

    dlg.appendChild(form);
    dlg.showModal();
    form.elements.name.focus();
  }

  /* ---------- Actions used by the cards and the bar ---------- */

  function editItem(item) {
    openItemForm({ item: item });
  }

  function addItem() {
    openItemForm({});
  }

  // Add another color/price option next to an existing item.
  function addColor(item) {
    var group = item.group || makeGroupId(item.name);

    openItemForm({
      prefill: {
        name: item.name,
        tags: item.tags,
        clothingTypes: item.clothingTypes,
        group: group,
        color: "",
        price: item.price,
        link: "",
        image: "",
      },
      // If the original wasn't in a group yet, put it in this one too.
      afterSave: function () {
        if (item.group) return null;
        return data.saveItem(item.id, {
          name: item.name,
          price: item.price,
          link: item.link,
          image: item.image,
          tags: item.tags,
          clothingTypes: item.clothingTypes,
          group: group,
          color: item.color,
          swatch: item.swatch,
          priceCheckedAt: item.priceCheckedAt,
        });
      },
    });
  }

  function deleteItem(item) {
    var label = item.name + (item.color ? " (" + item.color + ")" : "");
    if (!window.confirm('Delete "' + label + '"? This can\'t be undone.')) return;

    data
      .deleteItem(item.id)
      .then(function () {
        say("Deleted " + label + ".");
        return app().reload();
      })
      .catch(function (err) {
        say("Couldn't delete: " + err.message);
      });
  }

  // Re-reads every item's price from its link. Only changes prices it actually
  // finds; items it can't read are left alone.
  function refreshPrices() {
    var skipped = 0;
    var items = app().getItems().filter(function (it) {
      if (it.link && isAmazon(it.link)) {
        skipped++;
        return false;
      }
      return it.link;
    });
    if (!items.length) {
      say("No items with links to check.");
      return;
    }
    if (!window.confirm("Check the price of " + items.length + " items from their links? This can take a minute.")) return;

    var updates = [];
    var changed = 0;
    var failed = 0;
    var i = 0;

    function next() {
      if (i >= items.length) return Promise.resolve();
      var it = items[i++];
      say("Checking prices… " + i + " of " + items.length);
      return fetchPrice(it.link)
        .then(function (found) {
          if (found === null) {
            failed++;
            return;
          }
          if (it.price === null || Math.abs(Number(it.price) - found) > 0.005) changed++;
          updates.push({ id: it.id, price: found, priceCheckedAt: Date.now() });
        })
        .catch(function () {
          failed++;
        })
        .then(next);
    }

    next()
      .then(function () {
        return updates.length ? data.updatePrices(updates) : 0;
      })
      .then(function () {
        say(
          "Checked " + updates.length + " prices, " + changed + " changed" +
            (failed ? ", " + failed + " couldn't be read" : "") +
            (skipped ? ", " + skipped + " Amazon items skipped (check those by hand)" : "") + "."
        );
        return app().reload();
      })
      .catch(function (err) {
        say("Price check failed: " + err.message);
      });
  }

  // Lists items whose prices are old or never checked, oldest first, so they
  // can be confirmed or corrected quickly.
  function openPriceReview() {
    var due = app().getItems().filter(isStale).sort(function (a, b) {
      return (a.priceCheckedAt || 0) - (b.priceCheckedAt || 0);
    });
    var dlg = makeDialog("Prices to review");
    var wrap = el("div", "admin-form");
    wrap.appendChild(
      el("p", "admin-hint",
        due.length
          ? due.length + " item" + (due.length === 1 ? "" : "s") + " not checked in " + STALE_DAYS + " days. Open the link, then confirm or fix the price."
          : "Every price has been checked in the last " + STALE_DAYS + " days.")
    );
    var errorEl = el("p", "admin-error");
    errorEl.hidden = true;
    wrap.appendChild(errorEl);

    due.forEach(function (it) {
      var row = el("div", "admin-review-row");
      row.appendChild(
        el("span", "admin-review-name", it.name + (it.color ? " (" + it.color + ")" : ""))
      );
      row.appendChild(
        el("span", "admin-review-age", it.priceCheckedAt ? "checked " + ageText(it.priceCheckedAt) : "never checked")
      );
      var href = it.link && safeHref(it.link);
      if (href) {
        var a = el("a", "owner-btn", "Open link ↗");
        a.href = href;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        row.appendChild(a);
      }
      var input = document.createElement("input");
      input.type = "number";
      input.min = "0";
      input.step = "0.01";
      input.className = "admin-review-price";
      input.setAttribute("aria-label", "Price for " + it.name);
      input.value = it.price !== null && it.price !== undefined ? it.price : "";
      row.appendChild(input);
      var ok = el("button", "owner-btn owner-btn-primary", "Price is right");
      ok.type = "button";
      ok.addEventListener("click", function () {
        var v = parseFloat(input.value);
        var upd = { id: it.id, priceCheckedAt: Date.now() };
        if (isFinite(v) && v >= 0) upd.price = v;
        ok.disabled = true;
        data
          .updatePrices([upd])
          .then(function () {
            row.classList.add("admin-review-done");
            ok.textContent = "✓ Saved";
            input.disabled = true;
          })
          .catch(function (err) {
            errorEl.textContent = err.message;
            errorEl.hidden = false;
            ok.disabled = false;
          });
      });
      row.appendChild(ok);
      wrap.appendChild(row);
    });

    var actions = el("div", "admin-actions");
    var close = el("button", "owner-btn", "Close");
    close.type = "button";
    close.addEventListener("click", function () {
      dlg.close();
    });
    actions.appendChild(close);
    wrap.appendChild(actions);
    dlg.addEventListener("close", function () {
      app().reload();
    });
    dlg.appendChild(wrap);
    dlg.showModal();
  }

  /* ---------- Categories editor ---------- */

  // "Board Games" -> "BoardGames". Existing categories keep their stored value
  // when renamed, so items never lose their category.
  function categoryValueFromLabel(label, taken) {
    var words = String(label)
      .replace(/[^A-Za-z0-9 ]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean);

    var base =
      words
        .map(function (w) {
          return w.charAt(0).toUpperCase() + w.slice(1);
        })
        .join("") || "Category";

    var value = base;
    var n = 2;
    while (taken.indexOf(value) !== -1) {
      value = base + n;
      n++;
    }
    return value;
  }

  function openCategories() {
    var rows = app()
      .getCategories()
      .map(function (c) {
        return { value: c.value, label: c.label };
      });
    var items = app().getItems();

    var dlg = makeDialog("Categories");
    var form = el("form", "admin-form");

    form.innerHTML =
      '<p class="admin-hint">These are the filter buttons visitors see. Renaming a category keeps its items in it. ' +
      "A category named Clothes also turns on the clothing-type filters.</p>" +
      '<div class="admin-cat-list"></div>' +
      '<div><button type="button" class="owner-btn" data-add>+ Add category</button></div>' +
      '<p class="admin-error" role="alert" hidden></p>' +
      '<div class="admin-actions">' +
      '<button type="button" class="owner-btn" data-cancel>Cancel</button>' +
      '<button type="submit" class="owner-btn owner-btn-primary">Save</button>' +
      "</div>";

    var listEl = form.querySelector(".admin-cat-list");
    var errorEl = form.querySelector(".admin-error");
    var submit = form.querySelector('[type="submit"]');

    function countFor(value) {
      return items.filter(function (it) {
        return it.tags.indexOf(value) !== -1;
      }).length;
    }

    function move(i, delta, focusAttr) {
      var j = i + delta;
      if (j < 0 || j >= rows.length) return;
      var tmp = rows[i];
      rows[i] = rows[j];
      rows[j] = tmp;
      renderRows();
      var btn = listEl.children[j].querySelector("[" + focusAttr + "]");
      if (btn && !btn.disabled) btn.focus();
      else listEl.children[j].querySelector("input").focus();
    }

    function renderRows() {
      listEl.innerHTML = "";

      if (rows.length === 0) {
        listEl.appendChild(el("p", "admin-hint", "No categories yet. Add one below."));
      }

      rows.forEach(function (row, i) {
        var r = el("div", "admin-cat-row");

        var up = el("button", "owner-btn", "↑");
        up.type = "button";
        up.disabled = i === 0;
        up.setAttribute("data-up", "");
        up.setAttribute("aria-label", "Move " + (row.label || "category") + " up");
        up.addEventListener("click", function () {
          move(i, -1, "data-up");
        });

        var down = el("button", "owner-btn", "↓");
        down.type = "button";
        down.disabled = i === rows.length - 1;
        down.setAttribute("data-down", "");
        down.setAttribute("aria-label", "Move " + (row.label || "category") + " down");
        down.addEventListener("click", function () {
          move(i, 1, "data-down");
        });

        var input = document.createElement("input");
        input.type = "text";
        input.value = row.label;
        input.maxLength = 40;
        input.placeholder = "Category name";
        input.setAttribute("aria-label", "Category name");
        input.addEventListener("input", function () {
          row.label = input.value;
        });

        var n = row.value ? countFor(row.value) : 0;
        var count = el("span", "admin-cat-count", n ? n + (n === 1 ? " item" : " items") : "");

        var remove = el("button", "owner-btn owner-btn-danger", "Remove");
        remove.type = "button";
        remove.setAttribute("aria-label", "Remove " + (row.label || "category"));
        remove.addEventListener("click", function () {
          if (
            n > 0 &&
            !window.confirm(
              n +
                (n === 1 ? " item uses" : " items use") +
                ' "' +
                row.label +
                '". They will keep it, but it won\'t appear as a filter button. Remove it?'
            )
          ) {
            return;
          }
          rows.splice(i, 1);
          renderRows();
        });

        r.appendChild(up);
        r.appendChild(down);
        r.appendChild(input);
        r.appendChild(count);
        r.appendChild(remove);
        listEl.appendChild(r);
      });
    }

    form.querySelector("[data-add]").addEventListener("click", function () {
      rows.push({ value: "", label: "" });
      renderRows();
      var inputs = listEl.querySelectorAll("input");
      inputs[inputs.length - 1].focus();
    });

    form.querySelector("[data-cancel]").addEventListener("click", function () {
      dlg.close();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorEl.hidden = true;

      var clean = rows
        .map(function (r) {
          return { value: r.value, label: String(r.label).trim() };
        })
        .filter(function (r) {
          return r.label;
        });

      var seen = {};
      for (var k = 0; k < clean.length; k++) {
        var key = clean[k].label.toLowerCase();
        if (seen[key]) {
          errorEl.textContent = 'Two categories are both named "' + clean[k].label + '".';
          errorEl.hidden = false;
          return;
        }
        seen[key] = true;
      }

      // New categories get a stored value made from their name.
      var taken = clean
        .map(function (r) {
          return r.value;
        })
        .filter(Boolean);
      clean.forEach(function (r) {
        if (!r.value) {
          r.value = categoryValueFromLabel(r.label, taken);
          taken.push(r.value);
        }
      });

      submit.disabled = true;
      submit.textContent = "Saving…";

      data
        .saveSettings({ categories: clean })
        .then(function (saved) {
          app().applySettings(Object.assign({}, app().getSettings(), saved));
          dlg.close();
          say("Categories saved.");
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
          submit.disabled = false;
          submit.textContent = "Save";
        });
    });

    dlg.appendChild(form);
    renderRows();
    dlg.showModal();
  }

  /* ---------- Colors editor ---------- */

  var COLOR_FIELDS = [
    ["accent", "Accent", "Buttons, highlights, prices"],
    ["background", "Page background", ""],
    ["card", "Cards and pop-ups", ""],
    ["text", "Main text", ""],
    ["muted", "Soft text", "Labels and captions"],
    ["line", "Borders and grid lines", ""],
  ];

  var COLOR_PRESETS = {
    Dark: null, // the built-in defaults
    Light: {
      accent: "#c2410c",
      background: "#f6f4ef",
      card: "#ffffff",
      text: "#1c211d",
      muted: "#5b6459",
      line: "#d9d6c9",
    },
  };

  function luminanceOf(hex) {
    var n = parseInt(hex.slice(1), 16);
    var lin = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  function contrastBetween(a, b) {
    var la = luminanceOf(a);
    var lb = luminanceOf(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function openColors() {
    var original = app().getTheme();
    var working = Object.assign({}, original);
    var saved = false;

    var dlg = makeDialog("Colors");
    var form = el("form", "admin-form");

    form.innerHTML =
      '<div class="admin-presets"><span class="admin-hint">Start from:</span></div>' +
      '<div class="admin-colors"></div>' +
      '<p class="admin-warn" role="status" hidden></p>' +
      '<p class="admin-hint">Changes preview on the page behind this window. They only stick once you save.</p>' +
      '<p class="admin-error" role="alert" hidden></p>' +
      '<div class="admin-actions">' +
      '<button type="button" class="owner-btn" data-cancel>Cancel</button>' +
      '<button type="submit" class="owner-btn owner-btn-primary">Save</button>' +
      "</div>";

    var colorsEl = form.querySelector(".admin-colors");
    var warnEl = form.querySelector(".admin-warn");
    var errorEl = form.querySelector(".admin-error");
    var submit = form.querySelector('[type="submit"]');
    var inputs = {};
    var hexLabels = {};

    function checkContrast() {
      var problems = [];
      if (contrastBetween(working.text, working.background) < 4.5)
        problems.push("main text on the page background");
      if (contrastBetween(working.text, working.card) < 4.5)
        problems.push("main text on cards");
      if (contrastBetween(working.muted, working.background) < 3)
        problems.push("soft text on the page background");

      warnEl.hidden = problems.length === 0;
      warnEl.textContent = problems.length
        ? "Heads up: " + problems.join(", ") + " may be hard to read."
        : "";
    }

    function pushPreview() {
      app().applyTheme(working);
      checkContrast();
    }

    COLOR_FIELDS.forEach(function (f) {
      var key = f[0];
      var row = el("label", "admin-color-row");

      var text = el("span", "admin-color-name", f[1]);
      if (f[2]) text.appendChild(el("small", "", f[2]));

      var input = document.createElement("input");
      input.type = "color";
      input.value = working[key];
      inputs[key] = input;

      var hex = el("span", "admin-color-hex", working[key]);
      hexLabels[key] = hex;

      input.addEventListener("input", function () {
        working[key] = input.value;
        hex.textContent = input.value;
        pushPreview();
      });

      row.appendChild(text);
      row.appendChild(input);
      row.appendChild(hex);
      colorsEl.appendChild(row);
    });

    function setAll(theme) {
      Object.keys(inputs).forEach(function (key) {
        working[key] = theme[key];
        inputs[key].value = theme[key];
        hexLabels[key].textContent = theme[key];
      });
      pushPreview();
    }

    Object.keys(COLOR_PRESETS).forEach(function (name) {
      var b = el("button", "owner-btn", name);
      b.type = "button";
      b.addEventListener("click", function () {
        setAll(COLOR_PRESETS[name] || app().defaultTheme);
      });
      form.querySelector(".admin-presets").appendChild(b);
    });

    checkContrast();

    // Leaving without saving puts the page's colors back.
    dlg.addEventListener("close", function () {
      if (!saved) app().applyTheme(original);
    });

    form.querySelector("[data-cancel]").addEventListener("click", function () {
      dlg.close();
    });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorEl.hidden = true;
      submit.disabled = true;
      submit.textContent = "Saving…";

      data
        .saveSettings({ theme: working })
        .then(function (savedSettings) {
          saved = true;
          app().applySettings(Object.assign({}, app().getSettings(), savedSettings));
          dlg.close();
          say("Colors saved.");
        })
        .catch(function (err) {
          errorEl.textContent = err.message;
          errorEl.hidden = false;
          submit.disabled = false;
          submit.textContent = "Save";
        });
    });

    dlg.appendChild(form);
    dlg.showModal();
  }

  /* ---------- Owner bar ---------- */

  function buildBar() {
    bar.innerHTML = "";

    var label = el("span", "admin-bar-label", "Editing " + data.list.title);
    bar.appendChild(label);

    var addBtn = el("button", "owner-btn owner-btn-primary", "+ Add item");
    addBtn.type = "button";
    addBtn.addEventListener("click", addItem);
    bar.appendChild(addBtn);

    var catBtn = el("button", "owner-btn", "Categories");
    catBtn.type = "button";
    catBtn.addEventListener("click", openCategories);
    bar.appendChild(catBtn);

    var colorBtn = el("button", "owner-btn", "Colors");
    colorBtn.type = "button";
    colorBtn.addEventListener("click", openColors);
    bar.appendChild(colorBtn);

    // Filter the page down to cards whose price needs checking.
    var staleBtn = el("button", "owner-btn", "Needs checking");
    staleBtn.type = "button";
    function updateStaleBtn() {
      var n = app().getItems().filter(isStale).length;
      var on = app().isStaleOnly();
      staleBtn.textContent = (on ? "Showing: " : "") + "Needs checking (" + n + ")";
      staleBtn.setAttribute("aria-pressed", String(on));
      staleBtn.classList.toggle("owner-btn-primary", on);
    }
    staleBtn.addEventListener("click", function () {
      app().setStaleOnly(!app().isStaleOnly());
      updateStaleBtn();
    });
    document.addEventListener("wishlist:items", updateStaleBtn);
    updateStaleBtn();
    bar.appendChild(staleBtn);

    var reviewBtn = el("button", "owner-btn", "Prices to review");
    reviewBtn.type = "button";
    reviewBtn.addEventListener("click", openPriceReview);
    bar.appendChild(reviewBtn);

    var priceBtn = el("button", "owner-btn", "Refresh prices");
    priceBtn.type = "button";
    priceBtn.addEventListener("click", refreshPrices);
    bar.appendChild(priceBtn);

    var outBtn = el("button", "owner-btn", "Sign out");
    outBtn.type = "button";
    outBtn.addEventListener("click", function () {
      data.signOut();
    });
    bar.appendChild(outBtn);

    var status = el("span", "admin-status");
    status.id = "admin-status";
    status.setAttribute("role", "status");
    bar.appendChild(status);

    // Shows which account is signed in. The UID here must match the one in the
    // Firestore rules, so this is the first thing to check if saving is refused.
    var who = data.whoami && data.whoami();
    if (who) {
      var whoEl = el("span", "admin-who", "Signed in as " + who.email + " · UID: " + who.uid);
      bar.appendChild(whoEl);
    }
  }

  function onAuthChange(owner) {
    if (loginLink) loginLink.hidden = owner;
    if (!bar) return;

    bar.hidden = !owner;
    if (owner) buildBar();
    else if (app().setStaleOnly) app().setStaleOnly(false);
  }

  window.WishlistAdmin = {
    editItem: editItem,
    addColor: addColor,
    deleteItem: deleteItem,
    addItem: addItem,
    openLogin: openLogin,
  };

  if (data.configured) {
    if (loginLink) loginLink.addEventListener("click", openLogin);
    data.onAuth(onAuthChange);
  } else if (loginLink) {
    // Not configured yet: keep the link, but explain when it's clicked.
    loginLink.addEventListener("click", function () {
      window.alert("Firebase isn't set up yet — fill in firebase-config.js first.");
    });
  }
})();
