import { readFileSync } from 'fs';
import { join } from 'path';
import { parseMessageSummary } from '../parsers/message-summary-parser';

// A fully synthetic `message_summary_info` blob (fabricated from scratch — it
// carries zero real message content) committed alongside the tests so the
// fixture-backed cases always run in CI. Its edit-chain (`ec`) holds three
// obviously-fake edit texts that decode in this exact order.
const FIXTURE_PATH = join(__dirname, 'fixtures', 'edit-summary.sample.bin');
const SAMPLE_EDITED_TEXTS = ['draft one', 'second pass', 'final copy'];

/**
 * Minimal bplist00 encoder for tests. Supports the object kinds we need:
 * boolean, ASCII string, NSData (Buffer), array, and dict (string keys).
 * Objects are serialized depth-first; refs/offsets use 1 byte (fixtures stay
 * small enough that every offset and ref fits in a single byte).
 */
function encodeBplist(root: unknown): Buffer {
  const objects: Buffer[] = [];

  // Returns the index of the encoded object.
  function add(value: unknown): number {
    if (typeof value === 'boolean') {
      objects.push(Buffer.from([value ? 0x09 : 0x08]));
      return objects.length - 1;
    }
    if (typeof value === 'string') {
      const bytes = Buffer.from(value, 'ascii');
      if (bytes.length > 14) throw new Error('test strings must be <=14 ascii chars');
      objects.push(Buffer.concat([Buffer.from([0x50 | bytes.length]), bytes]));
      return objects.length - 1;
    }
    if (Buffer.isBuffer(value)) {
      // NSData: 0x4_ with length nibble (<=14) or 0x4F + int-length marker.
      if (value.length <= 14) {
        objects.push(Buffer.concat([Buffer.from([0x40 | value.length]), value]));
      } else {
        // 0x4F, then a 0x1_ int marker for the length, then the bytes.
        const len = value.length;
        const lenBuf = Buffer.from([0x11, (len >> 8) & 0xff, len & 0xff]); // 2-byte int
        objects.push(Buffer.concat([Buffer.from([0x4f]), lenBuf, value]));
      }
      return objects.length - 1;
    }
    if (Array.isArray(value)) {
      const placeholderIdx = objects.length;
      objects.push(Buffer.alloc(0)); // reserve slot to keep index stable
      const childRefs = value.map((v) => add(v));
      objects[placeholderIdx] = Buffer.concat([
        Buffer.from([0xa0 | value.length]),
        Buffer.from(childRefs),
      ]);
      return placeholderIdx;
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      const placeholderIdx = objects.length;
      objects.push(Buffer.alloc(0));
      const keyRefs = entries.map(([k]) => add(k));
      const valRefs = entries.map(([, v]) => add(v));
      objects[placeholderIdx] = Buffer.concat([
        Buffer.from([0xd0 | entries.length]),
        Buffer.from(keyRefs),
        Buffer.from(valRefs),
      ]);
      return placeholderIdx;
    }
    throw new Error('unsupported test value: ' + String(value));
  }

  const rootIdx = add(root);

  const magic = Buffer.from('bplist00');
  let pos = magic.length;
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(pos);
    pos += obj.length;
  }
  const offsetTableOffset = pos;
  const offsetTable = Buffer.from(offsets); // 1 byte per offset

  const trailer = Buffer.alloc(32, 0);
  trailer[6] = 1; // offsetIntSize
  trailer[7] = 1; // objectRefSize
  trailer.writeBigUInt64BE(BigInt(objects.length), 8);
  trailer.writeBigUInt64BE(BigInt(rootIdx), 16); // top object index
  trailer.writeBigUInt64BE(BigInt(offsetTableOffset), 24);

  return Buffer.concat([magic, ...objects, offsetTable, trailer]);
}

