import { BIRTHPLACES_SOURCE } from '@naite/saju/birthplaces';

/**
 * 사업자 정보는 전자상거래법상 사이트 하단 표시 의무 항목이다.
 * 사업자 등록·통신판매업 신고 후 실제 값으로 채운다 (docs/OWNER-TODO.md).
 */
const BUSINESS = {
  name: '(상호 준비 중)',
  ceo: '(대표자)',
  address: '(사업장 주소)',
  contact: '(연락처)',
  bizNo: '(사업자등록번호)',
  mailOrderNo: '(통신판매업 신고번호)',
};

export function Footer() {
  return (
    <footer className="footer">
      <nav>
        <span>이용약관 (준비 중)</span>
        <span>개인정보처리방침 (준비 중)</span>
      </nav>
      <p>
        {BUSINESS.name} · 대표 {BUSINESS.ceo} · {BUSINESS.address} · {BUSINESS.contact}
        <br />
        사업자등록번호 {BUSINESS.bizNo} · 통신판매업 신고 {BUSINESS.mailOrderNo}
      </p>
      <p>출생지 좌표: {BIRTHPLACES_SOURCE.provider}</p>
    </footer>
  );
}
