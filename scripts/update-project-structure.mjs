import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const documentName = "PROJECT_STRUCTURE.md";
const documentPath = join(root, documentName);
const generatedDirectories = new Set([
  ".next/",
  ".vercel/",
  "build/",
  "coverage/",
  "node_modules/",
  "out/",
  "playwright-report/",
  "test-results/",
]);

function gitFiles(...options) {
  return execFileSync("git", ["ls-files", "-z", ...options], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  }).split("\0").filter(Boolean);
}

function fileTree(paths) {
  const tree = new Map();

  for (const path of paths) {
    let children = tree;
    for (const name of path.match(/[^/]+\/?/g)) {
      const branch = children.get(name) ?? new Map();
      children.set(name, branch);
      children = branch;
    }
  }

  function treeLines(children, indent) {
    const names = [...children.keys()].sort();
    return names.flatMap((name, index) => {
      const last = index === names.length - 1;
      const branch = last ? "└── " : "├── ";
      return [
        indent + branch + JSON.stringify(name).slice(1, -1),
        ...treeLines(children.get(name), indent + (last ? "    " : "│   ")),
      ];
    });
  }

  return ["kandang-pagi/", ...treeLines(tree, "")].join("\n");
}

const deletedPaths = new Set(gitFiles("--deleted"));
const sourcePaths = gitFiles("--cached", "--others", "--exclude-standard")
  .filter((path) => !deletedPaths.has(path));
sourcePaths.push(documentName);

const ignoreOptions = ["--others", "--ignored", "--exclude-standard"];
const collapsed = gitFiles(...ignoreOptions, "--directory")
  .filter((path) => generatedDirectories.has(path));
const ignoredPaths = [
  ...collapsed,
  ...gitFiles(...ignoreOptions, "--", ...collapsed.map((path) => `:(exclude,top,literal)${path}`)),
];

const document = `# Struktur Proyek Kandang Pagi

Dokumen ini mencatat nama berkas dan folder di workspace saat perintah dijalankan. Jalankan \`npm run docs:structure\` dari root proyek setelah menambah, memindahkan, atau menghapus berkas, atau setelah mengubah aturan ignore. Gunakan \`npm run docs:structure -- --check\` untuk memeriksa apakah dokumen sesuai dengan workspace.

| Folder | Isi |
| --- | --- |
| \`app/\` | Halaman, layout, dan route handler Next.js. |
| \`components/\` | Komponen UI bersama dan komponen tiap modul. |
| \`server/\` dan \`lib/\` | Otorisasi, layanan server, validasi, dan perhitungan domain. |
| \`db/\` | Koneksi, skema, dan migrasi Drizzle. |
| \`tests/\` | Uji unit, integrasi, dan end-to-end. |
| \`codex/\` | Spesifikasi, catatan implementasi, laporan tahap, dan panduan rilis. |

## Berkas proyek

Daftar ini mencakup berkas yang dilacak Git dan berkas baru yang belum dilacak. Metadata internal Git disimpan di \`.git/\`.

\`\`\`text
${fileTree(sourcePaths)}
\`\`\`

## Berkas dan folder yang diabaikan Git

Daftar ini mengikuti [aturan \`.gitignore\`](.gitignore) dan aturan ignore lokal Git. Isinya dapat berbeda antar komputer. Direktori dependensi, cache, dan hasil build atau pengujian ditampilkan sebagai direktori. Entri seperti \`.env.local\` hanya mencantumkan nama berkas.

${ignoredPaths.length > 0 ? `\`\`\`text\n${fileTree(ignoredPaths)}\n\`\`\`` : "Workspace ini belum memiliki berkas yang diabaikan Git."}

Jalankan \`git ls-files --others --ignored --exclude-standard\` untuk melihat nama berkas yang diabaikan, termasuk isi direktori yang diringkas. Gunakan \`git check-ignore -v -- .env.local\` untuk melihat sumber aturan yang berlaku pada satu path.
`;

if (process.argv.includes("--check")) {
  if (!existsSync(documentPath) || readFileSync(documentPath, "utf8") !== document) {
    console.error(`Perbarui ${documentName} dengan npm run docs:structure.`);
    process.exitCode = 1;
  } else {
    console.log(`${documentName} sesuai dengan struktur workspace.`);
  }
} else {
  writeFileSync(documentPath, document);
  console.log(`${documentName} diperbarui.`);
}
