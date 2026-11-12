# Bundled font

**LXGW WenKai Regular 1.530 (霞鹜文楷)** is an optional, locally loaded font.
It remains under SIL Open Font License 1.1; see [OFL.txt](OFL.txt) for the complete
original copyright, Reserved Font Names, additional permission and license.
The plugin code's GPL license does not replace the font's OFL license.

## Provenance

- Official repository: https://github.com/lxgw/LxgwWenKai
- Pinned release: https://github.com/lxgw/LxgwWenKai/releases/tag/v1.530
- Release commit: `4becfb4d5cf0c92cfdb60a6e9b504bda43315325`
- Original asset: https://github.com/lxgw/LxgwWenKai/releases/download/v1.530/LXGWWenKai-Regular.ttf
- Original license: https://github.com/lxgw/LxgwWenKai/blob/4becfb4d5cf0c92cfdb60a6e9b504bda43315325/OFL.txt
- Original TTF: 25,928,940 bytes; SHA-256 `2d73eea94ad808999d90c0000c239a84a33b09d4bc6ab6c5b8bbf1eda8a7fc8b`
- Bundled WOFF2: 9,926,680 bytes; SHA-256 `48f405f716f9ce4f0071657cddeda25be9e8686d7cde4b6ee5228fb6bf265ef0`
- Family `LXGW WenKai`, style `Regular`, OS/2 weight 400; 47,336 glyphs,
  46,926 mapped Unicode code points.

## Compression and verification

The original complete font is compressed to WOFF2 with fonttools 4.60.1 and
Brotli 1.2.1. All table preprocessing transforms are disabled. There is no glyph
subsetting, font renaming, metric adjustment, shaping change, or additional
WOFF metadata. Original name/copyright/license metadata is preserved.

Every decompressed SFNT table is checked against the original. The only changes
are the WOFF2-required bit 11 in `head.flags` and the resulting checksum field.
These are container-format bookkeeping, not changes to glyphs or behavior.
See [WOFF2 specification](https://www.w3.org/TR/WOFF2/) and
[OFL FAQ 2.2–2.2.2](https://openfontlicense.org/ofl-faq/).

To reproduce, download the pinned original TTF, create a development Python
environment, install `fonttools[woff]==4.60.1` and `brotli==1.2.1`, then run:

```sh
python scripts/prepare-lxgw-font.py /path/to/LXGWWenKai-Regular.ttf
```

The script verifies the input hash, data preservation, and exact output hash.
The original TTF and Python tools are development inputs and are not bundled.

## Distribution

The normal esbuild step embeds the WOFF2 as a data URL inside `main.js`. Standard
Obsidian updates therefore install the font with their existing three files;
there is no runtime font download, CDN dependency, or extra asset to copy.
The complete original license is also embedded in `main.js` via
`THIRD-PARTY-NOTICES.md` and included separately in the manual-install archive.
The source archive includes this WOFF2, provenance, license and conversion
script. The font is decoded only when the optional font is selected.
