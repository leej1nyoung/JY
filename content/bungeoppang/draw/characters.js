// 「붕어빵의 정체」 캐릭터 그리기 모듈
// 모든 캐릭터는 로컬 좌표 기준: 머리 중심 약 (0, 320), 발바닥 약 y=810.
// place(svg, x, y, scale)로 원하는 위치에 배치한다 (x, y = 발 중앙).

const FONT = "'Gowun Batang','Apple SD Gothic Neo','Noto Sans KR',sans-serif";

function defs() {
  return `
  <defs>
    <radialGradient id="bread" cx="40%" cy="35%" r="75%">
      <stop offset="0" stop-color="#F6C46A"/><stop offset="0.6" stop-color="#DE9A3E"/><stop offset="1" stop-color="#B06A22"/>
    </radialGradient>
    <radialGradient id="breadSoggy" cx="40%" cy="35%" r="75%">
      <stop offset="0" stop-color="#C99A55"/><stop offset="0.6" stop-color="#A8763A"/><stop offset="1" stop-color="#7A4E1E"/>
    </radialGradient>
    <linearGradient id="pinkShell" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#FAD0DC"/><stop offset="1" stop-color="#E996AE"/>
    </linearGradient>
    <radialGradient id="truffle" cx="38%" cy="32%" r="75%">
      <stop offset="0" stop-color="#7A4A2E"/><stop offset="0.65" stop-color="#4A2A18"/><stop offset="1" stop-color="#2A160C"/>
    </radialGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFF1B0"/><stop offset="0.5" stop-color="#E2B84A"/><stop offset="1" stop-color="#B8892A"/>
    </linearGradient>
    <linearGradient id="coffee" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8A5530"/><stop offset="1" stop-color="#4A2A14"/>
    </linearGradient>
  </defs>`;
}

function place(inner, x, y, s = 1, flip = false) {
  // 로컬 발 위치 (0, 810)을 (x, y)에 맞춘다
  const sx = flip ? -s : s;
  return `<g transform="translate(${x},${y}) scale(${sx},${s}) translate(0,-810)">${inner}</g>`;
}

