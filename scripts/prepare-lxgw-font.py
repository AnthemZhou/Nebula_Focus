"""Compress the pinned original font without subsetting or table transforms.

Development-only: pip install 'fonttools[woff]==4.60.1' 'brotli==1.2.1'
Usage: python scripts/prepare-lxgw-font.py /path/to/LXGWWenKai-Regular.ttf
The ordinary plugin build uses the checked-in WOFF2 and needs no Python tools.
"""
from pathlib import Path
import hashlib
import sys

from fontTools.ttLib import TTFont, woff2

ROOT = Path(__file__).resolve().parent.parent
INPUT_SHA = '2d73eea94ad808999d90c0000c239a84a33b09d4bc6ab6c5b8bbf1eda8a7fc8b'
OUTPUT_SHA = '48f405f716f9ce4f0071657cddeda25be9e8686d7cde4b6ee5228fb6bf265ef0'

if len(sys.argv) != 2:
    raise SystemExit('Provide the official v1.530 LXGWWenKai-Regular.ttf path.')
source = Path(sys.argv[1])
if hashlib.sha256(source.read_bytes()).hexdigest() != INPUT_SHA:
    raise SystemExit('Input does not match the pinned official v1.530 font.')
destination = ROOT / 'assets/fonts/LXGWWenKai-Regular.woff2'
woff2.compress(str(source), str(destination), transform_tables=set())

# Raw SFNT data must remain equal. WOFF2 itself requires the lossless-transform
# bit in head.flags, and the container checksum changes with it; no other table
# bytes may change. This verifies metadata, cmap, outlines and shaping together.
with TTFont(source, lazy=True) as original, TTFont(destination, lazy=True) as packed:
    assert set(original.reader.keys()) == set(packed.reader.keys())
    assert not packed.flavorData.metaData and not packed.flavorData.privData
    assert not packed.flavorData.transformedTables
    for tag in original.reader.keys():
        before, after = original.reader[tag], packed.reader[tag]
        if tag == 'head':
            expected_flags = int.from_bytes(before[16:18], 'big') | (1 << 11)
            assert int.from_bytes(after[16:18], 'big') == expected_flags
            before = before[:8] + b'\0' * 4 + before[12:16] + b'\0' * 2 + before[18:]
            after = after[:8] + b'\0' * 4 + after[12:16] + b'\0' * 2 + after[18:]
        assert before == after, f'Font data changed in table {tag}'
    assert original.getBestCmap() == packed.getBestCmap()
    assert original['maxp'].numGlyphs == packed['maxp'].numGlyphs == 47336

digest = hashlib.sha256(destination.read_bytes()).hexdigest()
if digest != OUTPUT_SHA:
    raise SystemExit(f'Compression output differs; verify pinned tool versions: {digest}')
print(f'Verified complete font: {destination.name}, {destination.stat().st_size} bytes, {digest}')
