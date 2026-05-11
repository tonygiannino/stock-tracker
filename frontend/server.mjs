import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const dist = join(__dirname, "dist");
const port = parseInt(process.env.PORT) || 3000;

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js":   "text/javascript",
  ".css":  "text/css",
  ".json": "application/json",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
};

createServer((req, res) => {
  // Strip query string
  const url = req.url.split("?")[0];
  let filePath = join(dist, url === "/" ? "index.html" : url);

  // SPA fallback — unknown paths get index.html
  if (!existsSync(filePath)) {
    filePath = join(dist, "index.html");
  }

  const type = mime[extname(filePath)] || "application/octet-stream";
  try {
    res.writeHead(200, { "Content-Type": type });
    res.end(readFileSync(filePath));
  } catch {
    res.writeHead(500);
    res.end("Server error");
  }
}).listen(port, "0.0.0.0", () => {
  console.log(`Listening on http://0.0.0.0:${port}`);
});
