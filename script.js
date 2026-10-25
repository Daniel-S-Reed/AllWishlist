/* ============================================================
   Wish List — vanilla JS
   Loads items from Firebase (via firebase-data.js) and renders a
   filterable / sortable catalog. One script serves every list;
   which list is shown is decided by the page (see firebase-config.js).
   ============================================================ */

(function () {
  "use strict";

  var data = window.WishlistData;

  // Categories and clothing sub-filters come from firebase-config.js.
  var categoryFilters = data.categories;

  var categoryLabels = categoryFilters.reduce(function (acc, f) {
    acc[f.value] = f.label;
    return acc;
  }, {});

  /* ---------- State ---------- */

  var rawItems = [];
  var cards = [];
  var isLoading = true;
  var loadError = false;

  var selectedCategories = new Set();

  var clothingTypes = data.clothingTypes;

  var selectedClothingTypes = new Set(
    clothingTypes.map(function (type) {
      return type.value;
    })
  );

  var favOnly = false;
  var sortMode = "alpha"; // 'alpha' | 'price'
  var sortDir = "asc"; // 'asc' | 'desc'

  var priceBounds = null; // { min, max }
  var priceRange = null; // { min, max }

  var ownerMode = false; // true while signed in as this list's owner

  /* ---------- DOM references ---------- */

  var els = {
    categoryRow: document.getElementById("category-row"),
    clothingRow: document.getElementById("clothing-row"),
    favToggle: document.getElementById("fav-toggle"),
    priceContainer: document.getElementById("price-container"),
    sortAlpha: document.getElementById("sort-alpha"),
    sortPrice: document.getElementById("sort-price"),
    sortPriceDir: document.getElementById("sort-price-dir"),
    activeFilters: document.getElementById("active-filters"),
    clearBtn: document.getElementById("clear-btn"),
    count: document.getElementById("count"),
    resultsMessage: document.getElementById("results-message"),
    loadState: document.getElementById("load-state"),
    items: document.getElementById("items"),
    topBtn: document.getElementById("top-btn"),
  };

  /* ---------- Data helpers ---------- */

  // Groups rows that share a "group" ID into one card with multiple
  // variants (e.g. a shirt design available in several colors/prices).
  // Rows without a group become their own single-variant card.
  function buildCards(items) {
    var groups = {};
    var groupOrder = [];
    var cards = [];

    items.forEach(function (item) {
      if (item.group) {
        if (!groups[item.group]) {
          groups[item.group] = [];
          groupOrder.push(item.group);
        }
        groups[item.group].push(item);
      } else {
        cards.push({
          name: item.name,
          tags: item.tags.slice(),
          clothingTypes: item.clothingTypes.slice(),
          variants: [item],
        });
      }
    });

    groupOrder.forEach(function (key) {
      var variants = groups[key];
      var tags = [];
      var clothingTypes = [];

      variants.forEach(function (v) {
        v.tags.forEach(function (t) {
          if (tags.indexOf(t) === -1) tags.push(t);
        });
        v.clothingTypes.forEach(function (t) {
          if (clothingTypes.indexOf(t) === -1) clothingTypes.push(t);
        });
      });

      cards.push({
        name: variants[0].name,
        tags: tags,
        clothingTypes: clothingTypes,
        variants: variants,
      });
    });

    return cards;
  }

  function priceValue(item) {
    var n = parseFloat(String(item.price));
    return isNaN(n) ? 0 : n;
  }

  // 24 -> "24", 24.5 -> "24.50"
  function formatPrice(value) {
    var n = parseFloat(String(value));
    if (isNaN(n)) return String(value);
    return n % 1 === 0 ? String(n) : n.toFixed(2);
  }

  // A card's "starting" price — the lowest price across its variants —
  // used for sort order and as the price shown before a swatch is picked.
  function cardMinPrice(card) {
    var prices = card.variants.map(priceValue);
    return Math.min.apply(null, prices);
  }

  function fetchItems() {
    return data.loadItems();
  }

  /* ---------- Filtering / sorting ---------- */

  function isPriceFiltered() {
    return (
      !!priceRange &&
      !!priceBounds &&
      (priceRange.min > priceBounds.min || priceRange.max < priceBounds.max)
    );
  }

  function itemMatches(card) {
    // Category: OR across the selected categories.
    var categoryOk =
      selectedCategories.size === 0 ||
      card.tags.some(function (t) {
        return selectedCategories.has(t);
      });

    // Clothing type: only applies to items in the Clothes category.
    // Other selected categories remain unaffected.
    var clothingOk =
      !selectedCategories.has("Clothes") ||
      card.tags.indexOf("Clothes") === -1 ||
      card.clothingTypes.some(function (type) {
        return selectedClothingTypes.has(type);
      });

    // Favorites: AND — narrows within the selected category.
    var favOk = !favOnly || card.tags.indexOf("Fav") !== -1;

    // Price: AND — a card matches if ANY of its variants is in range
    // (or has no listed price, which is always shown).
    var priceOk =
      !isPriceFiltered() ||
      card.variants.some(function (v) {
        var p = priceValue(v);
        return p <= 0 || (p >= priceRange.min && p <= priceRange.max);
      });

    return categoryOk && clothingOk && favOk && priceOk;
  }

  function getMatched() {
    return cards.filter(itemMatches);
  }

  function getVisible(matched) {
    var sorted = matched.slice();

    if (sortMode === "alpha") {
      sorted.sort(function (a, b) {
        return a.name.localeCompare(b.name);
      });
    } else {
      sorted.sort(function (a, b) {
        return cardMinPrice(a) - cardMinPrice(b);
      });
    }

    if (sortDir === "desc") sorted.reverse();

    return sorted;
  }

  /* ---------- Event handlers ---------- */

  function toggleSet(set, value) {
    if (set.has(value)) set.delete(value);
    else set.add(value);
  }

  function onCategoryClick(value) {
    if (value === "all") {
      selectedCategories = new Set();
    } else {
      var wasSelected = selectedCategories.has(value);

      toggleSet(selectedCategories, value);

      // When Clothes is selected after all clothing types were cleared,
      // restore all clothing types so the user sees clothing immediately.
      if (
        value === "Clothes" &&
        !wasSelected &&
        selectedClothingTypes.size === 0
      ) {
        selectedClothingTypes = new Set(
          clothingTypes.map(function (type) {
            return type.value;
          })
        );
      }
    }

    render();
  }

  function onClothingTypeClick(value) {
    if (value === "all") {
      selectedClothingTypes = new Set(
        clothingTypes.map(function (type) {
          return type.value;
        })
      );
    } else {
      toggleSet(selectedClothingTypes, value);
    }

    render();
  }

  function onSortClick(mode) {
    if (mode === sortMode) {
      sortDir = sortDir === "asc" ? "desc" : "asc";
    } else {
      sortMode = mode;
      sortDir = "asc";
    }

    render();
  }

  function clearFilters() {
    selectedCategories = new Set();

    selectedClothingTypes = new Set(
      clothingTypes.map(function (type) {
        return type.value;
      })
    );

    favOnly = false;

    if (priceBounds) {
      priceRange = {
        min: priceBounds.min,
        max: priceBounds.max,
      };
    }

    render();
  }

  function onMinPrice(value) {
    if (!priceRange) return;

    priceRange = {
      min: Math.min(value, priceRange.max),
      max: priceRange.max,
    };

    render();
  }

  function onMaxPrice(value) {
    if (!priceRange) return;

    priceRange = {
      min: priceRange.min,
      max: Math.max(value, priceRange.min),
    };

    render();
  }

  /* ---------- Rendering ---------- */

  function renderCategories() {
    els.categoryRow.innerHTML = "";

    var allBtn = document.createElement("button");

    allBtn.type = "button";
    allBtn.className =
      "chip chip-all" + (selectedCategories.size === 0 ? " active" : "");

    allBtn.setAttribute(
      "aria-pressed",
      String(selectedCategories.size === 0)
    );

    allBtn.textContent = "All items";

    allBtn.addEventListener("click", function () {
      onCategoryClick("all");
    });

    els.categoryRow.appendChild(allBtn);

    categoryFilters.forEach(function (c) {
      var btn = document.createElement("button");
      var active = selectedCategories.has(c.value);

      btn.type = "button";
      btn.className = "chip" + (active ? " active" : "");
      btn.setAttribute("aria-pressed", String(active));
      btn.textContent = c.label;

      btn.addEventListener("click", function () {
        onCategoryClick(c.value);
      });

      els.categoryRow.appendChild(btn);
    });

    // Clothing sub-filters only appear while Clothes is selected.
    els.clothingRow.innerHTML = "";
    els.clothingRow.hidden = !selectedCategories.has("Clothes");

    if (!els.clothingRow.hidden) {
      var allClothingBtn = document.createElement("button");

      var allClothingActive =
        selectedClothingTypes.size === clothingTypes.length;

      allClothingBtn.type = "button";

      allClothingBtn.className =
        "chip chip-all" + (allClothingActive ? " active" : "");

      allClothingBtn.setAttribute(
        "aria-pressed",
        String(allClothingActive)
      );

      allClothingBtn.textContent = "All clothing";

      allClothingBtn.addEventListener("click", function () {
        onClothingTypeClick("all");
      });

      els.clothingRow.appendChild(allClothingBtn);

      clothingTypes.forEach(function (type) {
        var btn = document.createElement("button");
        var active = selectedClothingTypes.has(type.value);

        btn.type = "button";
        btn.className = "chip" + (active ? " active" : "");
        btn.setAttribute("aria-pressed", String(active));
        btn.textContent = type.label;

        btn.addEventListener("click", function () {
          onClothingTypeClick(type.value);
        });

        els.clothingRow.appendChild(btn);
      });
    }
  }

  function renderFav() {
    els.favToggle.classList.toggle("active", favOnly);
    els.favToggle.setAttribute("aria-pressed", String(favOnly));
  }

  function renderSort() {
    var alphaActive = sortMode === "alpha";

    els.sortAlpha.classList.toggle("active", alphaActive);
    els.sortAlpha.setAttribute("aria-pressed", String(alphaActive));

    var priceActive = sortMode === "price";

    els.sortPrice.classList.toggle("active", priceActive);
    els.sortPrice.setAttribute("aria-pressed", String(priceActive));

    if (priceActive) {
      els.sortPriceDir.textContent = sortDir === "asc" ? "\u2191" : "\u2193";

      var label =
        "Sorted by price, " +
        (sortDir === "asc" ? "low to high" : "high to low") +
        ". Activate to reverse.";

      els.sortPrice.setAttribute("aria-label", label);
    } else {
      els.sortPriceDir.textContent = "";
      els.sortPrice.setAttribute("aria-label", "Sort by price");
    }
  }

  function renderPrice() {
    if (!priceBounds || !priceRange) return;

    // Build the slider once, then keep values in sync afterwards.
    if (!document.getElementById("price-min")) {
      els.priceContainer.innerHTML = "";

      var wrap = document.createElement("div");
      wrap.className = "price-slider";

      var readout = document.createElement("div");
      readout.className = "price-readout";
      readout.id = "price-readout";
      readout.setAttribute("aria-hidden", "true");

      wrap.appendChild(readout);

      var inputs = document.createElement("div");
      inputs.className = "range-inputs";

      var minLabel = document.createElement("label");
      minLabel.className = "sr-only";
      minLabel.htmlFor = "price-min";
      minLabel.textContent = "Minimum price";

      var minInput = document.createElement("input");
      minInput.type = "range";
      minInput.id = "price-min";
      minInput.min = String(priceBounds.min);
      minInput.max = String(priceBounds.max);
      minInput.step = "1";

      minInput.addEventListener("input", function (e) {
        onMinPrice(Number(e.target.value));
      });

      var maxLabel = document.createElement("label");
      maxLabel.className = "sr-only";
      maxLabel.htmlFor = "price-max";
      maxLabel.textContent = "Maximum price";

      var maxInput = document.createElement("input");
      maxInput.type = "range";
      maxInput.id = "price-max";
      maxInput.min = String(priceBounds.min);
      maxInput.max = String(priceBounds.max);
      maxInput.step = "1";

      maxInput.addEventListener("input", function (e) {
        onMaxPrice(Number(e.target.value));
      });

      inputs.appendChild(minLabel);
      inputs.appendChild(minInput);
      inputs.appendChild(maxLabel);
      inputs.appendChild(maxInput);

      wrap.appendChild(inputs);
      els.priceContainer.appendChild(wrap);
    }

    var readoutEl = document.getElementById("price-readout");

    readoutEl.textContent =
      "$" +
      priceRange.min +
      " \u2013 $" +
      priceRange.max +
      (priceRange.max >= priceBounds.max ? "+" : "");

    var minEl = document.getElementById("price-min");
    var maxEl = document.getElementById("price-max");

    // Keep the slider limits current — they change when items are added or edited.
    minEl.min = maxEl.min = String(priceBounds.min);
    minEl.max = maxEl.max = String(priceBounds.max);

    minEl.value = String(priceRange.min);
    minEl.setAttribute(
      "aria-valuetext",
      "Minimum $" + priceRange.min
    );

    maxEl.value = String(priceRange.max);
    maxEl.setAttribute(
      "aria-valuetext",
      "Maximum $" + priceRange.max
    );
  }

  function renderStatus(matched) {
    var activeTags = []
      .concat(
        Array.from(selectedCategories).map(function (c) {
          return categoryLabels[c] || c;
        })
      )
      .concat(
        selectedCategories.has("Clothes") &&
        selectedClothingTypes.size < clothingTypes.length
          ? Array.from(selectedClothingTypes).map(function (type) {
              var found = clothingTypes.find(function (t) {
                return t.value === type;
              });

              return found ? found.label : type;
            })
          : []
      )
      .concat(favOnly ? ["Favorites"] : [])
      .concat(
        isPriceFiltered()
          ? ["$" + priceRange.min + "\u2013$" + priceRange.max]
          : []
      );

    els.activeFilters.innerHTML =
      '<span class="sr-only">Active filters:</span>';

    if (activeTags.length > 0) {
      els.activeFilters.hidden = false;
      els.clearBtn.hidden = false;

      activeTags.forEach(function (t) {
        var span = document.createElement("span");

        span.className = "tag";
        span.textContent = t;

        els.activeFilters.appendChild(span);
      });
    } else {
      els.activeFilters.hidden = true;
      els.clearBtn.hidden = true;
    }

    els.count.textContent =
      !isLoading && !loadError
        ? "Showing " + matched.length + " of " + cards.length
        : "";

    els.resultsMessage.textContent = isLoading
      ? "Loading the list."
      : loadError
      ? "Couldn't load the list right now. Try refreshing."
      : "Showing " + matched.length + " of " + cards.length + " items.";
  }

  function createCard(card) {
    var li = document.createElement("li");
    li.className = "item-card";

    var article = document.createElement("article");

    var activeIndex = 0;
    var refreshTools = null; // set below when owner controls are shown
    function activeVariant() {
      return card.variants[activeIndex];
    }

    var imgWrap = document.createElement("div");
    imgWrap.className = "item-image-wrap";

    var img = document.createElement("img");
    img.className = "item-image";
    img.src = activeVariant().image || "placeholder.svg";
    img.alt = "";
    img.loading = "lazy";
    img.crossOrigin = "anonymous";

    imgWrap.appendChild(img);

    if (card.variants.length > 1) {
      var badge = document.createElement("span");
      badge.className = "variant-badge";
      badge.textContent = card.variants.length + " colors";
      badge.setAttribute("aria-hidden", "true");
      imgWrap.appendChild(badge);
    }

    var body = document.createElement("div");
    body.className = "item-body";

    var name = document.createElement("h3");
    name.className = "item-name";
    name.textContent = card.name;

    body.appendChild(name);

    var price = document.createElement("span");
    price.className = "item-price";
    body.appendChild(price);

    var colorLabel = null;
    if (card.variants.length > 1) {
      colorLabel = document.createElement("span");
      colorLabel.className = "variant-color-label";
      body.appendChild(colorLabel);
    }

    article.appendChild(imgWrap);
    article.appendChild(body);

    var swatchRow = null;
    if (card.variants.length > 1) {
      var swatchGroup = document.createElement("div");
      swatchGroup.className = "variant-group";

      var swatchHeading = document.createElement("span");
      swatchHeading.className = "variant-group-label";
      swatchHeading.textContent = "Color";
      swatchHeading.setAttribute("aria-hidden", "true");
      swatchGroup.appendChild(swatchHeading);

      swatchRow = document.createElement("div");
      swatchRow.className = "variant-swatches";
      swatchRow.setAttribute("role", "group");
      swatchRow.setAttribute("aria-label", "Choose a color for " + card.name);

      card.variants.forEach(function (v, i) {
        var swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "swatch";
        swatch.setAttribute("aria-pressed", String(i === activeIndex));
        swatch.setAttribute("aria-label", v.color || "Option " + (i + 1));
        swatch.title = v.color || "Option " + (i + 1);
        swatch.style.backgroundColor = v.color ? v.color.toLowerCase() : "#999";

        swatch.addEventListener("click", function () {
          activeIndex = i;
          updateVariantDisplay();

          var buttons = swatchRow.querySelectorAll(".swatch");
          for (var b = 0; b < buttons.length; b++) {
            buttons[b].setAttribute("aria-pressed", String(b === i));
          }
        });

        swatchRow.appendChild(swatch);
      });

      swatchGroup.appendChild(swatchRow);
      body.appendChild(swatchGroup);
    }

    var link = document.createElement("a");
    link.className = "item-link";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = 'View item <span aria-hidden="true">&rarr;</span>';
    article.appendChild(link);

    var nolink = document.createElement("span");
    nolink.className = "item-nolink";
    nolink.textContent = "No link yet";
    article.appendChild(nolink);

    function updateVariantDisplay() {
      var v = activeVariant();
      var priceText = v.price !== null && v.price !== "" ? "$" + formatPrice(v.price) : null;

      img.src = v.image || "placeholder.svg";

      if (colorLabel) {
        colorLabel.textContent = v.color ? v.color : "";
      }

      if (priceText) {
        price.innerHTML = '<span class="sr-only">Price: </span>' + priceText;
        price.style.display = "";
      } else {
        price.innerHTML = "";
        price.style.display = "none";
      }

      if (v.link) {
        link.href = v.link;
        link.setAttribute(
          "aria-label",
          "View " +
            card.name +
            (v.color ? ", " + v.color : "") +
            (priceText ? ", " + priceText : "") +
            " (opens in a new tab)"
        );
        link.style.display = "";
        nolink.style.display = "none";
      } else {
        link.style.display = "none";
        nolink.style.display = "";
      }

      if (refreshTools) refreshTools();
    }

    updateVariantDisplay();

    // Owner-only controls (edit / delete / add another color).
    if (ownerMode && window.WishlistAdmin) {
      var tools = document.createElement("div");
      tools.className = "owner-tools";

      var editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "owner-btn";
      editBtn.textContent = "Edit";
      editBtn.addEventListener("click", function () {
        window.WishlistAdmin.editItem(activeVariant());
      });

      var colorBtn = document.createElement("button");
      colorBtn.type = "button";
      colorBtn.className = "owner-btn";
      colorBtn.textContent = "+ Color";
      colorBtn.title = "Add another color or price option to this card";
      colorBtn.addEventListener("click", function () {
        window.WishlistAdmin.addColor(activeVariant());
      });

      var delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "owner-btn owner-btn-danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", function () {
        window.WishlistAdmin.deleteItem(activeVariant());
      });

      // Spoken labels follow whichever color swatch is selected.
      refreshTools = function () {
        var v = activeVariant();
        var label = " " + card.name + (v.color ? " (" + v.color + ")" : "");
        editBtn.setAttribute("aria-label", "Edit" + label);
        colorBtn.setAttribute("aria-label", "Add another color to" + label);
        delBtn.setAttribute("aria-label", "Delete" + label);
      };
      refreshTools();

      tools.appendChild(editBtn);
      tools.appendChild(colorBtn);
      tools.appendChild(delBtn);
      article.appendChild(tools);
    }

    li.appendChild(article);

    return li;
  }

  function renderItems(visible) {
    els.items.innerHTML = "";

    // Remove any previous empty-state message.
    var existingEmpty = document.getElementById("empty-state");

    if (existingEmpty) existingEmpty.remove();

    if (!isLoading && !loadError && visible.length === 0) {
      var empty = document.createElement("p");

      empty.className = "empty-state";
      empty.id = "empty-state";

      empty.textContent =
        "Nothing matches those filters — try clearing one above.";

      els.items.parentNode.insertBefore(empty, els.items);

      return;
    }

    var frag = document.createDocumentFragment();

    visible.forEach(function (item) {
      frag.appendChild(createCard(item));
    });

    els.items.appendChild(frag);
  }

  function renderLoadState() {
    if (isLoading) {
      els.loadState.textContent = "Loading the list\u2026";
      els.loadState.hidden = false;
    } else if (loadError) {
      els.loadState.textContent =
        "Couldn't load the list right now — try refreshing.";

      els.loadState.hidden = false;
    } else {
      els.loadState.hidden = true;
    }
  }

  function render() {
    var matched = getMatched();
    var visible = getVisible(matched);

    renderCategories();
    renderFav();
    renderSort();
    renderPrice();
    renderStatus(matched);
    renderLoadState();
    renderItems(visible);
  }

  /* ---------- Static event wiring ---------- */

  els.favToggle.addEventListener("click", function () {
    favOnly = !favOnly;
    render();
  });

  els.sortAlpha.addEventListener("click", function () {
    onSortClick("alpha");
  });

  els.sortPrice.addEventListener("click", function () {
    onSortClick("price");
  });

  els.clearBtn.addEventListener("click", clearFilters);

  els.topBtn.addEventListener("click", function () {
    document.documentElement.scrollTop = 0;
  });

  window.addEventListener("scroll", function () {
    els.topBtn.hidden = document.documentElement.scrollTop <= 200;
  });

  // Fill the page heading from this list's settings.
  (function setHeading() {
    var list = data.list;
    var title = document.getElementById("site-title");
    var eyebrow = document.getElementById("site-eyebrow");
    var lede = document.getElementById("site-lede");

    if (title) title.textContent = list.title;
    if (eyebrow) eyebrow.textContent = list.eyebrow || "";
    if (lede) lede.textContent = list.lede || "";
    document.title = list.title;
  })();

  // Takes a fresh array of items and refreshes everything derived from it.
  function applyItems(items) {
    // Was the visitor actually narrowing the price range before this refresh?
    var hadNarrowedRange = isPriceFiltered();

    rawItems = items;
    cards = buildCards(rawItems);

    var nums = rawItems
      .map(priceValue)
      .filter(function (n) {
        return n > 0;
      });

    if (nums.length > 0) {
      priceBounds = {
        min: Math.floor(Math.min.apply(null, nums)),
        max: Math.ceil(Math.max.apply(null, nums)),
      };

      if (hadNarrowedRange) {
        // Keep their narrowed range, trimmed to the new limits.
        priceRange = {
          min: Math.max(priceRange.min, priceBounds.min),
          max: Math.min(priceRange.max, priceBounds.max),
        };
        if (priceRange.min > priceRange.max) {
          priceRange = { min: priceBounds.min, max: priceBounds.max };
        }
      } else {
        // Not filtering: always show the full range, even if the limits moved.
        priceRange = { min: priceBounds.min, max: priceBounds.max };
      }
    } else {
      priceBounds = null;
      priceRange = null;
      els.priceContainer.innerHTML = "";
    }
  }

  // Re-reads the list from Firebase (used after the owner saves a change).
  function reload() {
    return fetchItems()
      .then(function (items) {
        applyItems(items);
        isLoading = false;
        loadError = false;
        render();
      })
      .catch(function (err) {
        console.error("Failed to reload wish list:", err);
        isLoading = false;
        loadError = true;
        render();
      });
  }

  window.WishlistApp = {
    reload: reload,
    getItems: function () {
      return rawItems;
    },
    getCategories: function () {
      return categoryFilters;
    },
    getClothingTypes: function () {
      return clothingTypes;
    },
  };

  // Show or hide the owner controls as the sign-in state changes.
  data.onAuth(function (owner) {
    ownerMode = owner;
    render();
  });

  /* ---------- Init ---------- */

  render();

  reload();
})();
