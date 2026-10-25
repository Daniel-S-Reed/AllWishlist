/* ============================================================
   Wish List — vanilla JS
   Loads items from Firebase (via firebase-data.js) and renders a
   filterable / sortable catalog. One script serves every list;
   which list is shown is decided by the page (see firebase-config.js).
   ============================================================ */

(function () {
  "use strict";

  var data = window.WishlistData;

  // Categories start from firebase-config.js; the owner can change them on the
  // site, and what they save (see applySettings) replaces these.
  var categoryFilters = data.categories;
  var categoryLabels = {};

  function setCategories(list) {
    categoryFilters = list;
    categoryLabels = list.reduce(function (acc, f) {
      acc[f.value] = f.label;
      return acc;
    }, {});

    // Drop any selected filter whose category no longer exists.
    if (typeof selectedCategories !== "undefined") {
      Array.from(selectedCategories).forEach(function (value) {
        if (!categoryLabels[value]) selectedCategories.delete(value);
      });
    }
  }

  /* ---------- State ---------- */

  var rawItems = [];
  var cards = [];
  var isLoading = true;
  var loadError = false;

  var selectedCategories = new Set();

  setCategories(categoryFilters);

  /* ---------- Colors ---------- */

  // The six colors the owner can change. These match the stylesheet's defaults.
  var DEFAULT_THEME = {
    accent: "#ff7a1a",
    background: "#0b0f14",
    card: "#12181f",
    text: "#e6edf3",
    muted: "#9aa4b2",
    line: "#232b36",
  };

  var themeRoot = document.querySelector(".wishlist-page") || document.documentElement;
  var currentTheme = Object.assign({}, DEFAULT_THEME);

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function rgbToHex(r, g, b) {
    return (
      "#" +
      [r, g, b]
        .map(function (v) {
          v = Math.max(0, Math.min(255, Math.round(v)));
          return (v < 16 ? "0" : "") + v.toString(16);
        })
        .join("")
    );
  }

  // amount < 0 darkens toward black, > 0 lightens toward white.
  function shade(hex, amount) {
    var c = hexToRgb(hex);
    var target = amount < 0 ? 0 : 255;
    var p = Math.abs(amount);
    return rgbToHex(
      c[0] + (target - c[0]) * p,
      c[1] + (target - c[1]) * p,
      c[2] + (target - c[2]) * p
    );
  }

  // Dark or white text, whichever is easier to read on this color.
  function readableOn(hex) {
    var lin = hexToRgb(hex).map(function (v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    var luminance = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    return luminance > 0.179 ? "#0b0f14" : "#ffffff";
  }

  // Applies a { accent, background, card, text, muted, line } set of colors.
  // Missing or invalid entries fall back to the defaults.
  function applyTheme(theme) {
    var t = {};
    Object.keys(DEFAULT_THEME).forEach(function (key) {
      var v = theme && theme[key];
      t[key] = /^#[0-9a-fA-F]{6}$/.test(v || "") ? v.toLowerCase() : DEFAULT_THEME[key];
    });

    var s = themeRoot.style;
    s.setProperty("--brass", t.accent);
    s.setProperty("--forest", t.accent);
    s.setProperty(
      "--brass-deep",
      t.accent === DEFAULT_THEME.accent ? "#f97316" : shade(t.accent, -0.08)
    );
    s.setProperty("--on-accent", readableOn(t.accent));
    s.setProperty("--paper", t.background);
    s.setProperty("--card", t.card);
    s.setProperty("--ink", t.text);
    s.setProperty("--ink-soft", t.muted);
    s.setProperty("--line", t.line);

    currentTheme = t;
    return t;
  }

  // Remember the last saved settings so the page doesn't flash the default
  // colors and categories while it waits for Firebase.
  var settingsCacheKey = "wishlist-settings-" + data.listId;

  var lastSettings = null; // the most recently applied settings object

  function applySettings(settings) {
    lastSettings = settings || null;
    if (settings && Array.isArray(settings.categories)) setCategories(settings.categories);
    applyTheme(settings && settings.theme);

    try {
      localStorage.setItem(settingsCacheKey, JSON.stringify(settings || null));
    } catch (e) {
      /* storage can be unavailable (private mode); the cache is optional */
    }

    render();
  }

  try {
    var cachedSettings = JSON.parse(localStorage.getItem(settingsCacheKey) || "null");
    if (cachedSettings) {
      lastSettings = cachedSettings;
      if (Array.isArray(cachedSettings.categories)) setCategories(cachedSettings.categories);
      applyTheme(cachedSettings.theme);
    }
  } catch (e) {
    /* ignore a missing or unreadable cache */
  }

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

  /* ---------- Item images ---------- */

  // A free image relay used only as a second try when a picture won't load
  // directly. Set `imageProxy: ""` in firebase-config.js to turn this off.
  var IMAGE_PROXY =
    window.WISHLIST_CONFIG && window.WISHLIST_CONFIG.imageProxy !== undefined
      ? window.WISHLIST_CONFIG.imageProxy
      : "https://wsrv.nl/?url=";

  function showImageMissing(wrap, img, url) {
    img.hidden = true;

    var box = wrap.querySelector(".item-image-missing");
    if (!box) {
      box = document.createElement("div");
      box.className = "item-image-missing";
      wrap.appendChild(box);
    }

    box.textContent = url
      ? ownerMode
        ? "Image not available. Use Edit to fix its address."
        : "Image not available"
      : "No image";
    if (url) box.title = url;
  }

  // Shows (or re-shows) a card's picture, clearing any earlier failure.
  function setCardImage(wrap, img, url) {
    var box = wrap.querySelector(".item-image-missing");
    if (box) box.remove();

    img.hidden = false;
    delete img.dataset.relayed;
    delete img.dataset.original;

    if (!url) {
      img.removeAttribute("src");
      showImageMissing(wrap, img, "");
      return;
    }

    img.src = url;
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
    img.alt = "";
    img.loading = "lazy";
    // Don't send this site's address to the image host. Some stores (LEGO, for one)
    // refuse images when the request says it came from another website.
    img.referrerPolicy = "no-referrer";

    imgWrap.appendChild(img);

    // If the picture won't load directly, retry once through an image relay
    // (some stores refuse images shown on other sites). If that fails too,
    // show a clear "not available" box instead of an empty gap.
    img.addEventListener("error", function () {
      var failed = img.getAttribute("src") || "";

      if (IMAGE_PROXY && !img.dataset.relayed && /^https?:\/\//i.test(failed)) {
        img.dataset.relayed = "1";
        img.dataset.original = failed;
        img.src = IMAGE_PROXY + encodeURIComponent(failed);
        return;
      }

      console.warn("Image failed to load:", img.dataset.original || failed);
      showImageMissing(imgWrap, img, img.dataset.original || failed);
    });

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

      setCardImage(imgWrap, img, v.image);

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
    getSettings: function () {
      return lastSettings || {};
    },
    getTheme: function () {
      return Object.assign({}, currentTheme);
    },
    defaultTheme: DEFAULT_THEME,
    applyTheme: applyTheme, // used for the live preview while picking colors
    applySettings: applySettings, // used after the owner saves categories or colors
  };

  // Show or hide the owner controls as the sign-in state changes.
  data.onAuth(function (owner) {
    ownerMode = owner;
    render();
  });

  /* ---------- Init ---------- */

  render();

  reload();

  // Saved categories and colors for this list (if the owner has set any).
  data
    .loadSettings()
    .then(applySettings)
    .catch(function (err) {
      console.error("Couldn't load the site settings:", err);
    });
})();