// ---------- 공용 얼굴 부품 ----------
function eye(cx, cy, rx, ry, line, pupil, expr, look = 0) {
  if (expr === "closed") {
    return `<path d="M${cx - rx} ${cy} Q${cx} ${cy + ry * 0.6} ${cx + rx} ${cy}" stroke="${line}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
  }
  if (expr === "shock") {
    return `<ellipse cx="${cx}" cy="${cy}" rx="${rx * 1.15}" ry="${ry * 1.2}" fill="#fff" stroke="${line}" stroke-width="2"/>
      <circle cx="${cx + look}" cy="${cy}" r="${rx * 0.25}" fill="${pupil}"/>`;
  }
  const pr = rx * 0.5;
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" stroke="${line}" stroke-width="2"/>
    <circle cx="${cx + 3 + look}" cy="${cy + 6}" r="${pr}" fill="${pupil}"/>
    <circle cx="${cx + 7 + look}" cy="${cy + 1}" r="${pr * 0.33}" fill="#fff"/>`;
}

function brows(lx, rx, y, line, expr) {
  const w = 20;
  const map = {
    normal: [`M${lx - w} ${y} Q${lx} ${y - 8} ${lx + w} ${y}`, `M${rx - w} ${y} Q${rx} ${y - 8} ${rx + w} ${y}`],
    sad: [`M${lx - w} ${y + 4} Q${lx} ${y - 4} ${lx + w} ${y - 10}`, `M${rx - w} ${y - 10} Q${rx} ${y - 4} ${rx + w} ${y + 4}`],
    angry: [`M${lx - w} ${y - 10} Q${lx} ${y - 4} ${lx + w} ${y + 6}`, `M${rx - w} ${y + 6} Q${rx} ${y - 4} ${rx + w} ${y - 10}`],
    shock: [`M${lx - w} ${y - 14} Q${lx} ${y - 30} ${lx + w} ${y - 16}`, `M${rx - w} ${y - 16} Q${rx} ${y - 30} ${rx + w} ${y - 14}`],
    calm: [`M${lx - w} ${y} L${lx + w} ${y}`, `M${rx - w} ${y} L${rx + w} ${y}`],
  };
  const [a, b] = map[expr] || map.normal;
  return `<path d="${a}" stroke="${line}" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="${b}" stroke="${line}" stroke-width="5" fill="none" stroke-linecap="round"/>`;
}

function mouth(cx, cy, line, kind) {
  switch (kind) {
    case "smile": return `<path d="M${cx - 14} ${cy} Q${cx} ${cy + 12} ${cx + 14} ${cy}" stroke="${line}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case "flat": return `<path d="M${cx - 12} ${cy + 4} L${cx + 12} ${cy + 4}" stroke="${line}" stroke-width="4" stroke-linecap="round"/>`;
    case "o": return `<ellipse cx="${cx}" cy="${cy + 6}" rx="10" ry="13" fill="${line}"/>`;
    case "wobble": return `<path d="M${cx - 18} ${cy + 4} q6 -6 12 0 q6 6 12 0 q6 -6 12 0" stroke="${line}" stroke-width="4" fill="none" stroke-linecap="round"/>`;
    case "smirk": return `<path d="M${cx - 18} ${cy + 4} Q${cx + 4} ${cy + 12} ${cx + 26} ${cy - 4}" stroke="#B0253A" stroke-width="6" fill="none" stroke-linecap="round"/>`;
    case "shout": return `<path d="M${cx - 22} ${cy - 2} Q${cx} ${cy + 30} ${cx + 22} ${cy - 2} Z" fill="#7A1626" stroke="#B0253A" stroke-width="4"/>`;
    default: return "";
  }
}

// ---------- 몸통 (공용) ----------
function body({ top, topLine, bottom, skin, shoes, arms = {}, skirt = false, heels = false }) {
  const la = arms.left || "M-72 455 Q-108 530 -98 612";
  const ra = arms.right || "M72 455 Q108 530 98 612";
  const lh = arms.leftHand || [-98, 622];
  const rh = arms.rightHand || [98, 622];
  let legs;
  if (skirt) {
    legs = `<rect x="-40" y="690" width="30" height="110" rx="12" fill="${skin}"/>
      <rect x="10" y="690" width="30" height="110" rx="12" fill="${skin}"/>`;
  } else {
    legs = `<rect x="-52" y="628" width="46" height="172" rx="16" fill="${bottom}"/>
      <rect x="6" y="628" width="46" height="172" rx="16" fill="${bottom}"/>`;
  }
  const feet = heels
    ? `<path d="M-48 806 L-10 806 L-12 792 L-44 796 Z M10 806 L48 806 L44 796 L12 792 Z" fill="${shoes}"/>`
    : `<ellipse cx="-30" cy="804" rx="34" ry="13" fill="${shoes}" stroke="#00000022" stroke-width="2"/>
       <ellipse cx="30" cy="804" rx="34" ry="13" fill="${shoes}" stroke="#00000022" stroke-width="2"/>`;
  return `<ellipse cx="0" cy="810" rx="105" ry="14" fill="#000" opacity="0.12"/>
    ${legs}${feet}
    <path d="${la}" stroke="${top}" stroke-width="34" fill="none" stroke-linecap="round"/>
    <path d="${ra}" stroke="${top}" stroke-width="34" fill="none" stroke-linecap="round"/>
    <circle cx="${lh[0]}" cy="${lh[1]}" r="17" fill="${skin}"/>
    <circle cx="${rh[0]}" cy="${rh[1]}" r="17" fill="${skin}"/>
    <path d="M-78 445 Q-88 540 -72 640 L72 640 Q88 540 78 445 Q0 425 -78 445 Z" fill="${top}" ${topLine ? `stroke="${topLine}" stroke-width="2"` : ""}/>
    <rect x="-17" y="400" width="34" height="46" rx="8" fill="${skin}"/>`;
}

// ---------- 🐟 붕어빵 ----------
function bungeo({ expr = "normal", mouthKind = "smile", soggy = false, arms = {}, look = 0 } = {}) {
  const fill = soggy ? "url(#breadSoggy)" : "url(#bread)";
  const line = soggy ? "#6A4216" : "#A8661F";
  const eyeExpr = expr === "sad" || expr === "calm" || expr === "angry" ? "normal" : expr;
  const browExpr = expr === "closed" ? "calm" : expr;
  const droop = soggy ? 14 : 0;
  const head = `
    <g transform="translate(0,${droop}) rotate(${soggy ? 6 : 0} 0 320)">
      <path d="M100 300 L172 ${248 + droop} Q158 318 174 ${392 + droop * 2} L100 342 Z" fill="${fill}" stroke="${line}" stroke-width="3"/>
      <path d="M120 300 L160 272 M120 320 L162 322 M120 340 L160 368" stroke="${line}" stroke-width="3" stroke-linecap="round"/>
      <path d="M-52 240 Q0 ${soggy ? 210 : 190} 52 240 Z" fill="${soggy ? "#9A6A30" : "#D18B35"}" stroke="${line}" stroke-width="3"/>
      <ellipse cx="0" cy="322" rx="122" ry="${soggy ? 102 : 96}" fill="${fill}" stroke="${line}" stroke-width="3"/>
      <g stroke="${soggy ? "#6A4216" : "#B5732A"}" stroke-width="3" fill="none" stroke-linecap="round" opacity="0.8">
        <path d="M30 368 q12 14 24 0 M58 368 q12 14 24 0 M44 388 q12 14 24 0"/>
        <path d="M-80 372 q12 14 24 0 M-52 386 q12 14 24 0"/>
        <path d="M72 262 q12 14 24 0 M84 290 q10 12 20 0"/>
      </g>
      ${soggy ? "" : `<path d="M-100 290 Q-90 255 -55 238" stroke="#FCE3A8" stroke-width="5" fill="none" stroke-linecap="round" opacity="0.8"/>`}
      ${eye(-40, 312, 24, 28, "#6B3D12", "#3A2412", eyeExpr, look)}
      ${eye(22, 312, 24, 28, "#6B3D12", "#3A2412", eyeExpr, look)}
      ${brows(-42, 22, 276, "#6B3D12", browExpr)}
      <ellipse cx="-70" cy="352" rx="14" ry="7" fill="#F08A7A" opacity="${soggy ? 0.2 : 0.45}"/>
      <ellipse cx="52" cy="352" rx="14" ry="7" fill="#F08A7A" opacity="${soggy ? 0.2 : 0.45}"/>
      ${mouth(-8, 362, "#6B3D12", mouthKind)}
      ${soggy ? `
        <g fill="#8EC5F0" stroke="#5A9AD0" stroke-width="2">
          <path d="M-90 400 q6 14 0 22 q-6 -8 0 -22 Z"/><path d="M60 412 q6 14 0 22 q-6 -8 0 -22 Z"/>
          <path d="M110 370 q6 14 0 22 q-6 -8 0 -22 Z"/><path d="M-20 420 q6 14 0 22 q-6 -8 0 -22 Z"/>
        </g>
        <path d="M-60 240 q10 -10 20 0 q10 10 20 0" stroke="#8EC5F0" stroke-width="3" fill="none"/>` : ""}
    </g>`;
  const hoodie = `
    <path d="M-48 565 L48 565 L58 615 L-58 615 Z" fill="${soggy ? "#7C8288" : "#8E949A"}"/>
    <path d="M-62 446 Q0 488 62 446 Q0 430 -62 446 Z" fill="#7F858B"/>
    <path d="M-14 458 L-18 515 M14 458 L18 515" stroke="#E8E8E8" stroke-width="4" stroke-linecap="round"/>`;
  return body({ top: soggy ? "#8D939A" : "#A3A9AF", bottom: "#4A6FA5", skin: "#F2C9A0", shoes: "#FFFFFF", arms }) + hoodie + head;
}

// ---------- 🍬 마카롱 ----------
function macaron({ expr = "normal", mouthKind = "smile", arms = {}, look = 0 } = {}) {
  const ruffle = (y, dir) => {
    let d = `M-118 ${y}`;
    for (let i = 0; i < 15; i++) d += ` q8 ${dir * 8} 16 0`;
    return `<path d="${d}" stroke="#E08FA8" stroke-width="4" fill="none"/>`;
  };
  const eyeExpr = expr === "sad" ? "normal" : expr;
  return body({
    top: "#FFFDF8", topLine: "#EADFD3", skin: "#F2D2B8", shoes: "#F4B9CA", skirt: true,
    arms: { left: "M-66 455 Q-96 530 -88 600", right: "M66 455 Q96 530 88 600", leftHand: [-88, 610], rightHand: [88, 610], ...arms },
  }) + `
    <path d="M-68 598 L68 598 L98 705 L-98 705 Z" fill="#D9C8F0"/>
    <path d="M-40 605 L-58 702 M0 605 L0 704 M40 605 L58 702" stroke="#C3AEE3" stroke-width="3"/>
    <path d="M0 458 L-30 440 L-30 476 Z M0 458 L30 440 L30 476 Z" fill="#F4B9CA" stroke="#E08FA8" stroke-width="2"/>
    <circle cx="0" cy="458" r="8" fill="#E996AE"/>
    <path d="M-110 380 Q-112 425 -60 432 L60 432 Q112 425 110 380 Z" fill="url(#pinkShell)" stroke="#D97C98" stroke-width="3"/>
    ${ruffle(380, -1)}
    <rect x="-112" y="340" width="224" height="38" rx="18" fill="#FFF4E6" stroke="#EAD7BE" stroke-width="2"/>
    <path d="M-118 340 Q-118 210 0 205 Q118 210 118 340 Z" fill="url(#pinkShell)" stroke="#D97C98" stroke-width="3"/>
    ${ruffle(340, 1)}
    <ellipse cx="-50" cy="238" rx="38" ry="12" fill="#fff" opacity="0.45" transform="rotate(-12 -50 238)"/>
    ${eye(-36, 290, 21, 26, "#8A3E58", "#4A2A3A", eyeExpr, look)}
    ${eye(36, 290, 21, 26, "#8A3E58", "#4A2A3A", eyeExpr, look)}
    ${expr === "closed" || expr === "shock" ? "" : `<path d="M-58 272 l-10 -8 M-50 266 l-6 -10 M58 272 l10 -8 M50 266 l6 -10" stroke="#4A2A3A" stroke-width="3" stroke-linecap="round"/>`}
    ${expr === "sad" ? brows(-36, 36, 258, "#8A3E58", "sad") : ""}
    <ellipse cx="-72" cy="322" rx="14" ry="7" fill="#E8708F" opacity="0.4"/>
    <ellipse cx="72" cy="322" rx="14" ry="7" fill="#E8708F" opacity="0.4"/>
    ${mouth(0, 350, "#8A3E58", mouthKind)}
    <path d="M78 232 l-8 14 l6 6 l-6 12" stroke="#C76A88" stroke-width="2" fill="none" opacity="0.7"/>`;
}

// ---------- 🍫 트러플 엄마 ----------
function truffle({ expr = "haughty", mouthKind = "smirk", arms = {}, look = 0, handbag = true } = {}) {
  const lids = expr === "haughty"
    ? `<path d="M-62 312 Q-38 290 -14 312 L-14 296 L-62 296 Z" fill="#4A2A18"/>
       <path d="M14 312 Q38 290 62 312 L62 296 L14 296 Z" fill="#4A2A18"/>
       <path d="M-62 312 Q-38 300 -14 312 M14 312 Q38 300 62 312" stroke="#1E1010" stroke-width="3" fill="none"/>`
    : "";
  const eyeExpr = expr === "haughty" || expr === "angry" ? "normal" : expr;
  const browSvg = expr === "haughty"
    ? `<path d="M-64 274 Q-40 258 -14 270" stroke="#1E1010" stroke-width="5" fill="none" stroke-linecap="round"/>
       <path d="M14 262 Q40 240 64 258" stroke="#1E1010" stroke-width="5" fill="none" stroke-linecap="round"/>`
    : brows(-38, 38, 270, "#1E1010", expr);
  return body({
    top: "#7B2D3A", skin: "#EBC9A8", shoes: "#1E1418", skirt: true, heels: true, arms,
  }) + `
    <path d="M-70 625 L70 625 L76 722 L-76 722 Z" fill="#2A2026"/>
    <rect x="-38" y="712" width="28" height="86" rx="10" fill="#EBC9A8"/>
    <rect x="10" y="712" width="28" height="86" rx="10" fill="#EBC9A8"/>
    <path d="M-48 806 L-10 806 L-12 792 L-44 796 Z M10 806 L48 806 L44 796 L12 792 Z" fill="#1E1418"/>
    <g fill="#A8505E" opacity="0.6"><circle cx="-50" cy="500" r="3"/><circle cx="-30" cy="540" r="3"/><circle cx="-55" cy="580" r="3"/><circle cx="45" cy="490" r="3"/><circle cx="55" cy="560" r="3"/><circle cx="30" cy="600" r="3"/></g>
    <path d="M-40 446 L0 520 L40 446" stroke="#5E1F2A" stroke-width="5" fill="none"/>
    <path d="M-76 446 L-76 632 M76 446 L76 632" stroke="url(#gold)" stroke-width="4"/>
    <circle cx="0" cy="545" r="7" fill="url(#gold)"/><circle cx="0" cy="585" r="7" fill="url(#gold)"/>
    ${handbag ? `<path d="M-110 612 Q-96 590 -82 612" stroke="#B8892A" stroke-width="4" fill="none"/><rect x="-122" y="612" width="50" height="40" rx="8" fill="url(#gold)" stroke="#9C7420" stroke-width="2"/>` : ""}
    <g fill="#FFFDF5" stroke="#D8CFC0" stroke-width="1.5"><circle cx="-30" cy="452" r="7"/><circle cx="-18" cy="462" r="7"/><circle cx="-5" cy="467" r="7"/><circle cx="8" cy="467" r="7"/><circle cx="21" cy="462" r="7"/><circle cx="33" cy="452" r="7"/></g>
    <circle cx="0" cy="318" r="112" fill="url(#truffle)" stroke="#22120A" stroke-width="3"/>
    <g fill="#8A5A3C" opacity="0.55"><circle cx="-70" cy="270" r="3"/><circle cx="-40" cy="240" r="2.5"/><circle cx="60" cy="250" r="3"/><circle cx="80" cy="300" r="2.5"/><circle cx="-85" cy="330" r="3"/><circle cx="70" cy="370" r="3"/><circle cx="-50" cy="390" r="2.5"/><circle cx="20" cy="400" r="3"/></g>
    <path d="M-18 210 L6 198 L22 214 L10 228 L-10 224 Z" fill="url(#gold)"/><path d="M24 222 L36 216 L40 228 L30 232 Z" fill="url(#gold)"/>
    ${eye(-38, 312, 22, 20, "#1E1010", "#1E1010", eyeExpr, look)}
    ${eye(38, 312, 22, 20, "#1E1010", "#1E1010", eyeExpr, look)}
    ${lids}${browSvg}
    <circle cx="-38" cy="312" r="31" fill="none" stroke="url(#gold)" stroke-width="5"/>
    <circle cx="38" cy="312" r="31" fill="none" stroke="url(#gold)" stroke-width="5"/>
    <path d="M-7 308 Q0 300 7 308" stroke="url(#gold)" stroke-width="4" fill="none"/>
    <path d="M-69 316 Q-92 380 -60 440" stroke="#E2B84A" stroke-width="2" fill="none" stroke-dasharray="3 3"/>
    ${mouth(4, 364, "#B0253A", mouthKind)}`;
}

// ---------- 말풍선 / 자막 ----------
function bubble(x, y, w, h, text, { tailX, tailY, size = 44, fill = "#fff", color = "#2A1E30" } = {}) {
  const tail = tailX != null
    ? `<path d="M${x + w * 0.35} ${y + h - 4} L${tailX} ${tailY} L${x + w * 0.55} ${y + h - 4} Z" fill="${fill}" stroke="#2A1E30" stroke-width="4" stroke-linejoin="round"/>`
    : "";
  const lines = String(text).split("\n");
  const lh = size * 1.3;
  const startY = y + h / 2 - ((lines.length - 1) * lh) / 2 + size * 0.35;
  return `${tail}
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(h / 2, 48)}" fill="${fill}" stroke="#2A1E30" stroke-width="4"/>
    ${tail ? `<path d="M${x + w * 0.35 + 3} ${y + h - 2} L${x + w * 0.55 - 3} ${y + h - 2}" stroke="${fill}" stroke-width="6"/>` : ""}
    ${lines.map((l, i) => `<text x="${x + w / 2}" y="${startY + i * lh}" text-anchor="middle" font-family="${FONT}" font-size="${size}" font-weight="700" fill="${color}">${l}</text>`).join("")}`;
}

function caption(x, y, w, h, text, { size = 40 } = {}) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#1E1418" opacity="0.82"/>
    <text x="${x + w / 2}" y="${y + h / 2 + size * 0.35}" text-anchor="middle" font-family="${FONT}" font-size="${size}" fill="#FFF6E8">${text}</text>`;
}

module.exports = { FONT, defs, place, bungeo, macaron, truffle, bubble, caption };
