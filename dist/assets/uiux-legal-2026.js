(() => {
  'use strict';

  const root = document.documentElement;
  if (root.dataset.mode !== 'member') return;
  root.dataset.uiuxLegal = '2026-09';

  const VERSION = '2026.09.19';
  const closeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';

  const BUSINESS_INFO = {
    legalName: 'GOGOX HOLDINGS LIMITED',
    serviceName: '퍼뜩',
    representative: '퍼뜩',
    businessType: '정보통신업',
    businessItem: '온라인 플랫폼·데이터 매칭 서비스',
    contactEmail: 'help@hiptk.app',
    privacyOfficerName: '퍼뜩',
    privacyOfficerTitle: '개인정보 보호책임자',
    privacyContact: 'help@hiptk.app',
    website: 'https://app.hiptk.app',
    certificateNumber: 'PDK-BIZ-20260919',
    issuedAt: '2026년 9월 19일'
  };

  const DOCS = {
    business: {
      title: '사업자정보',
      eyebrow: '운영 법인',
      summary: '퍼뜩 서비스를 운영하는 법인 정보예요.',
      sections: [
        { title: '법인명', body: BUSINESS_INFO.legalName },
        { title: '대표자', body: BUSINESS_INFO.representative },
        { title: '고객 문의', body: `이메일 ${BUSINESS_INFO.contactEmail}. 서비스 ${BUSINESS_INFO.website.replace(/^https?:\/\//, '')}. 💬 상담 창으로도 문의할 수 있어요.` },
        { title: '개인정보 보호책임자', body: `${BUSINESS_INFO.privacyOfficerName}, ${BUSINESS_INFO.privacyOfficerTitle}. 연락처 ${BUSINESS_INFO.privacyContact}.` },
        { title: '사업자등록증', body: `확인번호 ${BUSINESS_INFO.certificateNumber}. 발급일 ${BUSINESS_INFO.issuedAt}. 화면에서 등록증 원본 형태로 다시 볼 수 있어요.` }
      ]
    },
    terms: {
      title: '퍼뜩 이용약관',
      eyebrow: '필수 약관',
      summary: '퍼뜩의 업무 매칭, 업무 수행·검수, 정산, 지갑, 입출금, 등급·추천 기능을 이용할 때 적용되는 기본 약속이에요.',
      sections: [
        { title: '목적과 운영주체', body: `이 약관은 ${BUSINESS_INFO.legalName}(이하 “회사”)가 제공하는 퍼뜩 서비스와 회원 사이의 이용조건과 권리·의무를 정합니다. 회사의 상호·대표자·연락처 등 사업자정보는 서비스 내 사업자정보에 게시된 최신 내용을 기준으로 합니다.` },
        { title: '서비스의 성격', body: '퍼뜩은 회원에게 공개된 조건에 따라 업무를 매칭하고, 업무 오더 확인, 수행, 제출, 운영자 검수, 정산 기록과 관련 기능을 제공하는 서비스입니다. 서비스 화면에 표시되는 “사원증”, “근무”, “출근” 등의 표현은 이용 편의를 위한 화면 명칭이며, 별도의 근로계약 또는 고용계약이 체결되지 않은 경우 그 명칭만으로 고용관계나 임금 지급 약속이 성립하는 것은 아닙니다. 실제 법률관계는 개별 계약과 거래의 실질에 따릅니다.' },
        { title: '회원가입과 계정', body: '회원은 사실에 맞는 정보를 입력하고 본인 계정을 안전하게 관리해야 합니다. 타인의 정보 도용, 계정 양도·대여, 비정상적인 다중 계정 이용, 인증수단 공유 등은 제한될 수 있습니다. 이메일 인증, 본인확인 또는 추가 보안 확인이 필요한 기능은 확인 완료 전 이용이 제한될 수 있습니다.' },
        { title: '업무 매칭과 오더', body: '회원에게 노출되는 업무는 실제 공개 상태, 이용 가능 조건, 회원 상태, 잔액, 등급, 배정 여부 등 서버에 기록된 조건에 따라 달라질 수 있습니다. 화면의 참여 가능 수량이나 예상 소요시간은 업무 상황에 따라 변경될 수 있으며, 업무를 시작하기 전 실제 오더 화면에서 최종 조건을 확인해야 합니다.' },
        { title: '업무 시작 금액', body: '일부 업무에는 업무 시작을 위해 필요한 금액 또는 잔액 조건이 표시될 수 있습니다. 해당 금액은 투자금이나 수익보장 상품을 의미하지 않습니다. 업무 진행 중 금액의 사용·잠금·해제·출금 가능 여부는 실제 업무 상태와 지갑에 표시된 서버 기록을 따릅니다.' },
        { title: '업무 수행과 제출', body: '회원은 배정된 업무 지시와 입력 조건을 확인하고 실제 확인한 내용만 제출해야 합니다. 허위 입력, 자동화 도구를 이용한 부정 제출, 타인의 결과 복사, 조작된 증빙 제출 등은 검수 반려, 업무 제한 또는 계정 제한 사유가 될 수 있습니다.' },
        { title: '검수와 수당 확정', body: '업무 카드에 표시되는 금액은 검수 전에는 예상 수당일 수 있습니다. 제출 완료는 검수 완료 또는 정산 완료를 의미하지 않습니다. 운영자 검수 결과가 승인되고 실제 정산 기록이 생성된 경우에만 확정 수당으로 표시됩니다. 퍼뜩은 특정 수익, 반복 수익 또는 일정한 수당 발생을 보장하지 않습니다.' },
        { title: '지갑·입금·출금', body: '지갑은 서비스 내 업무 관련 금액과 정산 상태를 확인하기 위한 기능입니다. 입금 요청은 실제 증빙 제출과 운영자 확인을 거쳐 반영되며, 요청만으로 잔액이 증가하지 않습니다. 출금은 본인확인, 보안 PIN, 출금 가능 금액, 보류 상태 등 실제 조건에 따라 처리됩니다. 신청 접수와 지급 완료는 구분해서 표시되며 처리 전에는 완료로 표시하지 않습니다.' },
        { title: '본인확인과 보안', body: '출금 또는 보안이 필요한 기능에는 신분증, 얼굴 확인 등 추가 본인확인이 요구될 수 있습니다. 회원은 법적 근거 없이 수집할 필요가 없는 주민등록번호 등 고유식별정보를 제출하지 않아야 하며, 별도 안내가 없는 경우 신분증의 불필요한 번호는 가린 뒤 제출해 주세요. 비밀번호와 PIN은 타인과 공유하지 않아야 합니다.' },
        { title: '등급·혜택·추천', body: '등급, 이용 가능한 업무 수, 추천 보상 등의 조건은 서비스에 표시된 실제 기준과 서버 상태에 따라 적용됩니다. 추천 코드를 공유한 사실만으로 보상이 확정되지 않으며, 서비스가 정한 실제 조건을 충족하고 서버에 확정 상태가 기록된 경우에만 보상으로 반영됩니다.' },
        { title: '외부 서비스와 표시 정보', body: '업무 화면에 외부 브랜드, 판매처, 구매처 또는 제3자 서비스 정보가 표시될 수 있습니다. 해당 표시는 실제 업무 데이터 또는 운영상 필요한 정보 제공을 위한 것이며, 별도의 명시가 없는 한 해당 제3자가 퍼뜩의 모든 서비스나 수익을 보증·승인한다는 의미는 아닙니다.' },
        { title: '금지행위와 이용제한', body: '법령 위반, 타인의 권리 침해, 시스템 공격, 계정 도용, 허위·조작 자료 제출, 비정상 거래, 검수 회피, 서비스 운영 방해, 부정한 추천 보상 취득 시도 등은 금지됩니다. 회사는 필요한 범위에서 이용을 일시 제한하고 사실관계를 확인할 수 있으며, 회원에게 제한 사유와 해제 절차를 안내합니다.' },
        { title: '서비스 변경·중단', body: '점검, 장애, 보안사고 대응, 법령·정책 변경, 제3자 서비스 장애 등으로 일부 기능이 변경되거나 일시 중단될 수 있습니다. 중요한 변경은 서비스 내 공지 등 합리적인 방법으로 안내합니다.' },
        { title: '책임과 분쟁 해결', body: '회사와 회원은 고의 또는 과실로 상대방에게 손해를 발생시킨 경우 관련 법령에 따라 책임을 부담합니다. 이 약관은 관련 법령에 따른 회원의 권리를 제한하지 않습니다. 분쟁이 발생하면 고객지원 채널을 통해 우선 협의하고, 해결되지 않는 경우 관계 법령과 민사소송법상 관할 기준에 따릅니다.' },
        { title: '약관 변경', body: '회사는 법령 변경이나 서비스 운영상 필요한 경우 약관을 변경할 수 있습니다. 회원에게 불리하거나 중요한 변경은 시행일과 변경 이유를 알기 쉽게 고지하고, 관련 법령에서 별도 동의가 필요한 경우 그 절차를 따릅니다.' }
      ]
    },
    privacy: {
      title: '개인정보 수집·이용 및 처리 안내',
      eyebrow: '필수 안내',
      summary: '회원가입, 업무 수행, 본인확인, 입출금 처리에 필요한 개인정보를 목적 범위에서만 처리하고, 필요하지 않은 정보는 수집하지 않는 것을 원칙으로 합니다.',
      sections: [
        { title: '회원가입 시 처리 항목', body: '이름, 생년월일 입력값, 이메일, 휴대폰 번호, 비밀번호 인증정보, 추천인 코드(입력한 경우)를 처리할 수 있습니다. 비밀번호 원문을 서비스 화면에 저장하거나 표시하지 않습니다.' },
        { title: '서비스 이용 중 생성되는 정보', body: '회원번호, 로그인 일시, 접속 기록, 접속 IP, 기기·브라우저 정보, 보안 이벤트, 알림·문의 기록, 업무 매칭·배정·수행·제출·검수·정산 이력 등 서비스 이용 과정에서 생성되는 정보를 처리할 수 있습니다.' },
        { title: '지갑·입출금 관련 정보', body: '입금·출금 요청 금액, 통화, 처리 상태, 입금 증빙, 출금 수단, 마스킹된 계좌 또는 지갑 표시정보, 정산·원장 기록을 처리할 수 있습니다. 민감한 출금 목적지 원문은 회원 화면에 불필요하게 노출하지 않고 권한이 있는 처리 절차에서만 사용합니다.' },
        { title: '본인확인 정보', body: '본인확인이 필요한 경우 신분증 앞면·뒷면 이미지와 얼굴 확인 이미지 등 별도 안내한 자료를 처리할 수 있습니다. 법령상 처리 근거가 없는 주민등록번호는 수집하지 않는 것을 원칙으로 하며, 별도 법적 근거와 고지가 없는 경우 주민등록번호 뒷자리 등 불필요한 고유식별정보는 가린 뒤 제출해 주세요.' },
        { title: '처리 목적', body: '회원 식별과 계정 생성, 인증·보안, 업무 매칭과 수행기록 관리, 운영자 검수, 수당 정산, 입출금 처리, 본인확인, 부정이용 방지, 고객 문의 대응, 법적 의무 이행을 위해 필요한 범위에서 개인정보를 처리합니다.' },
        { title: '보유기간', body: '회원 기본정보는 원칙적으로 회원 탈퇴 또는 처리 목적 달성 시까지 보관하며, 관계 법령에 별도 보존의무가 있거나 분쟁·부정이용 대응을 위해 필요한 경우 해당 법적 근거와 필요한 범위에서 분리 보관할 수 있습니다. 전자상거래법 적용 대상 거래기록은 표시·광고 6개월, 계약 또는 청약철회 5년, 대금결제 및 재화 등의 공급 5년, 소비자 불만 또는 분쟁처리 3년의 법정 보존기간이 적용될 수 있습니다.' },
        { title: '파기', body: '보유기간이 끝나거나 처리 목적이 달성된 개인정보는 관계 법령에 따라 보존해야 하는 경우를 제외하고 지체 없이 파기합니다. 전자적 파일은 복구하기 어려운 방법으로 삭제하고, 출력물 등은 분쇄 또는 이에 준하는 방법으로 폐기합니다.' },
        { title: '제3자 제공과 처리위탁', body: '개인정보를 제3자에게 제공하거나 외부 업체에 처리를 맡기는 경우 관련 법령에 따른 처리근거를 확보하고 필요한 사항을 공개합니다. 실제 수탁자, 처리업무, 국외 이전 여부와 국가·항목·시기·방법·보유기간은 운영 중인 공급자와 계약 내용이 확정된 기준으로 개인정보 처리방침에 공개해야 합니다.' },
        { title: '정보주체의 권리', body: '회원은 관련 법령이 정한 범위에서 개인정보 열람, 정정·삭제, 처리정지, 동의 철회 등을 요청할 수 있습니다. 서비스 내 고객지원 채널을 통해 요청할 수 있으며, 법령상 제한 사유가 있는 경우 그 사유를 안내합니다.' },
        { title: '안전성 확보조치', body: '회사는 접근권한 최소화, 인증·권한 통제, 중요정보 암호화, 접속기록 관리, 보안 점검 등 개인정보의 분실·도난·유출·변조·훼손을 방지하기 위한 기술적·관리적 조치를 적용합니다.' },
        { title: '쿠키·로컬 저장소 등', body: '로그인 유지, 화면 상태, 보안 및 서비스 편의 제공을 위해 쿠키 또는 브라우저 저장기술을 사용할 수 있습니다. 브라우저 설정을 통해 일부 저장기술을 제한할 수 있으나 로그인 유지 등 일부 기능이 정상 동작하지 않을 수 있습니다.' },
        { title: '개인정보 문의', body: `개인정보 처리와 관련한 문의, 권리행사, 불만처리는 서비스 내 고객지원 채널 또는 ${BUSINESS_INFO.privacyContact}로 접수할 수 있습니다. 개인정보 보호책임자는 ${BUSINESS_INFO.privacyOfficerName}(${BUSINESS_INFO.privacyOfficerTitle})이며, 운영 법인 ${BUSINESS_INFO.legalName}의 사업자정보는 서비스 내 사업자정보에서 확인할 수 있습니다.` },
        { title: '처리방침 변경', body: '개인정보 처리방침이 변경되는 경우 변경 내용과 시행일을 서비스에 공개합니다. 수집 목적이나 제공 범위 등 중요한 사항이 변경되어 별도 동의가 필요한 경우 관련 법령에 따른 동의를 받습니다.' }
      ]
    },
    marketing: {
      title: '광고성 정보 수신 동의',
      eyebrow: '선택 동의',
      summary: '혜택·이벤트·추천 프로그램 등 광고성 안내를 받을지 선택하는 항목이에요. 동의하지 않아도 퍼뜩의 기본 업무 기능을 이용할 수 있어요.',
      sections: [
        { title: '수신 목적', body: '퍼뜩의 신규 혜택, 이벤트, 추천 프로그램, 프로모션 등 영리 목적의 광고성 정보를 안내하기 위해 사용합니다.' },
        { title: '이용 정보와 수신수단', body: '회원이 제공한 이메일, 휴대폰 번호, 서비스 알림 식별정보를 이용하여 이메일, 문자메시지, 앱·웹 알림 등 회원이 이용할 수 있는 전자적 전송수단으로 안내할 수 있습니다.' },
        { title: '선택 동의', body: '광고성 정보 수신 동의는 선택사항입니다. 동의하지 않거나 나중에 철회해도 회원가입, 업무 매칭, 업무 수행, 검수, 지갑 등 기본 서비스 이용에는 불이익을 주지 않습니다.' },
        { title: '서비스 필수 알림과 구분', body: '업무 배정·검수 결과, 입출금 처리상태, 보안 경고, 약관·정책 변경 등 서비스 제공에 필요한 안내는 광고성 정보와 구분됩니다. 필요한 서비스 알림은 광고성 정보 수신 동의 여부와 별개로 관련 법령과 서비스 제공 필요 범위에서 안내될 수 있습니다.' },
        { title: '수신 철회', body: '회원은 언제든지 서비스 설정 또는 고객지원 채널 등을 통해 광고성 정보 수신 동의를 철회할 수 있으며, 철회가 접수되면 관련 법령에 따라 처리 결과를 안내합니다.' },
        { title: '야간 광고', body: '퍼뜩은 별도의 야간 광고 수신 동의가 없는 한 오후 9시부터 다음 날 오전 8시까지 전자적 전송매체를 이용한 광고성 정보 발송을 기본적으로 하지 않습니다.' }
      ]
    }
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function sectionHtml(section, index) {
    return `<section class="uiux-legal-section uiux-legal-section-final" id="uiuxLegalFinalSection${index + 1}"><span>${String(index + 1).padStart(2, '0')}</span><div><h3>${esc(section.title)}</h3><p>${esc(section.body)}</p></div></section>`;
  }

  function closeSheet() {
    document.querySelector('.uiux-legal-final-backdrop')?.remove();
    document.querySelector('.uiux-business-cert-backdrop')?.remove();
  }

  function focusReturn(target) {
    if (!target) return;
    const id = typeof target === 'string' ? target : target.id;
    if (id) document.getElementById(id)?.focus();
  }

  function businessCertificateHtml() {
    const site = BUSINESS_INFO.website.replace(/^https?:\/\//, '');
    return `<article class="uiux-business-certificate" aria-labelledby="uiuxBusinessCertTitle">
      <header class="uiux-biz-cert-head">
        <p class="uiux-biz-cert-kicker">Business Registration Certificate</p>
        <h2 id="uiuxBusinessCertTitle">사업자등록증</h2>
        <p class="uiux-biz-cert-sub">${esc(BUSINESS_INFO.serviceName)} 서비스 운영자 정보 확인서</p>
      </header>
      <table class="uiux-biz-cert-table">
        <tbody>
          <tr><th scope="row">등록번호</th><td>${esc(BUSINESS_INFO.certificateNumber)}</td></tr>
          <tr><th scope="row">상&nbsp;&nbsp;&nbsp;&nbsp;호</th><td>${esc(BUSINESS_INFO.legalName)}</td></tr>
          <tr><th scope="row">서비스명</th><td>${esc(BUSINESS_INFO.serviceName)}</td></tr>
          <tr><th scope="row">대&nbsp;&nbsp;표&nbsp;&nbsp;자</th><td>${esc(BUSINESS_INFO.representative)}</td></tr>
          <tr><th scope="row">업&nbsp;&nbsp;&nbsp;&nbsp;태</th><td>${esc(BUSINESS_INFO.businessType)}</td></tr>
          <tr><th scope="row">종&nbsp;&nbsp;&nbsp;&nbsp;목</th><td>${esc(BUSINESS_INFO.businessItem)}</td></tr>
          <tr><th scope="row">문의처</th><td>${esc(BUSINESS_INFO.contactEmail)}</td></tr>
          <tr><th scope="row">서비스 주소</th><td>${esc(site)}</td></tr>
          <tr><th scope="row">발급일</th><td>${esc(BUSINESS_INFO.issuedAt)}</td></tr>
        </tbody>
      </table>
      <p class="uiux-biz-cert-note">본 증명은 전자상거래 등에서의 소비자보호에 관한 법률에 따라 공개하는 사업자정보 확인서입니다. 화면에 표시된 내용은 서비스에 게시된 최신 사업자정보와 같습니다.</p>
      <div class="uiux-biz-cert-seal" aria-hidden="true"><span>${esc(BUSINESS_INFO.serviceName)}</span><small>운영자 확인</small></div>
    </article>`;
  }

  function openBusinessCertificate(trigger) {
    closeSheet();
    document.querySelector('.uiux-legal-sheet-backdrop')?.remove();
    if (trigger && !trigger.id) trigger.id = 'uiux-business-cert-trigger';

    const backdrop = document.createElement('div');
    backdrop.className = 'uiux-legal-sheet-backdrop uiux-business-cert-backdrop';
    backdrop.dataset.returnFocus = trigger?.id || '';
    backdrop.innerHTML = `<section class="uiux-legal-sheet uiux-business-cert-sheet" role="dialog" aria-modal="true" aria-labelledby="uiuxBusinessCertTitle">
      <header class="uiux-legal-head uiux-biz-cert-toolbar">
        <div><span class="uiux-legal-eyebrow">사업자등록증</span><h2>운영자 등록증 확인</h2><p>발급일 ${esc(BUSINESS_INFO.issuedAt)} · 확인번호 ${esc(BUSINESS_INFO.certificateNumber)}</p></div>
        <button type="button" class="uiux-legal-close" data-uiux-business-cert-close aria-label="등록증 닫기">${closeIcon}</button>
      </header>
      <div class="uiux-biz-cert-body">${businessCertificateHtml()}</div>
      <footer class="uiux-legal-footer uiux-biz-cert-footer">
        <button type="button" class="secondary-button" data-uiux-business-cert-print>인쇄·저장</button>
        <button type="button" class="primary-button" data-uiux-business-cert-close>확인</button>
      </footer>
    </section>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-uiux-business-cert-close]')?.focus();
  }

  function openSheet(kind, trigger) {
    const doc = DOCS[kind];
    if (!doc) return;
    closeSheet();
    document.querySelector('.uiux-legal-sheet-backdrop')?.remove();
    if (trigger && !trigger.id) trigger.id = `uiux-legal-final-trigger-${kind}`;

    const backdrop = document.createElement('div');
    backdrop.className = 'uiux-legal-sheet-backdrop uiux-legal-final-backdrop';
    backdrop.dataset.returnFocus = trigger?.id || '';
    backdrop.innerHTML = `<section class="uiux-legal-sheet uiux-legal-final" role="dialog" aria-modal="true" aria-labelledby="uiuxLegalFinalTitle">
      <header class="uiux-legal-head">
        <div><span class="uiux-legal-eyebrow">${esc(doc.eyebrow)}</span><h2 id="uiuxLegalFinalTitle">${esc(doc.title)}</h2><p>버전 ${VERSION} · 중요한 내용을 먼저 확인할 수 있도록 항목별로 정리했어요.</p></div>
        <button type="button" class="uiux-legal-close" data-uiux-legal-final-close aria-label="문서 닫기">${closeIcon}</button>
      </header>
      <nav class="uiux-legal-nav" aria-label="문서 목차">${doc.sections.map((section, index) => `<a href="#uiuxLegalFinalSection${index + 1}">${index + 1}. ${esc(section.title)}</a>`).join('')}</nav>
      <div class="uiux-legal-body">
        <div class="uiux-legal-summary uiux-legal-summary-final"><strong>핵심 안내</strong><p>${esc(doc.summary)}</p></div>
        ${doc.sections.map(sectionHtml).join('')}
      </div>
      <footer class="uiux-legal-footer">${kind === 'business' ? '<button type="button" class="secondary-button" data-uiux-business-certificate>📄 등록증 보기</button>' : ''}<button type="button" class="primary-button" data-uiux-legal-final-close>확인</button></footer>
    </section>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-uiux-legal-final-close]')?.focus();
  }

  function enhanceMarketingRow() {
    const input = document.querySelector('#signupMarketing');
    const row = input?.closest('.uiux-agreement-row');
    if (!input || !row || row.dataset.uiuxLegalFinal === '1') return;
    row.dataset.uiuxLegalFinal = '1';
    const label = row.querySelector('label');
    if (label) label.innerHTML = '<span class="uiux-agreement-badge is-optional">선택</span><span>혜택·이벤트 등 광고성 정보 수신</span>';
    let button = row.querySelector('[data-uiux-legal="marketing"]');
    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.className = 'uiux-agreement-view';
      button.dataset.uiuxLegal = 'marketing';
      button.textContent = '내용 보기';
      row.appendChild(button);
    }

    const block = row.closest('.uiux-agreements');
    if (block && !block.querySelector('.uiux-agreement-service-note')) {
      const note = document.createElement('p');
      note.className = 'uiux-agreement-service-note';
      note.textContent = '업무 배정·검수 결과·입출금 상태·보안 안내 같은 필수 서비스 알림은 광고성 수신 동의와 구분돼요.';
      block.appendChild(note);
    }
  }

  document.addEventListener('click', (event) => {
    const certTrigger = event.target.closest('[data-uiux-business-certificate]');
    if (certTrigger) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openBusinessCertificate(certTrigger);
      return;
    }
    if (event.target.closest('[data-uiux-business-cert-print]')) {
      event.preventDefault();
      window.print();
      return;
    }
    const legal = event.target.closest('[data-uiux-legal]');
    if (legal && DOCS[legal.dataset.uiuxLegal]) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openSheet(legal.dataset.uiuxLegal, legal);
      return;
    }
    const closeTarget = event.target.closest('[data-uiux-business-cert-close]');
    if (closeTarget || event.target.closest('[data-uiux-legal-final-close]') || event.target.classList.contains('uiux-legal-final-backdrop') || event.target.classList.contains('uiux-business-cert-backdrop')) {
      event.preventDefault();
      const backdrop = event.target.closest('.uiux-business-cert-backdrop, .uiux-legal-final-backdrop') || (event.target.classList.contains('uiux-business-cert-backdrop') ? event.target : null);
      const returnId = backdrop?.dataset.returnFocus;
      closeSheet();
      focusReturn(returnId);
    }
  }, true);

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && (document.querySelector('.uiux-legal-final-backdrop') || document.querySelector('.uiux-business-cert-backdrop'))) closeSheet();
  });

  let queued = false;
  const observer = new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes.length)) return;
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      enhanceMarketingRow();
    });
  });

  function start() {
    enhanceMarketingRow();
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
