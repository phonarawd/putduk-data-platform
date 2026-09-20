(() => {
  'use strict';

  const facts = {
    about: {
      title: '퍼뜩은 어떤 서비스인가요?',
      lead: '퍼뜩은 공개된 온라인 업무를 확인·선택·수행·제출하고, 검수와 정산 상태를 한곳에서 확인하는 플랫폼입니다.',
      sections: [
        ['서비스 구조', ['회원은 로그인 후 실제 공개 업무와 참여 조건을 확인합니다.', '업무를 제출하면 운영 검수를 거쳐 승인·재확인·반려 상태가 기록됩니다.', '승인된 완료 수당은 출금 가능 금액에 별도로 반영됩니다.']],
        ['가입 전에 확인할 점', ['가입 전 화면의 업무 카드는 이용 예시입니다.', '실제 공개 업무, 자리, 참여 조건과 수당은 로그인 후 업무별 화면에서 확인해야 합니다.', '퍼뜩은 확인되지 않은 이용자 수·완료 수·후기를 실제 사실처럼 표시하지 않습니다.']]
      ]
    },
    'how-it-works': {
      title: '업무는 이렇게 진행됩니다',
      lead: '공고 지원과 채용 대기 대신, 공개된 업무의 조건을 확인하고 선택합니다.',
      steps: ['업무와 참여 조건 확인', '업무 선택 및 실제 수행', '결과 제출', '운영 검수', '승인 상태와 완료 수당 확인'],
      sections: [['검수 상태', ['승인: 제출 결과가 기준을 충족해 정산에 반영된 상태', '재확인: 수정 또는 추가 확인이 필요한 상태', '반려: 업무 기준을 충족하지 못한 상태']]]
    },
    'trial-work': {
      title: '첫 업무는 비용 부담 없이 경험합니다',
      lead: '신규 회원에게 체험 업무가 제공되는 경우, 퍼뜩이 지원하는 첫 업무로 제출·검수·수당 흐름을 먼저 경험합니다.',
      sections: [
        ['첫 체험 원칙', ['첫 체험 업무를 시작하기 위해 회원에게 선입금을 요구하지 않습니다.', '체험 업무도 실제 제출과 운영 검수를 거칩니다.', '승인되면 해당 업무에 표시된 완료 수당이 출금 가능 금액에 반영됩니다.']],
        ['그 다음', ['일반 업무의 업무 보증금과 정산 구조는 첫 체험 승인 뒤 안내합니다.', '일반 업무 조건은 업무마다 다를 수 있으므로 시작 전에 개별 조건을 확인해야 합니다.']]
      ]
    },
    'fees-and-settlement': {
      title: '금액과 정산은 업무별로 확인합니다',
      lead: '시작 전 표시된 조건과 서버 원장에 기록된 상태를 기준으로 처리합니다.',
      sections: [
        ['완료 수당', ['업무별 완료 수당은 업무 상세 화면에서 원화 전체 금액으로 표시합니다.', '제출만으로 확정되지 않으며 운영 검수 승인 후 출금 가능 금액에 반영됩니다.']],
        ['일반 업무의 업무 보증금', ['일반 업무 참여 중 업무 잔액에서 잠길 수 있습니다.', '승인된 정상 완료 시 업무 잔액으로 복귀하고, 완료 수당은 별도로 반영됩니다.', '체험 업무에는 회원 선입금을 요구하지 않습니다.']],
        ['출금', ['출금 가능 금액과 신청 상태는 회원 지갑에서 확인합니다.', '적용 가능한 본인확인·출금 조건은 신청 화면의 최신 안내를 우선합니다.']]
      ]
    },
    faq: {
      title: '자주 묻는 질문',
      lead: '가입이나 업무 시작 전에 가장 많이 확인하는 내용을 실제 운영 흐름 기준으로 정리했습니다.',
      faq: [
        ['퍼뜩은 무엇을 하는 곳인가요?', '회원이 온라인 업무를 확인·선택·수행·제출하고 검수와 정산 상태를 확인하는 플랫폼입니다.'],
        ['첫 업무 전에 돈을 입금해야 하나요?', '신규 회원용 체험 업무가 제공되는 경우, 그 체험을 시작하기 위한 회원 선입금은 요구하지 않습니다.'],
        ['가입 전에도 실제 업무를 볼 수 있나요?', '가입 전에는 업무 유형의 예시와 이용 흐름을 볼 수 있습니다. 실제 공개 업무와 참여 조건은 로그인 후 확인합니다.'],
        ['제출하면 바로 수당이 확정되나요?', '아닙니다. 제출 결과가 운영 검수를 통과해 승인된 뒤 완료 수당이 출금 가능 금액에 반영됩니다.'],
        ['일반 업무의 금액은 어떻게 처리되나요?', '업무별 참여 조건을 먼저 확인해야 합니다. 업무 보증금이 있는 일반 업무는 진행 중 잠기고 정상 완료 시 업무 잔액으로 돌아오며, 완료 수당은 별도로 반영됩니다.'],
        ['개인정보나 금융정보를 보내도 되나요?', '공식 화면에서 목적과 필수 여부가 안내된 정보만 제공하세요. 채팅이나 외부 연락으로 비밀번호·인증번호를 요구받으면 제공하지 마세요.']
      ]
    },
    company: {
      title: '운영 정보와 확인 원칙',
      lead: '공식 서비스 주소와 문의 경로를 한곳에서 확인할 수 있습니다.',
      sections: [
        ['공식 서비스', ['회원 서비스: https://app.hiptk.app', '운영자 화면은 회원에게 공개되는 업무 실행 화면이 아닙니다.', '서비스 문의는 공식 화면에 제공되는 문의 채널을 이용합니다.']],
        ['정보 공개 원칙', ['확인되지 않은 사업 실적이나 제휴 관계를 표시하지 않습니다.', '법정 사업자 식별 정보는 운영자가 증빙을 확인한 값만 공개해야 합니다.', '현재 이 페이지에 표시되지 않은 회사 정보는 추정하지 않습니다.']]
      ]
    },
    terms: {
      title: '이용 원칙',
      lead: '회원은 업무 시작 전에 각 업무의 조건과 검수 기준을 확인해야 합니다.',
      sections: [
        ['회원의 책임', ['본인이 수행한 정확한 결과를 제출합니다.', '타인의 계정이나 자료를 무단 사용하지 않습니다.', '업무 자료와 개인정보를 업무 목적 밖으로 이용하지 않습니다.']],
        ['플랫폼의 처리', ['제출·검수·정산 상태를 기록합니다.', '오류 또는 부정 제출은 재확인이나 반려될 수 있습니다.', '화면에 표시된 최신 개별 업무 조건이 해당 업무에 우선 적용됩니다.']],
        ['중요 안내', ['이 페이지는 공개 핵심 원칙 요약입니다.', '회원가입 과정에 제시되는 최신 이용약관과 동의 화면을 함께 확인해야 합니다.']]
      ]
    },
    privacy: {
      title: '개인정보 처리 안내',
      lead: '서비스 제공에 필요한 정보만 목적과 범위를 안내한 뒤 처리해야 합니다.',
      sections: [
        ['기본 원칙', ['계정 생성·본인확인·정산·고객지원에 필요한 정보가 처리될 수 있습니다.', '개인별 업무·지갑·알림 정보는 로그인한 본인 범위에서만 제공됩니다.', '비밀번호와 인증번호는 채팅이나 외부 연락으로 전달하지 마세요.']],
        ['권리와 문의', ['개인정보 관련 요청은 공식 서비스 문의 채널을 이용합니다.', '구체적인 수집 항목·보유 기간·제3자 제공 여부는 가입 및 해당 기능의 최신 동의 화면을 확인합니다.']]
      ]
    },
    'refund-and-dispute': {
      title: '환불·오류·분쟁 처리',
      lead: '금액 또는 업무 상태에 이견이 있으면 원장과 검수 기록을 기준으로 확인합니다.',
      sections: [
        ['문의할 때 필요한 정보', ['회원 계정에서 확인되는 업무명과 실행번호', '제출·검수 상태와 발생 시각', '지갑 또는 신청 내역에 표시된 금액']],
        ['처리 원칙', ['중복 처리나 시스템 오류 여부를 서버 기록으로 확인합니다.', '업무 결과 이견은 해당 업무의 검수 기준과 제출 기록을 확인합니다.', '확인되지 않은 외부 계좌나 개인 연락처로 추가 송금을 요구하지 않습니다.']]
      ]
    }
  };

  const key = location.pathname.replace(/^\/+|\/+$/g, '') || 'about';
  const page = facts[key] || facts.about;
  const canonical = 'https://app.hiptk.app/' + (facts[key] ? key : 'about');
  document.title = page.title + ' | 퍼뜩';
  document.querySelector('link[rel="canonical"]').href = canonical;
  document.querySelector('meta[name="description"]').content = page.lead;

  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const sectionMarkup = (page.sections || []).map(([title, items]) =>
    `<section class="panel"><h2>${esc(title)}</h2><ul>${items.map((item) => `<li>${esc(item)}</li>`).join('')}</ul></section>`
  ).join('');
  const stepsMarkup = page.steps ? `<section class="panel"><h2>이용 흐름</h2><ol class="steps">${page.steps.map((item, index) => `<li><span>${index + 1}</span>${esc(item)}</li>`).join('')}</ol></section>` : '';
  const faqMarkup = page.faq ? `<section class="faq-list">${page.faq.map(([question, answer]) => `<details><summary>${esc(question)}</summary><p>${esc(answer)}</p></details>`).join('')}</section>` : '';

  document.querySelector('#trust-content').innerHTML =
    `<section class="hero"><p class="eyebrow">퍼뜩 공식 안내</p><h1>${esc(page.title)}</h1><p>${esc(page.lead)}</p></section>${stepsMarkup}${sectionMarkup}${faqMarkup}<section class="verify"><h2>직접 확인하세요</h2><p>실제 업무와 개인별 참여 조건은 로그인 후 업무 상세 화면에서 확인할 수 있습니다.</p><a href="/">퍼뜩에서 확인하기</a></section>`;

  const graph = [
    {'@type':'Organization','@id':'https://app.hiptk.app/#organization','name':'퍼뜩','url':'https://app.hiptk.app/'},
    {'@type':'WebSite','@id':'https://app.hiptk.app/#website','url':'https://app.hiptk.app/','name':'퍼뜩','publisher':{'@id':'https://app.hiptk.app/#organization'},'inLanguage':'ko-KR'},
    {'@type':'WebPage','@id':canonical + '#webpage','url':canonical,'name':page.title,'description':page.lead,'isPartOf':{'@id':'https://app.hiptk.app/#website'},'inLanguage':'ko-KR'}
  ];
  if (page.faq) graph.push({'@type':'FAQPage','@id':canonical + '#faq','mainEntity':page.faq.map(([q,a]) => ({'@type':'Question','name':q,'acceptedAnswer':{'@type':'Answer','text':a}}))});
  const structured = document.createElement('script');
  structured.type = 'application/ld+json';
  structured.textContent = JSON.stringify({'@context':'https://schema.org','@graph':graph});
  document.head.appendChild(structured);
})();