# 🇮🇳 Indian Postcard Printer

### Design. Personalise. Print. — Exact-size Indian Inland Postcards.

A free, open-source, privacy-first application for creating and printing Indian inland postcards at their original physical size of **143 × 93 mm**.

Create beautifully formatted postcards with structured sender and recipient addresses, six-digit PIN boxes, custom typography, an optional back-side image, and precise printer calibration — all directly in your browser.

**No installation dependencies. No cloud. No subscriptions. No data uploads.**

---

## 🚀 Project Status

**Stage 7 — Structured Address Forms & Advanced Printing**

The application currently supports:

- Structured sender and recipient address forms.
- Automatic text wrapping and measured text fitting.
- Editable postcard front and back.
- Optional back-side image editor.
- Address book with CSV import and export.
- Three printing modes.
- Independent front/back calibration.
- JSON settings backup and restore.
- Automated unit, visual and end-to-end testing.

The project is actively developed and welcomes testing, feedback and contributions.

---

## ✨ Features

### 📮 Accurate Indian Postcard Layout

Recreates the design of the Indian 50‑paise inland postcard, inspired by the Atal Bihari Vajpayee and Azadi Ka Amrit Mahotsav 2022 issue.

- Physical postcard dimensions: **143 × 93 mm**.
- Cream/yellow postcard appearance.
- Bilingual heading and stamp artwork.
- Sender and recipient sections.
- Six PIN‑code boxes.
- Four printed address guide lines.
- Decorative artwork and sorting bars.

The application separates the original postcard artwork from editable content, allowing addresses to be modified without disturbing the design.

### ✍️ Smart Address Editor

Enter sender and recipient details using structured fields:

- Name
- House number and street
- Area, village or town
- District and state
- PIN code

Additional capabilities:

- Multi‑line address fields.
- Single‑box address entry mode.
- Direct editing on the postcard preview.
- Automatic word wrapping based on measured text width.
- Five‑line address capacity.
- Automatic text‑fitting assistance.
- Independent font sizes for each address.
- Nine font families.
- Bold, italic and underline formatting.

**Smart text fitting** checks actual rendered text width instead of relying on character counts.

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