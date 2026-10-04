# 나이테 — 내년의 안부

다음 생일의 내가 지금의 나에게 편지를 보내는 모바일 웹 서비스. 기획과 원칙은 [CLAUDE.md](CLAUDE.md).

## 구조
| 경로 | 내용 |
|---|---|
| `packages/saju` | 사주 계산 엔진 (원국, 십신, 세운, 5-8 연결 규칙). 기준: [docs/saju-engine.md](docs/saju-engine.md) |
| `packages/letter` | 주기 규칙(다음 생일)과 첫해 첫 장 템플릿 조립. 기준: [docs/letter-engine.md](docs/letter-engine.md) |
| `apps/web` | Next.js 화면 (메인 → 입력 → 편지 첫 장) |
| `db/schema.sql` | DB 설계 초안 (아직 적용 안 함) |
| `docs/OWNER-TODO.md` | 운영자가 직접 해야 할 일 |

## 실행
```bash
npm install
npm test          # 전체 테스트
npm run dev       # http://localhost:3000
npm run build
```
