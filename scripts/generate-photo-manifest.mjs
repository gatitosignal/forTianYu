import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const photosDir = resolve(projectRoot, "public", "photos");
const metaPath = resolve(projectRoot, "src", "data", "photo-meta.json");
const outputPath = resolve(projectRoot, "src", "generated", "photo-manifest.json");
const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const naturalSort = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

await mkdir(photosDir, { recursive: true });
const meta = await readJson(metaPath, {});
const filenames = (await readdir(photosDir, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && supportedExtensions.has(extname(entry.name).toLowerCase()))
  .map((entry) => entry.name)
  .sort(naturalSort.compare);

const photos = filenames.map((filename, index) => {
  const details = meta[filename] ?? {};
  return {
    id: `photo-${String(index + 1).padStart(3, "0")}`,
    order: index + 1,
    filename,
    src: `photos/${encodeURIComponent(filename)}`,
    title: details.title || `回忆 ${String(index + 1).padStart(2, "0")}`,
    caption: details.caption || "",
    date: details.date || "",
    alt: details.alt || details.title || `第 ${index + 1} 张回忆照片`,
  };
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(photos, null, 2)}\n`, "utf8");
console.log(`[photos] 已生成 ${photos.length} 张照片的清单：${outputPath}`);
