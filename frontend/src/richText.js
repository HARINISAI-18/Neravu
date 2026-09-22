/**
 * parse(text) → blocks[]
 *   { type:'p',  segs } | { type:'ul', items:[segs] } | { type:'ol', items:[segs] }
 * segs: [{t:'text',s} | {t:'bold',s} | {t:'cite',n}]
 */
const CITE_RE = /(\[S\d+\])/g;
const BOLD_RE = /\*\*(.+?)\*\*/g;

function inlineSegments(line) {
  const segs = [];
  // split citations first
  for (const part of String(line).split(CITE_RE)) {
    const cm = part.match(/^\[S(\d+)\]$/);
    if (cm) { segs.push({ t: 'cite', n: Number(cm[1]) - 1 }); continue; }
    // then bold inside text parts
    let last = 0, m;
    BOLD_RE.lastIndex = 0;
    while ((m = BOLD_RE.exec(part)) !== null) {
      if (m.index > last) segs.push({ t: 'text', s: part.slice(last, m.index) });
      segs.push({ t: 'bold', s: m[1] });
      last = m.index + m[0].length;
    }
    if (last < part.length) segs.push({ t: 'text', s: part.slice(last) });
  }
  return segs;
}

export function parse(text) {
  const blocks = [];
  let para = [], list = null;

  const flushPara = () => {
    if (para.length) { blocks.push({ type: 'p', segs: inlineSegments(para.join(' ')) }); para = []; }
  };
  const flushList = () => {
    if (list) { blocks.push(list); list = null; }
  };

  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushList(); flushPara(); continue; }

    const ul = line.match(/^\s*[-•*]\s+(.*)/);
    const ol = line.match(/^\s*(\d+)[.)]\s+(.*)/);
    if (ul) {
      flushPara();
      if (!list || list.type !== 'ul') { flushList(); list = { type: 'ul', items: [] }; }
      list.items.push(inlineSegments(ul[1]));
    } else if (ol) {
      flushPara();
      if (!list || list.type !== 'ol') { flushList(); list = { type: 'ol', items: [] }; }
      list.items.push(inlineSegments(ol[2]));
    } else {
      flushList();
      para.push(line);
    }
  }
  flushList();
  flushPara();
  return blocks;
}