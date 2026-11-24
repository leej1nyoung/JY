// 1화 「붕어빵의 정체」 슬라이드 생성 (1080x1350, 인스타 4:5)
// 실행: node content/bungeoppang/draw/ep01.js  → content/bungeoppang/ep01/*.svg, *.png
const fs = require("fs");
const path = require("path");
const C = require("./characters");

const W = 1080, H = 1350;
const OUT = path.join(__dirname, "..", "ep01");

function frame(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${C.defs()}${inner}</svg>`;
}

function rain(n, seed = 7, opacity = 0.35) {
  let s = seed, out = "";
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    const x = rnd() * (W + 200) - 100, y = rnd() * H, l = 30 + rnd() * 40;
    out += `<path d="M${x} ${y} l${-l * 0.25} ${l}" stroke="#BFD8F5" stroke-width="2.5" stroke-linecap="round" opacity="${opacity}"/>`;
  }
  return out;
}

// ---------- 1장: 표지 ----------
function slide01() {
  const bg = `
    <linearGradient id="night" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#151A33"/><stop offset="0.7" stop-color="#2E2A4E"/><stop offset="1" stop-color="#1C1830"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="#FFB25C" stop-opacity="0.75"/><stop offset="1" stop-color="#FFB25C" stop-opacity="0"/>
    </radialGradient>`;
  const stall = `
    <ellipse cx="800" cy="760" rx="420" ry="360" fill="url(#glow)"/>
    <!-- 포장마차 -->
    <path d="M590 560 L1010 560 L1040 640 L560 640 Z" fill="#E2573A"/>
    <path d="M590 560 L1010 560 L1040 640 L560 640 Z" fill="none" stroke="#B8402A" stroke-width="4"/>
    <g stroke="#F7E3C8" stroke-width="16" opacity="0.9"><path d="M650 560 L630 640 M770 560 L760 640 M890 560 L890 640 M990 560 L1010 640"/></g>
    <rect x="575" y="640" width="450" height="360" fill="#F08A3C" opacity="0.55"/>
    <rect x="600" y="830" width="400" height="40" rx="6" fill="#6B4A32"/>
    <rect x="610" y="870" width="380" height="140" fill="#4E3626"/>
    <!-- 붕어빵 틀 -->
    <rect x="660" y="800" width="120" height="30" rx="6" fill="#2A2A2E"/>
    <g fill="#E3A24A"><ellipse cx="690" cy="795" rx="20" ry="11"/><ellipse cx="740" cy="795" rx="20" ry="11"/></g>
    <!-- 간판 -->
    <rect x="720" y="660" width="200" height="80" rx="10" fill="#FFF3D6" stroke="#B8402A" stroke-width="4"/>
    <text x="820" y="716" text-anchor="middle" font-family="${C.FONT}" font-size="44" font-weight="700" fill="#B8402A">붕어빵</text>
    <circle cx="640" cy="680" r="18" fill="#FFE9A8"/><circle cx="640" cy="680" r="34" fill="#FFE9A8" opacity="0.3"/>`;
  const street = `
    <rect x="0" y="1080" width="${W}" height="${H - 1080}" fill="#1A1A2A"/>
    <ellipse cx="800" cy="1150" rx="300" ry="30" fill="#FFB25C" opacity="0.18"/>
    <ellipse cx="560" cy="1240" rx="380" ry="26" fill="#BFD8F5" opacity="0.08"/>`;

  // 붕어빵: 오른팔을 들어 우산을 받친다
  const bung = C.place(C.bungeo({
    expr: "normal", mouthKind: "smile", look: 6,
    arms: { right: "M72 455 Q125 430 142 360", rightHand: [142, 350] },
  }), 360, 1230, 0.95);
  const mac = C.place(C.macaron({ expr: "normal", mouthKind: "smile", look: -7 }), 720, 1230, 0.9);

  // 투명 비닐우산 (마카롱 쪽으로 기울임). 손잡이 끝 = 붕어빵 손 (360+142*.95, 1230-(810-350)*.95)
  const hx = 360 + 142 * 0.95, hy = 1230 - (810 - 350) * 0.95;
  const ax = 650, ay = 500;
  const umbrella = `
    <line x1="${hx}" y1="${hy}" x2="${ax}" y2="${ay}" stroke="#E8E8EE" stroke-width="7" stroke-linecap="round"/>
    <path d="M${hx} ${hy} q-4 22 -22 22 q-16 0 -16 -16" stroke="#E8E8EE" stroke-width="7" fill="none" stroke-linecap="round"/>
    <g transform="rotate(24 ${ax} ${ay})">
      <path d="M${ax - 250} ${ay + 120} Q${ax} ${ay - 130} ${ax + 250} ${ay + 120}
               q-31 -18 -62 0 q-31 -18 -62 0 q-31 -18 -63 0 q-31 -18 -63 0
               q-31 -18 -63 0 q-31 -18 -62 0 q-31 -18 -62 0 q-31 -18 -63 0 Z"
            fill="#FFFFFF" fill-opacity="0.28" stroke="#FFFFFF" stroke-opacity="0.85" stroke-width="4"/>
      <path d="M${ax} ${ay - 5} L${ax - 125} ${ay + 115} M${ax} ${ay - 5} L${ax} ${ay + 115} M${ax} ${ay - 5} L${ax + 125} ${ay + 115}" stroke="#FFFFFF" stroke-opacity="0.5" stroke-width="2"/>
      <path d="M${ax - 160} ${ay + 40} Q${ax - 120} ${ay - 10} ${ax - 60} ${ay - 20}" stroke="#fff" stroke-opacity="0.7" stroke-width="6" fill="none" stroke-linecap="round"/>
    </g>`;
  // 붕어빵 어깨에 떨어지는 빗방울 (혼자 비 맞는 중)
  const wetShoulder = `<g fill="#8EC5F0" opacity="0.9">
      <path d="M250 640 q6 14 0 22 q-6 -8 0 -22 Z"/><path d="M290 700 q6 14 0 22 q-6 -8 0 -22 Z"/><path d="M230 780 q6 14 0 22 q-6 -8 0 -22 Z"/>
    </g>`;

  const title = `
    <text x="540" y="170" text-anchor="middle" font-family="${C.FONT}" font-size="92" font-weight="700" fill="#FFF6E8">「붕어빵의 정체」</text>
    <rect x="490" y="205" width="100" height="48" rx="24" fill="#F4B9CA"/>
    <text x="540" y="240" text-anchor="middle" font-family="${C.FONT}" font-size="30" font-weight="700" fill="#3E2A47">1화</text>`;

  return frame(`<defs>${bg}</defs>
    <rect width="${W}" height="${H}" fill="url(#night)"/>
    ${stall}${street}${rain(140, 7, 0.3)}
    ${bung}${mac}${umbrella}${wetShoulder}
    ${rain(40, 31, 0.5)}
    ${title}
    ${C.caption(0, 1250, W, 100, "그는 가진 게 없었다.", { size: 44 })}`);
}

// ---------- 5장: 물벼락 ----------
function slide05() {
  const bg = `
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#F6E7CC"/><stop offset="1" stop-color="#E4C995"/>
    </linearGradient>`;
  const room = `
    <rect width="${W}" height="${H}" fill="url(#wall)"/>
    <g stroke="#CDAE74" stroke-width="4" fill="none">
      <rect x="60" y="420" width="260" height="380" rx="6"/><rect x="410" y="420" width="260" height="380" rx="6"/><rect x="760" y="420" width="260" height="380" rx="6"/>
    </g>
    <!-- 샹들리에 -->
    <line x1="540" y1="0" x2="540" y2="90" stroke="#B8892A" stroke-width="4"/>
    <path d="M430 120 Q540 190 650 120" stroke="url(#gold)" stroke-width="10" fill="none"/>
    <g fill="#FFFFFF" stroke="#E2B84A" stroke-width="2" opacity="0.9">
      <path d="M450 140 l8 24 l-8 14 l-8 -14 Z"/><path d="M500 160 l8 24 l-8 14 l-8 -14 Z"/><path d="M540 166 l8 24 l-8 14 l-8 -14 Z"/>
      <path d="M580 160 l8 24 l-8 14 l-8 -14 Z"/><path d="M630 140 l8 24 l-8 14 l-8 -14 Z"/>
    </g>
    <rect x="0" y="1080" width="${W}" height="${H - 1080}" fill="#7B2D3A"/>
    <path d="M0 1080 L${W} 1080" stroke="#5E1F2A" stroke-width="8"/>`;

  // 집중선 (붕어빵 쪽)
  let speed = "";
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const cx = 790, cy = 720;
    speed += `<path d="M${cx + Math.cos(a) * 330} ${cy + Math.sin(a) * 330} L${cx + Math.cos(a) * 900} ${cy + Math.sin(a) * 900}" stroke="#2A1E30" stroke-width="${i % 3 ? 3 : 6}" opacity="0.14"/>`;
  }

  const mom = C.place(C.truffle({
    expr: "angry", mouthKind: "shout", handbag: false,
    arms: { right: "M74 455 Q150 470 205 415", rightHand: [210, 410] },
  }), 270, 1240, 1.0);
  const cupX = 270 + 210, cupY = 1240 - (810 - 410);
  const cup = `
    <g transform="rotate(-70 ${cupX} ${cupY})">
      <path d="M${cupX - 34} ${cupY - 30} L${cupX + 34} ${cupY - 30} L${cupX + 26} ${cupY + 30} L${cupX - 26} ${cupY + 30} Z" fill="#FFFFFF" stroke="#B8B0A8" stroke-width="3"/>
      <rect x="${cupX - 34}" y="${cupY - 8}" width="68" height="18" fill="#E9DED0"/>
    </g>`;
  const splash = `
    <path d="M${cupX + 20} ${cupY - 40} C${cupX + 120} ${cupY - 260} ${cupX + 250} ${cupY - 250} ${cupX + 340} ${cupY - 150}
             C${cupX + 300} ${cupY - 190} ${cupX + 180} ${cupY - 190} ${cupX + 60} ${cupY - 10} Z" fill="url(#coffee)" opacity="0.95"/>
    <g fill="#6A3E20">
      <circle cx="${cupX + 470}" cy="${cupY - 250}" r="14"/><circle cx="${cupX + 510}" cy="${cupY - 200}" r="10"/>
      <circle cx="${cupX + 200}" cy="${cupY - 280}" r="10"/><circle cx="${cupX + 250}" cy="${cupY - 310}" r="12"/>
      <circle cx="${cupX + 400}" cy="${cupY - 320}" r="9"/><circle cx="${cupX + 330}" cy="${cupY - 330}" r="8"/>
      <path d="M${cupX + 225} ${cupY - 60} q10 22 0 34 q-10 -12 0 -34 Z"/>
      <path d="M${cupX + 520} ${cupY - 120} q10 22 0 34 q-10 -12 0 -34 Z"/>
    </g>`;

  const bung = C.place(C.bungeo({ expr: "shock", mouthKind: "o" }), 820, 1240, 1.0);
  // 머리에 쏟아진 커피 자국
  const stain = `
    <path d="M700 590 Q760 560 830 575 Q900 560 930 600 L925 640 Q905 625 895 668 Q880 630 860 650 Q840 615 815 660 Q800 620 770 640 Q750 610 720 650 Z" fill="#6A3E20" opacity="0.85"/>`;

  const sfx = `
    <g transform="rotate(-8 540 250)">
      <text x="540" y="300" text-anchor="middle" font-family="${C.FONT}" font-size="190" font-weight="700"
            fill="#FFFFFF" stroke="#2A1E30" stroke-width="16" paint-order="stroke" stroke-linejoin="round">촤악!</text>
    </g>`;

  return frame(`<defs>${bg}</defs>${room}${speed}${mom}${bung}${stain}${cup}${splash}${sfx}`);
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const slides = { "01": slide01(), "05": slide05() };
  for (const [k, svg] of Object.entries(slides)) fs.writeFileSync(path.join(OUT, `slide${k}.svg`), svg);
  return slides;
}

if (require.main === module) {
  const slides = main();
  const { chromium } = require("playwright");
  (async () => {
    const b = await chromium.launch();
    const p = await b.newPage({ viewport: { width: W, height: H } });
    for (const k of Object.keys(slides)) {
      await p.goto("file://" + path.join(OUT, `slide${k}.svg`));
      await p.screenshot({ path: path.join(OUT, `slide${k}.png`) });
    }
    await b.close();
    console.log("done:", Object.keys(slides).join(", "));
  })();
}
