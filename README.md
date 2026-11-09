# 🇮🇳 Indian Postcard Printer

### Design. Personalise. Print. — Exact-size Indian Inland Postcards.

A free, open-source, privacy-first application for creating and printing Indian inland postcards at their original physical size of **143 × 93 mm**.

Create beautifully formatted postcards with structured sender and recipient addresses, six-digit PIN boxes, custom typography, an optional back-side image, and precise printer calibration — all directly in your browser.

**No installation dependencies. No cloud. No subscriptions. No data uploads.**

---

A small, free, open-source Windows utility for composing an Indian inland
postcard (143 × 93 mm): front (addresses + PIN) and back (blank message
side, optional image), with direct exact-size printing.

**Current status: Stage 7** — structured address forms with measured text
fitting, an optional back-side image editor, correct Front / Back /
Front-and-Back print page selection, and the text-only overlay +
calibration sheet from Stage 5.

## Table of Contents

- [Features](#features)
- [Screenshots](#screenshots)
- [Getting Started](#getting-started)
- [Usage](#usage)
- [Printing](#printing)
- [How It Works](#how-it-works)
- [Settings and Privacy](#settings-and-privacy)
- [Tests](#tests)
- [Project Structure](#project-structure)
- [Layout Specification](#layout-specification)
- [Calibration](#calibration)
- [Known Limitations](#known-limitations)
- [License](#license)

## Features

- **Faithful card design** — reproduces the yellow 50 paise inland postcard
  (Atal Bihari Vajpayee, AKAM "Azadi ka Amrit Mahotsav" 2022 issue) with
  cream paper, dark teal ink, bilingual heading, stamp, AKAM logo, sorter
  bars and four printed ruled address lines.
- **Structured address forms** — Name, House no. & street, Area / village /
  town, District & state plus PIN for both sender and recipient. Every
  field accepts multiple lines; empty optional fields are omitted and
  labels never print.
- **Smart text fitting** — words wrap to the measured 57 mm width (never a
  character count), words are never cut in half, and the five-line limit is
  enforced with a visible status: **Fits**, **Too many lines**, **Line too
  wide** or **Outside printable area**. A **Fit text** action picks the
  largest size in 6–20 pt that fits and tells you what it changed.
- **Nine card fonts** with bold / italic / underline, per-address font
  sizes, and calibration offsets per side.
- **Address book** — save senders and recipients; a saved contact stores
  exactly what the card shows, so loading it back reproduces the same card.
  CSV import/export with duplicate and PIN validation warnings. The CSV
  columns are `Contact,Name,House,Building,Street,Area,City,District,State,PIN`
  (`Contact` is the display name); a header row is recommended and its order
  may vary, a headerless file in the nine field columns also imports, quotes
  and line breaks inside values are supported, and export adds a UTF-8 BOM.
- **Back-side image** — upload PNG/JPEG/WebP and control position, size
  (aspect ratio locked), rotation and crop. Images stay in the browser
  session only; pixel data is never saved or uploaded.
- **Three print modes** — text overlay, full card at exact 143 × 93 mm, or
  a calibration sheet.
- **100 % local** — no network requests, no external services, no
  analytics. Everything lives in your browser's `localStorage`.

## Screenshots

| Front card | Full preview |
| --- | --- |
| ![Front of the postcard with addresses and PIN boxes](tests/postcard.png) | ![Full application preview](tests/preview-full.png) |

The application reports whether an address fits, is too wide, contains too many lines or extends outside the printable area.

### 📖 Address Book

Save frequently used sender and recipient addresses.

- Save and load contacts.
- Edit and delete saved contacts.
- CSV import and export.
- Duplicate‑contact warnings.
- PIN validation.
- CSV parsing with quoted fields and embedded line breaks.
- Exact address round‑tripping.

Exported CSV files include a UTF‑8 BOM for improved spreadsheet compatibility.

### 🖼️ Back‑Side Image Editor

Personalise the reverse side of your postcard with an optional image.

Supported formats:

- PNG
- JPEG
- WebP

Image editing controls:

- X/Y positioning in millimetres.
- Width and height adjustment.
- Aspect‑ratio locking.
- Rotation.
- Crop percentages.
- Printable‑area clipping warnings.

Images are rendered on a high‑resolution canvas.

**Important:** Uploaded image pixels remain in the current browser session. They are never saved to localStorage, exported or uploaded.

### 🖨️ Three Printing Modes

Choose the printing method that suits your requirements.

| Mode | Purpose |
| --- | --- |
| **Text Overlay** | Print only addresses, PIN digits, message and optional image |
| **Full Card** | Print the complete postcard design at 143 × 93 mm |
| **Calibration Sheet** | Verify physical printer measurements and alignment |

Printing options:

- Front only.
- Back only.
- Front and Back.
- Independent calibration offsets for each side.
- Actual‑size printing without application‑level scaling.

### 🎯 Printer Calibration

Fine‑tune the position of editable postcard content using independent horizontal and vertical offsets.

- X‑axis adjustment.
- Y‑axis adjustment.
- Separate front and back calibration.
- Live calibration preview.
- Persistent calibration settings.
- Reset offsets to zero.

A calibration sheet provides:

- 100 mm horizontal reference line.
- 50 mm vertical reference line.
- 143 × 93 mm postcard outline.

This helps identify printer scaling and alignment problems before printing on actual postcard stock.

### 💾 Settings and Backup

Your application settings stay in your browser.

- Save settings locally.
- Export settings as JSON.
- Import previously exported settings.
- Restore defaults.
- Clear saved application data.

No database or external storage service is required.

---

## 📸 Screenshots

Screenshots are included in the repository to demonstrate the application and its printing workflow.

| Screenshot | Description |
| --- | --- |
| **Front Card** | Postcard front with sender and recipient sections |
| **Full Preview** | Complete application preview |
| **Text Overlay** | Text‑only printing output |
| **Calibration Sheet** | Printer measurement reference |
| **Filled Postcard** | Example with completed addresses |
| **Back Side** | Reverse side with optional image |
| **Address Book** | Saved contact management |

_Replace these descriptions with actual GitHub‑hosted screenshot images when adding them to the repository._

---

## 💻 Getting Started

### Requirements

- Windows 10 or Windows 11.
- Microsoft Edge or Google Chrome.
- Node .js (only required for the local development server and tests).

The application uses:

- HTML
- CSS
- Vanilla JavaScript
- Node.js built‑in HTTP module

There are no production dependencies, no build tools and no framework installation.

### Option 1: Quick Installation

1. Download or clone this repository.
2. Open the project folder.
3. Double‑click:

   `INSTALL_POSTCARD_PRINTER.bat`

4. Follow the instructions displayed by the setup script.
5. Start the application using:

   `START_POSTCARD_PRINTER.bat`

The repository also includes an optional all‑in‑one CMD setup guide.

### Option 2: Manual Installation

Clone the repository:

```bash
git clone https://github.com/SR71BlackbirdX/postcard-printer-.git
```

Navigate into the project:

```bash
cd postcard-printer-
```

Start the local server:

```bash
node server.js
```

Open your browser and visit:

```text
http://127.0.0.1:5173/
```

That's it!

No `npm install` is required.

### Running Without the Server

You can also double‑click `index.html` to open the application directly in Edge or Chrome.

The local server is recommended for development and browser testing.

---

## 📝 How to Use

The application has three main sections.

### 1. Front

- Enter sender information.
- Enter recipient information.
- Add the six‑digit recipient PIN.
- Select fonts and formatting.
- Adjust text size.
- Use **Fit Text** to automatically find a suitable font size.
- Fine‑tune positioning using calibration controls.

You can also click directly on an address in the postcard preview and edit it.

### 2. Back

- Add an optional message.
- Choose a message template.
- Upload an optional image.
- Adjust image size, position, rotation and cropping.
- Configure message typography and spacing.

The reverse side remains blank cream paper when no content is added.

### 3. Print

Select:

- Side to print: Front, Back or Front and Back.
- Print mode: Text Overlay, Full Card or Calibration Sheet.

Review the preview and print using the appropriate printer settings.

---

## 🖨️ Printing Guide

For accurate physical dimensions, printer configuration is important.

### Required Paper Size

Create a custom paper size in Windows printer preferences:

| Setting | Value |
| --- | --- |
| Width | 143 mm |
| Height | 93 mm |
| Orientation | Landscape |
| Paper name | Postcard 143×93 |

Typical Windows navigation:

Settings → Bluetooth & devices → Printers & scanners → Your printer → Printing preferences.

Find the custom paper‑size option and create the new page type.

### Recommended Print Settings

| Setting | Recommendation |
| --- | --- |
| Paper Size | Postcard 143×93 |
| Orientation | Landscape |
| Scaling | 100 % / Actual Size |
| Fit to Page | Disabled |
| Background Graphics | Enabled for Full Card |
| Margins | 0 for Full Card |

The exact setting names depend on the printer driver.

### Printing Both Sides

The Front and Back option creates two separate pages.

For ordinary printers:

1. Print the front.
2. Reinsert the postcard manually.
3. Print the back.

Automatic duplex printing depends on printer and driver support and should be tested separately.

### Calibration Before Printing

Before using actual postcard stock, print the calibration sheet on ordinary paper.

Measure:

- The 100 mm horizontal line.
- The 50 mm vertical line.
- The 143 × 93 mm rectangle.

If the measurements are incorrect, check the printer's custom paper size, orientation, margins and scaling settings.

**Important:** CSS can request exact dimensions, but it cannot override physical printer margins or prevent printer‑driver scaling.

---

## ⚙️ How It Works

The postcard is constructed using three independent layers:

| Layer | Responsibility |
| --- | --- |
| `.card‑artwork` | Original postcard design |
| `.card‑content` | Editable addresses and PIN digits |
| `.card‑guides` | Optional calibration guides and rulers |

All physical measurements are maintained centrally in:

`js/layout.js`

This provides a single source of truth for the postcard's dimensions and layout.

### Technology Stack

- HTML5
- CSS3
- Vanilla JavaScript
- Node.js built‑in HTTP server
- Browser localStorage
- Canvas API
- Playwright for optional browser testing

### Physical Measurement System

The postcard uses CSS millimetre units.

The standard CSS conversion is:

```text
1 mm = 96 / 25.4 CSS pixels
```

The preview uses CSS transforms for screen scaling without changing the underlying physical dimensions.

---

## 🔐 Privacy & Security

Privacy is a core design principle.

**The application runs locally on your computer.**

- No cloud storage.
- No external APIs.
- No analytics.
- No tracking.
- No account registration.
- No address uploads.
- No image uploads.

### What Is Stored?

| Data | Storage |
| --- | --- |
| Sender and recipient addresses | Browser localStorage |
| Saved contacts | Browser localStorage |
| Fonts and formatting | Browser localStorage |
| Calibration offsets | Browser localStorage |
| Message templates | Browser localStorage |
| Image placement settings | Browser localStorage |
| Uploaded image pixels | Current browser session only |

Exported JSON settings contain placement settings but never uploaded image pixels.

For security information, see **SECURITY.md**.

---

## 🧪 Testing

The project includes automated unit, visual and end‑to‑end tests.

The documented test suite currently reports:

<details>
<summary><strong>569 checks across the listed test suites — 0 failures</strong></summary>

| Test Suite | Checks | Browser Required |
| --- | --- | --- |
| `layout.test.js` | 42 | No |
| `address.test.js` | 37 | No |
| `html.smoke.test.js` | 18 | No |
| `addressbook.test.js` | 103 | No |
| `preview.visual.test.js` | 197 | Yes |
| `e2e.test.js` | 91 | Yes |
| `addressbook.e2e.test.js` | 67 | Yes |
| `edge.e2e.test.js` | 14 | Yes |
| **Total** | **569** |  |

The tests cover:

- Postcard dimensions and layout geometry.
- Address wrapping and text fitting.
- PIN‑box alignment.
- Address‑book operations.
- CSV import and export.
- Settings persistence.
- Image editing.
- Printing modes.
- Calibration offsets.
- Browser workflows.
- Invalid uploads and corrupted settings.
- HTML and Unicode injection handling.
- Failure‑path behaviour.

</details>

### Run Basic Tests

Node.js is required.

```bash
node --check server.js
node tests/layout.test.js
node tests/address.test.js
node tests/html.smoke.test.js
node tests/addressbook.test.js
```

### Run Browser Tests

Playwright is optional and required only for browser‑based suites.

Install it globally:

```bash
npm install -g playwright
```

The browser suites use the already‑installed Microsoft Edge through Playwright's `msedge` channel.

Run the suites individually:

```bash
node tests/preview.visual.test.js
node tests/e2e.test.js
node tests/addressbook.e2e.test.js
node tests/edge.e2e.test.js
```

Each browser suite starts its own server. Run them one at a time.

---

## 📂 Project Structure

```text
postcard-printer/
│
├── index.html
├── server.js
│
├── css/
│   └── style.css
│
├── js/
│   ├── layout.js
│   ├── settings.js
│   ├── address.js
│   ├── addressbook.js
│   ├── preview.js
│   └── app.js
│
├── tests/
│   ├── layout.test.js
│   ├── address.test.js
│   ├── html.smoke.test.js
│   ├── addressbook.test.js
│   ├── preview.visual.test.js
│   ├── e2e.test.js
│   ├── addressbook.e2e.test.js
│   └── edge.e2e.test.js
│
├── INSTALL_POSTCARD_PRINTER.bat
├── START_POSTCARD_PRINTER.bat
├── ALL-IN-ONE SETUP CMD.txt
│
├── README.md
└── SECURITY.md
```

---

## 📐 Layout Specification

All physical measurements are defined in `js/layout.js`.

| Component | Measurement |
| --- | --- |
| Postcard width | 143 mm |
| Postcard height | 93 mm |
| Sender section | 74 mm |
| Recipient section | 69 mm |
| Divider position | 74 mm |
| Default font size | 13 pt |
| Adjustable font range | 6–20 pt |
| Recipient address capacity | 5 lines |
| Printed address rules | 4 |
| Recipient left margin | 6 mm |
| Recipient right margin | 6 mm |
| PIN boxes | 6 |
| Individual PIN box | 8 × 6 mm |
| PIN row width | 48 mm |
| PIN row top | 62 mm |

Some artwork and sender‑position measurements remain provisional and are documented in the source code.

---

## ⚠️ Known Limitations

- Printer hardware margins cannot be controlled through CSS.
- Printer drivers may introduce scaling.
- Artwork positions are approximations based on postcard photographs.
- The stamp portrait is a generic silhouette, not official artwork.
- Sender coordinates are provisional until measured against physical stock.
- PIN digit sizing is configurable and provisional.
- A fifth recipient line is supported but has no corresponding printed rule.
- Uploaded images must be re‑uploaded after reopening the application.
- Automatic duplex printing is not guaranteed.
- Browser zoom changes the apparent screen size, not the underlying millimetre measurements.

The project prioritises measured address and PIN geometry over artwork approximation.

---

## 🛠️ Development & Contributions

Contributions, bug reports, testing feedback and improvement suggestions are welcome.

If you find an issue:

1. Check the existing GitHub Issues.
2. Include your Windows version and browser.
3. Describe the steps needed to reproduce the problem.
4. Include screenshots or calibration measurements when relevant.

Please avoid including real personal addresses or PIN codes in public bug reports.

---

## 📜 License

Free and open‑source.

Use, study, modify and improve the application freely.

---

## ❤️ Acknowledgements

Created as a small utility to make designing and printing Indian inland postcards easier, more accurate and more accessible.

Built with a focus on simplicity, precision, local operation and user privacy.

**Made for the simple joy of sending a postcard. 🇮🇳**

---

<p align="center">

**Indian Postcard Printer**

_Your address. Your postcard. Your printer._

</p>