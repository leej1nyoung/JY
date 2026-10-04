// 출생지(국내 시·군·구) 대표 좌표 생성 스크립트.
//
// 원자료: 통계청 SGIS 행정동 경계 (공공누리 제1유형) 를 vuski/admdongkor 가 시계열 보정한 GeoJSON (CC BY 4.0).
//   https://github.com/vuski/admdongkor  (ver20250701/HangJeongDong_ver20250701.geojson)
//
// 판본은 ver20250701 을 쓴다. 2026년판은 광주·전남이 '전남광주통합특별시'로 합쳐져 있어,
// 출생 당시 지명으로 고르는 사용자에게 혼란을 준다. 경도 값은 판본과 무관하다.
//
// 대표 좌표 = 해당 시·군·구에 속한 행정동 폴리곤 전체의 면적 가중 중심(centroid).
// 경도 0.1° 차이는 시각으로 24초이므로, 시·군·구 내부 위치 차이는 사주 판정에 사실상 영향이 없다.
//
// 사용법: node scripts/gen-birthplaces.mjs <geojson 경로>
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SOURCE_URL =
  'https://raw.githubusercontent.com/vuski/admdongkor/master/ver20250701/HangJeongDong_ver20250701.geojson';

const path = process.argv[2];
if (!path) {
  console.error('usage: node scripts/gen-birthplaces.mjs <HangJeongDong geojson>');
  process.exit(1);
}
const raw = readFileSync(path);
const sha256 = createHash('sha256').update(raw).digest('hex');
const geo = JSON.parse(raw.toString('utf8'));

// 링(ring) 하나의 부호 있는 면적과 1차 모멘트 (경도·위도 평면 근사, 경도축은 cos(위도)로 보정)
function ringMoments(ring, cosLat) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const x0 = ring[j][0] * cosLat, y0 = ring[j][1];
    const x1 = ring[i][0] * cosLat, y1 = ring[i][1];
    const cross = x0 * y1 - x1 * y0;
    a += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  return { a: a / 2, cx: cx / 6, cy: cy / 6 };
}

const COS_LAT = Math.cos((36 * Math.PI) / 180); // 한반도 남부 중앙 위도 근사. 가중치 비율에만 쓰이며 결과 경도는 다시 나눠서 복원.
const METRO = /(특별시|광역시|특별자치시)$/;

/** key -> { sido, name, area, mx, my } */
const groups = new Map();
function add(key, sido, name, poly) {
  // poly: [outer, ...holes]
  let g = groups.get(key);
  if (!g) groups.set(key, (g = { sido, name, area: 0, mx: 0, my: 0 }));
  for (const ring of poly) {
    const m = ringMoments(ring, COS_LAT);
    // 외곽/구멍 방향이 섞여 있어도 결과가 맞도록 외곽은 +, 구멍은 - 로 강제
    const sign = ring === poly[0] ? Math.sign(m.a) : -Math.sign(m.a);
    g.area += Math.abs(m.a) * (ring === poly[0] ? 1 : -1);
    g.mx += m.cx * sign;
    g.my += m.cy * sign;
  }
}

for (const f of geo.features) {
  const p = f.properties;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  // 일반시의 행정구(예: 수원시장안구)는 시 단위로 합친다. 자치구(특별·광역시의 구)는 그대로 둔다.
  let code = p.sgg;
  let name = p.sggnm;
  const general = !METRO.test(p.sidonm) && name.match(/^(.+시)(.+구)$/);
  if (general) {
    code = p.sgg.slice(0, 4) + '0';
    name = general[1];
  }
  for (const poly of polys) {
    add(code, p.sidonm, name, poly);
    // 특별·광역시는 "구를 모를 때" 쓸 시 전체 항목도 만든다.
    // 섬·농촌 군(옹진·강화·달성·기장·울주 등)은 빼고 자치구만으로 중심을 잡는다.
    if (METRO.test(p.sidonm) && p.sidonm !== '세종특별자치시' && p.sggnm.endsWith('구')) {
      add(p.sido, p.sidonm, '(구 모름)', poly);
    }
  }
}

const rows = [...groups.entries()]
  .map(([code, g]) => ({
    code,
    sido: g.sido,
    name: g.name,
    longitude: Math.round((g.mx / g.area / COS_LAT) * 1e4) / 1e4,
    latitude: Math.round((g.my / g.area) * 1e4) / 1e4,
  }))
  .sort((a, b) => a.code.localeCompare(b.code));

const out = `// 자동 생성 파일 — 직접 수정하지 말 것. scripts/gen-birthplaces.mjs 로 다시 만든다.
//
// 출처: 통계청 SGIS 행정동 경계(공공누리 제1유형, 출처표시), vuski/admdongkor 가공본(CC BY 4.0)
//   ${SOURCE_URL}
//   sha256: ${sha256}
// 좌표 = 행정동 폴리곤 면적 가중 중심. 일반시의 행정구는 시 단위로 합침.
// 특별·광역시는 자치구 항목과 함께 "(구 모름)" 시 전체 항목을 둔다 (코드 = 시도 코드 2자리).

export interface Birthplace {
  /** 시군구 코드 5자리(통계청), 특별·광역시 전체는 시도 코드 2자리 */
  code: string;
  sido: string;
  name: string;
  /** 동경(°) */
  longitude: number;
  /** 북위(°) */
  latitude: number;
}

export const BIRTHPLACES_SOURCE = {
  provider: '통계청 SGIS 행정동 경계 (공공누리 제1유형) / vuski/admdongkor (CC BY 4.0)',
  url: ${JSON.stringify(SOURCE_URL)},
  sha256: ${JSON.stringify(sha256)},
} as const;

export const BIRTHPLACES: readonly Birthplace[] = [
${rows.map((r) => '  ' + JSON.stringify(r) + ',').join('\n')}
];
`;
const target = fileURLToPath(new URL('../src/data/birthplaces.ts', import.meta.url));
writeFileSync(target, out);
console.log(`wrote ${rows.length} birthplaces -> ${target}`);
