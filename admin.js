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
      '<label class="admin-field"><span>Name *</span>' +
      '<input type="text" name="name" required maxlength="120"></label>' +
      '<div class="admin-row">' +
      '<label class="admin-field"><span>Price ($)</span>' +
      '<input type="number" name="price" min="0" step="0.01" inputmode="decimal"></label>' +
      '<label class="admin-check admin-check-fav"><input type="checkbox" name="fav"> <span>Favorite</span></label>' +
      "</div>" +
      '<label class="admin-field"><span>Link to buy</span>' +
      '<input type="url" name="link" placeholder="https://…"></label>' +
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
      '<datalist id="admin-groups"></datalist>' +
      "</details>" +
      '<p class="admin-error" role="alert" hidden></p>' +
      '<div class="admin-actions">' +
      '<button type="button" class="owner-btn" data-cancel>Cancel</button>' +
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

    if (start.group || start.color) form.querySelector(".admin-details").open = true;

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

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      errorEl.hidden = true;

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
          return app().reload();
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

  function importFromSheet() {
    var existing = app().getItems().length;
    var message =
      "Copy every row from your old Google Sheet into this list?\n\n" +
      (existing > 0
        ? "This list already has " + existing + " items. Importing again will create duplicates.\n\n"
        : "") +
      "Only do this once.";

    if (!window.confirm(message)) return;

    say("Importing…");

    data
      .importFromSheet()
      .then(function (count) {
        say("Imported " + count + " items.");
        return app().reload();
      })
      .catch(function (err) {
        say("Import failed: " + err.message);
      });
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

    if (data.list.legacySheetId && !String(data.list.legacySheetId).startsWith("PASTE")) {
      var importBtn = el("button", "owner-btn", "Import from Google Sheet");
      importBtn.type = "button";
      importBtn.addEventListener("click", importFromSheet);
      bar.appendChild(importBtn);
    }

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
  }

  function onAuthChange(owner) {
    if (loginLink) loginLink.hidden = owner;
    if (!bar) return;

    bar.hidden = !owner;
    if (owner) buildBar();
  }

  window.WishlistAdmin = {
    editItem: editItem,
    addColor: addColor,
    deleteItem: deleteItem,
    addItem: addItem,
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
