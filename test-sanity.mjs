import { readFileSync } from "fs";

console.log("=== Verifying wenyan-web dist build ===");

const html = readFileSync("C:/Users/Yu_233/.gemini/antigravity/scratch/wenyan-web/dist/index.html", "utf-8");
if (!html.includes("root")) {
  throw new Error("Missing #root in dist/index.html");
}
console.log("✓ index.html is valid");

const redirects = readFileSync("C:/Users/Yu_233/.gemini/antigravity/scratch/wenyan-web/dist/_redirects", "utf-8");
if (!redirects.includes("/index.html")) {
  throw new Error("Missing SPA routing in _redirects");
}
console.log("✓ _redirects SPA routing rule is present");

const headers = readFileSync("C:/Users/Yu_233/.gemini/antigravity/scratch/wenyan-web/dist/_headers", "utf-8");
if (!headers.includes("Cache-Control")) {
  throw new Error("Missing Cache-Control in _headers");
}
console.log("✓ _headers caching policy is present");

console.log("=== Build integrity check passed successfully! ===");