describe('parseMessageSummary', () => {
  it('extracts the ordered edited texts from the synthetic blob', () => {
    const buf = readFileSync(FIXTURE_PATH);
    const out = parseMessageSummary(buf);
    expect(out.editedTexts).toEqual(SAMPLE_EDITED_TEXTS);
    expect(out.unsent).toBe(false);
  });

  it('returns empty + unsent=false for an empty buffer', () => {
    expect(parseMessageSummary(Buffer.alloc(0))).toEqual({ editedTexts: [], unsent: false });
  });

  it('returns unsent=true for a retracted message with no edit history', () => {
    // {ust: true} with no `ec` key — the canonical retraction shape.
    const bplist = encodeBplist({ ust: true });
    const out = parseMessageSummary(bplist);
    expect(out.editedTexts).toEqual([]);
    expect(out.unsent).toBe(true);
  });

  it('honors a non-zero topObject in the trailer (root is not object 0)', () => {
    // Hand-build a bplist whose root dict is the LAST object, not object 0, to
    // lock in that the parser reads topObject from the trailer rather than
    // assuming index 0. Layout: [string "ust", bool true, dict{ust:true}].
    const objects: Buffer[] = [
      Buffer.from([0x53, 0x75, 0x73, 0x74]), // 0: ASCII "ust"
      Buffer.from([0x09]), // 1: true
      Buffer.from([0xd1, 0x00, 0x01]), // 2: dict, keyRef=0 ("ust"), valRef=1 (true)
    ];
    const rootIdx = 2;

    const magic = Buffer.from('bplist00');
    let pos = magic.length;
    const offsets: number[] = [];
    for (const obj of objects) {
      offsets.push(pos);
      pos += obj.length;
    }
    const offsetTableOffset = pos;
    const offsetTable = Buffer.from(offsets);

    const trailer = Buffer.alloc(32, 0);
    trailer[6] = 1; // offsetIntSize
    trailer[7] = 1; // objectRefSize
    trailer.writeBigUInt64BE(BigInt(objects.length), 8);
    trailer.writeBigUInt64BE(BigInt(rootIdx), 16); // non-zero top object
    trailer.writeBigUInt64BE(BigInt(offsetTableOffset), 24);

    const bplist = Buffer.concat([magic, ...objects, offsetTable, trailer]);
    const out = parseMessageSummary(bplist);
    expect(out).toEqual({ editedTexts: [], unsent: true });
  });

  it('returns unsent=false when an ec key is present but entries do not decode', () => {
    // An edit chain exists (`ec` present) but the `t` payload is junk that the
    // typedstream parser yields nothing from. This must NOT be read as a
    // retraction — absence of `ec`, not empty editedTexts, defines unsent.
    const bplist = encodeBplist({
      ust: true,
      ec: { '0': [{ t: Buffer.from([0x00, 0x01, 0x02]) }] },
    });
    const out = parseMessageSummary(bplist);
    expect(out.unsent).toBe(false);
  });

  it('keeps a single-character edited text', () => {
    // A one-character edit ("k") is a valid revision and must survive the
    // text-length threshold.
    const tBlob = Buffer.concat([
      Buffer.from('NSString'),
      Buffer.from([0x01, 0x94, 0x84, 0x01, 0x2b]),
      Buffer.from([1]),
      Buffer.from('k', 'utf8'),
    ]);
    const bplist = encodeBplist({
      ust: true,
      ec: { '0': [{ t: tBlob }] },
    });
    const out = parseMessageSummary(bplist);
    expect(out.editedTexts).toEqual(['k']);
    expect(out.unsent).toBe(false);
  });

  it('decodes each synthetic editedText to its exact known value', () => {
    const buf = readFileSync(FIXTURE_PATH);
    const out = parseMessageSummary(buf);
    expect(out.editedTexts).toHaveLength(SAMPLE_EDITED_TEXTS.length);
    out.editedTexts.forEach((text, i) => {
      expect(text).toBe(SAMPLE_EDITED_TEXTS[i]);
    });
  });
});
