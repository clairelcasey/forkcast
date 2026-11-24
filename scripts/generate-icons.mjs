// Renders the placeholder app icon to PNGs. Run: node scripts/generate-icons.mjs
// Uses the Playwright/Chromium install if available; icons are committed, so
// this only needs to run when the design changes.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const svg = (size, padding) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#171717"/>
  <g transform="translate(${padding} ${padding}) scale(${(100 - 2 * padding) / 100})"
     fill="none" stroke="#fafafa" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M36 18v26a10 10 0 0 0 20 0V18"/>
    <path d="M46 18v64"/>
    <path d="M70 18c-6 6-8 16-8 26 0 5 3 8 8 8v30"/>
  </g>
</svg>`;

const targets = [
  ["public/icons/icon-192.png", 192, 8],
  ["public/icons/icon-512.png", 512, 8],
  ["public/icons/icon-maskable-512.png", 512, 20],
  ["src/app/apple-icon.png", 180, 10],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, size, padding] of targets) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0">${svg(size, padding)}</body></html>`,
  );
  await page.locator("svg").screenshot({ path: file });
  console.log("wrote", file);
}
await browser.close();
