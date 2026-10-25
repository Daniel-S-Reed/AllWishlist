/* ============================================================
   Wish list settings — the one file you edit to set things up.
   ============================================================ */

window.WISHLIST_CONFIG = {
  // 1) Paste the values from Firebase console → Project settings → Your apps → Web app.
  //    These are NOT secret. Access is protected by the Firestore rules, not by hiding this.
  firebase: {
    apiKey: "AIzaSyA3z7unUqmAYjmJ_25NEuWI1laZ9veZq-s",
    authDomain: "wishlist-3df12.firebaseapp.com",
    projectId: "wishlist-3df12",
    storageBucket: "wishlist-3df12.firebasestorage.app",
    messagingSenderId: "667524517815",
    appId: "1:667524517815:web:d380dd8f74749c6b92a232"
  },

  // 2) Which list a page shows. index.html uses "dan", brother.html uses "brother".
  //    (You can also open any page with ?list=brother to override.)
  defaultList: "dan",

  // 3) One entry per list.
  //    ownerEmail: the login email you create for that list in Firebase → Authentication.
  //                Only the password is typed on the site; the email is filled in for you.
  //    categories: the filter buttons for that list. `value` is what's stored on items,
  //                `label` is what's shown.
  lists: {
    dan: {
      title: "Daniel's Wish List",
      eyebrow: "A running list — mostly for birthdays and Christmas",
      lede: "Browse by category or price below, then follow a card through to buy.",
      ownerEmail: "dsreed14@gmail.com",
      // Where your existing items live today, for the one-time "Import from Google Sheet" button.
      legacySheetId: "1vKmj_Z7NxkYnKkdaCFm3jdLKwNhvJuWe7IGW6iiDtlE",
      categories: [
        { value: "HarryPotter", label: "Harry Potter" },
        { value: "Puzzles", label: "Puzzles" },
        { value: "Fidget", label: "Fidgets" },
        { value: "Desk", label: "Desk" },
        { value: "Chair", label: "Chair" },
        { value: "Light", label: "Light" },
        { value: "Wood", label: "Wood" },
        { value: "Guitar", label: "Guitar" },
        { value: "Books", label: "Books" },
        { value: "Models", label: "Models" },
        { value: "Clothes", label: "Clothes" },
        { value: "Other", label: "Other" },
      ],
    },

    mic: {
      title: "Micah's Wish List", // <- change to his name
      eyebrow: "A running list",
      lede: "Browse by category or price below, then follow a card through to buy.",
      ownerEmail: "mreed1272@gmail.com",

      // His Google Form saves answers into a Google Sheet. Paste that sheet's ID here
      // (the long part of its URL between /d/ and /edit), and share the sheet as
      // "Anyone with the link can view". Then use "Import from Google Sheet" once.
      legacySheetId: "PASTE_HIS_SHEET_ID",
      legacyTab: "Form Responses 1", // the tab name at the bottom of the sheet
      legacyColumns: "auto", // finds Name / Price / Link / Image / Category by their headings
      // Starter categories — edit freely. Add "Clothes" if he wants the clothing sub-filters.
      categories: [
        { value: "Games", label: "Games" },
        { value: "Books", label: "Books" },
        { value: "Tech", label: "Tech" },
        { value: "Clothes", label: "Clothes" },
        { value: "Other", label: "Other" },
      ],
    },
  },

  // Clothing sub-filters (only shown when the "Clothes" category is selected).
  clothingTypes: [
    { value: "Hat", label: "Hats" },
    { value: "Short S", label: "Short Sleeve Shirt" },
    { value: "Long S", label: "Long Sleeve Shirt" },
    { value: "Pants", label: "Pants" },
    { value: "Shorts", label: "Shorts" },
    { value: "Jacket", label: "Jackets" },
    { value: "Hoodie", label: "Hoodies" },
  ],
};
