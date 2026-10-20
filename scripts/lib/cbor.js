// Minimal CBOR decoder (maps, arrays, integers, strings, floats, simple
// values): enough for the price database Auctionator saves
// (C_EncodingUtil.SerializeCBOR).
function decode(buf) {
  let i = 0;
  const u = n => { let v = 0; for (let k = 0; k < n; k++) v = v * 256 + buf[i++]; return v; };
  function arg(ai) {
    if (ai < 24) return ai;
    if (ai === 24) return u(1);
    if (ai === 25) return u(2);
    if (ai === 26) return u(4);
    if (ai === 27) return u(8);
    throw new Error('CBOR: indefinite lengths are not supported');
  }
  function item() {
    const b = buf[i++];
    const mt = b >> 5;
    const ai = b & 31;
    if (mt === 7) {
      if (ai === 20) return false;
      if (ai === 21) return true;
      if (ai === 22 || ai === 23) return null;
      if (ai === 25) {
        const h = u(2);
        const e = (h >> 10) & 31;
        const m = h & 1023;
        return (h & 0x8000 ? -1 : 1) * (e ? Math.pow(2, e - 15) * (1 + m / 1024) : Math.pow(2, -14) * m / 1024);
      }
      if (ai === 26) { const v = buf.readFloatBE(i); i += 4; return v; }
      if (ai === 27) { const v = buf.readDoubleBE(i); i += 8; return v; }
      throw new Error('CBOR: simple value ' + ai);
    }
    const n = arg(ai);
    if (mt === 0) return n;
    if (mt === 1) return -1 - n;
    if (mt === 2 || mt === 3) {
      const s = buf.slice(i, i + n);
      i += n;
      return mt === 3 ? s.toString('utf8') : s.toString('latin1');
    }
    if (mt === 4) { const a = []; for (let k = 0; k < n; k++) a.push(item()); return a; }
    if (mt === 5) { const o = {}; for (let k = 0; k < n; k++) { const key = item(); o[key] = item(); } return o; }
    if (mt === 6) return item(); // tags: their content
    throw new Error('CBOR: major type ' + mt);
  }
  return item();
}

module.exports = { decode };
