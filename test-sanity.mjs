import { readFileSync } from "fs";
import { resolve } from "path";

console.log("=== Verifying wenyan-web dist build ===");

const distDir = resolve("./dist");

const html = readFileSync(resolve(distDir, "index.html"), "utf-8");
if (!html.includes("root")) {
  throw new Error("Missing #root in dist/index.html");
}
console.log("✓ index.html is valid");

const redirects = readFileSync(resolve(distDir, "_redirects"), "utf-8");
if (!redirects.includes("/index.html")) {
  throw new Error("Missing SPA routing in _redirects");
}
console.log("✓ _redirects SPA routing rule is present");

const headers = readFileSync(resolve(distDir, "_headers"), "utf-8");
if (!headers.includes("Cache-Control")) {
  throw new Error("Missing Cache-Control in _headers");
}
console.log("✓ _headers caching policy is present");

console.log("=== Build integrity check passed successfully! ===");
