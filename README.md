# Wish list site

A plain HTML/CSS/JavaScript wish list, hosted on GitHub Pages, with items stored in Firebase (Firestore). Each person has their own page and their own owner password.

| Page | Address | List id |
| --- | --- | --- |
| `index.html` | Daniel's list | `dan` |
| `mic.html` | Micah's list | `mic` |

## How it fits together

| File | What it does |
| --- | --- |
| `index.html`, `mic.html` | The two pages. `<body data-list="…">` picks the list. |
| `script.js` | The public page: filters, sorting, cards and color swatches. Also loads `admin.js` when the owner signs in. |
| `admin.js` | The owner editor: add/edit items, categories, colors, price checking and review. Only downloaded for the owner. |
| `firebase-data.js` | All database and sign-in code. Everything else goes through `window.WishlistData`. |
| `firebase-config.js` | Firebase keys (public by design), each list's title, owner email and starting categories. |
| `firestore.rules` | The security rules. **These are what actually protect the data.** |
| `styles.css` | All styling. Colors are CSS variables the owner can change from the Colors button. |
| `tests/` | Automated page tests. |

## Data

Items live at `lists/{listId}/items/{itemId}` with: `name`, `image`, `link`, `price`, `tags[]`, `clothingTypes[]`, `group`, `color`, `swatch`, `priceCheckedAt`.
Items with the same `group` show as one card with color swatches. Per-list categories and colors are stored on `lists/{listId}`.

## Using it

- **Owner login** (bottom of the page) → enter that list's password. The owner bar appears.
- **Prices:** *Check price* reads a price from the item's link (not possible on Amazon). *Refresh prices* does it for every linked item. *Needs checking* filters to prices older than 30 days; *Prices to review* lets you confirm them quickly.

## Adding another list

1. In Firebase → Authentication, add an email/password user and copy its UID.
2. In `firebase-config.js`, add an entry under `lists` (copy an existing one).
3. In `firestore.rules`, add a line to `isOwnerOf` with the new list id and UID, then publish the rules (Firebase → Firestore Database → Rules).
4. Copy `mic.html` to a new file and change `data-list` and the `<title>`.

## Publishing changes

Changes go live when they are merged into `main` (GitHub Pages). Browsers cache scripts, so hard-refresh (Ctrl+F5) after a deploy.
If you change `firestore.rules` in the repo, you must also paste it into the Firebase console. The site does not do that for you.

## Settings in `firebase-config.js`

- `imageProxy`: the image relay used for resizing and fallbacks. `""` turns it off.
- `imageResize: false`: always load original images instead of resized ones.

## Tests

```
npm install
npm test
```

The tests run the real `script.js` and `admin.js` in a simulated page with a fake database. They do not touch Firebase.

## Good to know

- The Firebase keys in `firebase-config.js` are meant to be public. Never put a service-account key or other secret in this repo.
- Price checking uses free public relay sites, so it can fail or be slow. Prices you type in always win.
