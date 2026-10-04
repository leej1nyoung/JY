// 대한민국(서울) 표준시·서머타임 이력.
//
// 출처: IANA tz database, Zone "Asia/Seoul" 및 Rule "ROK" (tzdb 2025b, eggert/tz main 의 asia 파일과 대조).
//   https://github.com/eggert/tz/blob/main/asia
// tzdb 가 인용한 원자료:
//   - 표준시 변경: 1908 관보 제3994호, 1912 조선총독부 관보 제367호, 1954 대통령령 제876호, 1961 법률 제676호
//   - 서머타임 종료일(1955~1960): 국가기록원 관보 (theme.archives.go.kr)
//   - 1948 시작일·1988 시작 시각: 당시 신문 기사
// 알려진 불확실성: tzdb 주석에는 "한국전쟁(1950-53) 중 서머타임 중단" 이라는 다른 보고도 있으나,
// 현재 tzdb 규칙은 1950·1951 년에도 서머타임을 적용한다. 출시 전 국가기록원 관보로 최종 확인 대상.
//
// 아래 표는 각 구간이 시작되는 UTC 시각과 그 구간의 UTC 오프셋(분)이다.
// test/korea-time.test.ts 가 이 표를 Node(ICU) 의 Asia/Seoul 과 전 구간 대조한다.

export interface OffsetPeriod {
  /** 이 구간이 시작되는 순간 (UTC, ISO 8601) */
  fromUtc: string;
  /** UTC 대비 오프셋(분). 540 = UTC+9 */
  offsetMinutes: number;
  /** 서머타임 구간 여부 */
  dst: boolean;
}

export const KOREA_OFFSET_HISTORY: readonly OffsetPeriod[] = [
  { fromUtc: '1911-12-31T15:30:00Z', offsetMinutes: 540, dst: false }, // 1912-01-01 UTC+9
  { fromUtc: '1948-05-31T15:00:00Z', offsetMinutes: 600, dst: true },
  { fromUtc: '1948-09-12T14:00:00Z', offsetMinutes: 540, dst: false },
  { fromUtc: '1949-04-02T15:00:00Z', offsetMinutes: 600, dst: true },
  { fromUtc: '1949-09-10T14:00:00Z', offsetMinutes: 540, dst: false },
  { fromUtc: '1950-03-31T15:00:00Z', offsetMinutes: 600, dst: true },
  { fromUtc: '1950-09-09T14:00:00Z', offsetMinutes: 540, dst: false },
  { fromUtc: '1951-05-05T15:00:00Z', offsetMinutes: 600, dst: true },
  { fromUtc: '1951-09-08T14:00:00Z', offsetMinutes: 540, dst: false },
  { fromUtc: '1954-03-20T15:00:00Z', offsetMinutes: 510, dst: false }, // 1954-03-21 UTC+8:30 (동경 127.5°)
  { fromUtc: '1955-05-04T15:30:00Z', offsetMinutes: 570, dst: true },
  { fromUtc: '1955-09-08T14:30:00Z', offsetMinutes: 510, dst: false },
  { fromUtc: '1956-05-19T15:30:00Z', offsetMinutes: 570, dst: true },
  { fromUtc: '1956-09-29T14:30:00Z', offsetMinutes: 510, dst: false },
  { fromUtc: '1957-05-04T15:30:00Z', offsetMinutes: 570, dst: true },
  { fromUtc: '1957-09-21T14:30:00Z', offsetMinutes: 510, dst: false },
  { fromUtc: '1958-05-03T15:30:00Z', offsetMinutes: 570, dst: true },
  { fromUtc: '1958-09-20T14:30:00Z', offsetMinutes: 510, dst: false },
  { fromUtc: '1959-05-02T15:30:00Z', offsetMinutes: 570, dst: true },
  { fromUtc: '1959-09-19T14:30:00Z', offsetMinutes: 510, dst: false },
  { fromUtc: '1960-04-30T15:30:00Z', offsetMinutes: 570, dst: true },
  { fromUtc: '1960-09-17T14:30:00Z', offsetMinutes: 510, dst: false },
  { fromUtc: '1961-08-09T15:30:00Z', offsetMinutes: 540, dst: false }, // 1961-08-10 UTC+9 복귀
  { fromUtc: '1987-05-09T17:00:00Z', offsetMinutes: 600, dst: true },
  { fromUtc: '1987-10-10T17:00:00Z', offsetMinutes: 540, dst: false },
  { fromUtc: '1988-05-07T17:00:00Z', offsetMinutes: 600, dst: true },
  { fromUtc: '1988-10-08T17:00:00Z', offsetMinutes: 540, dst: false },
];
