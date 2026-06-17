# Roster Pro — In-House Labour Allocation

A local web application for packaging supervisors to build rosters, assign staff, and track production schedules. **No backend required** — all data is stored in your browser.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:5173 — no login needed.

## How It Works

1. **Add production jobs** on the Schedule page (manual entry or screenshot OCR)
2. **Assign employees** on the Assignments page
3. **View the roster** on the Roster Board
4. **Reset when done** using the sidebar buttons

## AI Schedule Import (Free)

One photo imports **all** production jobs using **Google Gemini** (free tier, no credit card):

1. Go to [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → Create API key (free)
2. **Administration → AI Settings** → paste key and save
3. **Production Schedule** → **Import Schedule (AI)** → photo → review → import all

## Reset Options

| Button | What it clears |
|--------|----------------|
| **Reset Roster** | Production jobs and shift assignments (keeps employees & settings) |
| **Reset Everything** | Full factory reset to defaults |

Both buttons are in the sidebar at the bottom.

## Tech Stack

- React + TypeScript + Tailwind CSS
- Local browser storage (localStorage)
- Tesseract.js for OCR screenshot import
- Excel/PDF report export

## Build for In-House Use

```bash
npm run build
```

Deploy the `dist/` folder to any internal web server, or open locally with `npm run preview`.

## Default Setup

- **Shifts:** Night (12am–8am), Day (8am–4pm), Afternoon (4pm–12am)
- **Lines:** Bottling 1 & 2, Canning 1 & 2, Kegging
- **Employees:** 8 sample staff with skills pre-loaded

All configurable under **Administration**.
