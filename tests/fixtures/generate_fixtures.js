import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function buildZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, "utf8");
    const dataBuf = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, "utf8");
    const crc = zlib.crc32(dataBuf);
    const uncompressedSize = dataBuf.length;
    let compData = dataBuf;
    let method = 0;
    if (f.compress) {
      compData = zlib.deflateRawSync(dataBuf);
      method = 8;
    }
    const compSize = compData.length;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(compSize, 18);
    lh.writeUInt32LE(uncompressedSize, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    localHeaders.push(lh, nameBuf, compData);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(compSize, 20);
    ch.writeUInt32LE(uncompressedSize, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centralHeaders.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + compData.length;
  }

  const centralDirBuf = Buffer.concat(centralHeaders);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, centralDirBuf, eocd]);
}

export function generateAllFixtures(targetDir = __dirname) {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 1. sample_valid.txt
  const validText = `Chapitre Premier : L'Aventure Commence

La petite ville de Verrières peut passer pour une des plus jolies de la Franche-Comté. Ses maisons blanches avec leurs toits pointus de tuiles rouges s'étendent sur la pente d'une colline, dont des touffes de vigoureux châtaigniers marquent les moindres sinuosités. Le Doubs coule à quelques centaines de pieds au-dessous de ses fortifications.

« Bonjour mon cher ami ! » s'écria Julien en entrant dans la pièce. Est-ce que tout va bien aujourd'hui ? Oui, certainement ; tout semble parfait à 100%.

Chapitre Deuxième : Les Confidences

Le voyage continuait à travers les forêts silencieuses. L'air était frais, revigorant et pur. Chaque pas résonnait doucement sur le sol tapissé de feuilles mortes d'automne.`;
  fs.writeFileSync(path.join(targetDir, "sample_valid.txt"), validText, "utf8");

  // 2. sample_empty.txt (0 bytes)
  fs.writeFileSync(path.join(targetDir, "sample_empty.txt"), "", "utf8");

  // 3. sample_short.txt (< 3 words)
  fs.writeFileSync(path.join(targetDir, "sample_short.txt"), "Bonjour monde", "utf8");

  // 4. sample_xss.txt
  const xssText = `<script>alert('XSS-TEXT')</script>
<img src=x onerror="alert(1)">
Voici un paragraphe légitime contenant du texte avec <b onmouseover="alert('hover')">balises HTML</b> malicieuses.`;
  fs.writeFileSync(path.join(targetDir, "sample_xss.txt"), xssText, "utf8");

  // 5. sample_valid_epub3.epub
  const epub3Files = [
    { name: "mimetype", data: "application/epub+zip", compress: false },
    {
      name: "META-INF/container.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
      compress: false
    },
    {
      name: "EPUB/package.opf",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">urn:uuid:12345-rsvp-test</dc:identifier>
    <dc:title>Le Rouge et le Noir (Édition Test)</dc:title>
    <dc:creator>Stendhal</dc:creator>
    <dc:language>fr</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="chapter2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="chapter1"/>
    <itemref idref="chapter2"/>
  </spine>
</package>`,
      compress: true
    },
    {
      name: "EPUB/nav.xhtml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Sommaire</title></head>
<body>
  <nav epub:type="toc">
    <h1>Table des Matières</h1>
    <ol>
      <li><a href="ch1.xhtml">Chapitre 1 : Une petite ville</a></li>
      <li><a href="ch2.xhtml">Chapitre 2 : Un maire</a></li>
    </ol>
  </nav>
</body>
</html>`,
      compress: true
    },
    {
      name: "EPUB/ch1.xhtml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Une petite ville</title></head>
<body>
  <h1>Une petite ville</h1>
  <p>La petite ville de Verrières peut passer pour une des plus jolies de la Franche-Comté.</p>
  <p>Ses maisons blanches aux toits de tuiles rouges dominent la vallée verdoyante.</p>
</body>
</html>`,
      compress: true
    },
    {
      name: "EPUB/ch2.xhtml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Un maire</title></head>
<body>
  <h1>Un maire</h1>
  <p>Monsieur de Rênal était un homme grave et cérémonieux qui inspirait le respect général.</p>
</body>
</html>`,
      compress: true
    }
  ];
  fs.writeFileSync(path.join(targetDir, "sample_valid_epub3.epub"), buildZip(epub3Files));

  // 6. sample_valid_epub2.epub
  const epub2Files = [
    { name: "mimetype", data: "application/epub+zip", compress: false },
    {
      name: "META-INF/container.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
      compress: false
    },
    {
      name: "OEBPS/content.opf",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">urn:uuid:67890-epub2</dc:identifier>
    <dc:title>Candide ou l'Optimisme</dc:title>
    <dc:creator>Voltaire</dc:creator>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="chap1" href="chapter1.html" media-type="application/xhtml+xml"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="chap1"/>
  </spine>
</package>`,
      compress: true
    },
    {
      name: "OEBPS/toc.ncx",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="nav1" playOrder="1">
      <navLabel><text>Chapitre Premier : Candide au château</text></navLabel>
      <content src="chapter1.html"/>
    </navPoint>
  </navMap>
</ncx>`,
      compress: true
    },
    {
      name: "OEBPS/chapter1.html",
      data: `<!DOCTYPE html>
<html>
<head><title>Chapitre Premier : Candide au château</title></head>
<body>
  <h1>Chapitre Premier : Candide au château</h1>
  <p>Il y avait en Westphalie, dans le château de monsieur le baron de Thunder-ten-tronckh, un jeune garçon à qui la nature avait donné les mœurs les plus douces.</p>
</body>
</html>`,
      compress: true
    }
  ];
  fs.writeFileSync(path.join(targetDir, "sample_valid_epub2.epub"), buildZip(epub2Files));

  // 7. sample_xss_epub.epub
  const xssEpubFiles = [
    { name: "mimetype", data: "application/epub+zip", compress: false },
    {
      name: "META-INF/container.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`,
      compress: false
    },
    {
      name: "OEBPS/content.opf",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>&lt;script&gt;alert('XSS-TITLE')&lt;/script&gt;Livre Dangereux</dc:title>
    <dc:creator>&lt;img src=x onerror=alert('XSS-AUTHOR')&gt;Hacker</dc:creator>
  </metadata>
  <manifest>
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
  </spine>
</package>`,
      compress: true
    },
    {
      name: "OEBPS/c1.xhtml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>&lt;script&gt;alert(1)&lt;/script&gt;Titre XSS</title></head>
<body>
  <h1>&lt;script&gt;alert(2)&lt;/script&gt;Chapitre XSS</h1>
  <script>window.__xss_executed = true;</script>
  <svg onload="alert('svg-xss')"></svg>
  <style>body { background: red; }</style>
  <p>Texte régulier avec <a href="javascript:alert(3)">lien malveillant</a> et du contenu lisible.</p>
</body>
</html>`,
      compress: true
    }
  ];
  fs.writeFileSync(path.join(targetDir, "sample_xss_epub.epub"), buildZip(xssEpubFiles));

  // 8. sample_zipslip_epub.epub
  const zipslipFiles = [
    { name: "mimetype", data: "application/epub+zip", compress: false },
    {
      name: "META-INF/container.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
      compress: false
    },
    {
      name: "content.opf",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <manifest><item id="c1" href="../../evil_path_traversal.txt" media-type="text/plain"/></manifest>
  <spine><itemref idref="c1"/></spine>
</package>`,
      compress: false
    },
    {
      name: "../../../../evil_path_traversal.txt",
      data: "MALICIOUS OVERWRITE CONTENT",
      compress: false
    }
  ];
  fs.writeFileSync(path.join(targetDir, "sample_zipslip_epub.epub"), buildZip(zipslipFiles));

  // 9. sample_invalid_magic.epub
  fs.writeFileSync(path.join(targetDir, "sample_invalid_magic.epub"), Buffer.from("NOT_A_ZIP_MAGIC_BYTES_1234567890"), "utf8");

  // 10. sample_empty_chapters.epub (< 3 words per chapter)
  const emptyChapterFiles = [
    { name: "mimetype", data: "application/epub+zip", compress: false },
    {
      name: "META-INF/container.xml",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
      compress: false
    },
    {
      name: "content.opf",
      data: `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Livre Vide</dc:title></metadata>
  <manifest><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest>
  <spine><itemref idref="c1"/></spine>
</package>`,
      compress: false
    },
    {
      name: "c1.xhtml",
      data: `<html><body><p>Deux mots</p></body></html>`,
      compress: false
    }
  ];
  fs.writeFileSync(path.join(targetDir, "sample_empty_chapters.epub"), buildZip(emptyChapterFiles));

  // 11. sample_zipbomb.epub (high compression ratio simulation with repeated zero buffer)
  const zeroBuf = Buffer.alloc(10 * 1024 * 1024); // 10MB of zeroes
  const bombFiles = [
    { name: "mimetype", data: "application/epub+zip", compress: false },
    {
      name: "META-INF/container.xml",
      data: `<?xml version="1.0"?><container version="1.0"><rootfiles><rootfile full-path="content.opf"/></rootfiles></container>`,
      compress: false
    },
    { name: "bomb.bin", data: zeroBuf, compress: true }
  ];
  fs.writeFileSync(path.join(targetDir, "sample_zipbomb.epub"), buildZip(bombFiles));
}

// Auto-run if executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  generateAllFixtures();
  console.log("All test fixtures generated successfully in tests/fixtures/");
}
