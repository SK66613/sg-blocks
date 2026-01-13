
// scripts/build-manifest.mjs
import { promises as fs } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "blocks");
const OUT = path.join(ROOT, "dist", "blocks");

function utcVer(){
  const d = new Date();
  const pad = (n)=> String(n).padStart(2,"0");
  return `${d.getUTCFullYear()}.${pad(d.getUTCMonth()+1)}.${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}`;
}

async function readJson(p){
  try{ return JSON.parse(await fs.readFile(p, "utf8")); }catch{ return null; }
}
async function ensureDir(p){ await fs.mkdir(p, { recursive:true }); }

async function main(){
  await ensureDir(OUT);
  const entries = (await fs.readdir(SRC, { withFileTypes:true })).filter(e=>e.isDirectory());
  const blocks = [];
  for (const ent of entries){
    const dir = ent.name;
    const bdir = path.join(SRC, dir);
    const files = await fs.readdir(bdir);
    const filemap = {};
    for (const name of ["runtime.js", "view.html", "style.css", "editor.js", "block.json"]){
      if (files.includes(name))
        filemap[name.replace(/\.\w+$/,"")] = `${dir}/${name}`;
    }
    let title = dir, category = "other", tags = [], version = "1.0.0", defaults = {};
    if (files.includes("block.json")){
      const bj = await readJson(path.join(bdir, "block.json")) || {};
      title = bj.title || title;
      category = bj.category || category;
      tags = bj.tags || tags;
      version = bj.version || version;
      defaults = bj.defaults || defaults;
    }
    blocks.push({ key:dir, title, category, tags, version, files:filemap, defaults });
  }
  const manifest = { version: utcVer(), blocks };
  await fs.writeFile(path.join(OUT, "index.json"), JSON.stringify(manifest, null, 2), "utf8");

  // Copy blocks
  for (const ent of entries){
    const dir = ent.name;
    const srcDir = path.join(SRC, dir);
    const dstDir = path.join(OUT, dir);
    await ensureDir(dstDir);
    for (const f of await fs.readdir(srcDir)){
      await fs.copyFile(path.join(srcDir,f), path.join(dstDir,f));
    }
  }
  console.log("Built manifest to dist/blocks/index.json");
}
main().catch(e=>{ console.error(e); process.exit(1); });
