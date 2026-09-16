# 퍼뜩 데이터 노드 플랫폼

회원용 데이터 노드 화면과 운영자용 관리 화면을 분리한 신규 프로젝트입니다.
기존 퍼뜩 레포와 기존 Supabase 프로젝트는 이 프로젝트에서 사용하지 않습니다.

## 화면

- 회원 화면: `/`
- 관리자 화면: `/admin/`

현재 회원가입·로그인·세션 복원은 신규 Supabase 프로젝트의 인증과 연결되어 있습니다. 인증 완료 뒤 프로필·지갑·작업내역·알림은 본인 계정 범위에서 읽습니다.
업무 실행, 검수 확정, 원장 반영, KYC·입출금 처리는 서버 검증 API가 연결된 뒤에만 실제 상태를 변경하도록 보호되어 있습니다.

회원가입 시 `private.handle_new_putduk_user()` 트리거가 공개 회원번호와 비공개 프로필, 초기 지갑 행, 활성 지원금 캠페인을 준비합니다. 기존 퍼뜩 프로젝트와는 분리된 신규 프로젝트입니다.

### 개발 전 점검

- Supabase 대시보드에서 이메일 인증·리디렉션 URL을 운영 도메인에 맞게 설정합니다.
- `private` 스키마의 RLS 경고와 `public.rls_auto_enable()` 실행 권한을 검토한 뒤 운영 정책을 적용합니다.
- 운영자 화면은 관리자 인증·권한별 서버 API를 연결하고 점검한 뒤 공개하세요.

## 기술 기준

버전과 이관 순서는 [기술 기준 문서](docs/toolchain.md)에 고정했습니다. 현재 정적 출시 셸은 유지하면서 Node.js 24 LTS, pnpm 12, Turborepo 기반 워크스페이스로 단계적으로 옮깁니다.

```bash
corepack pnpm@12.4.2 install --frozen-lockfile
corepack pnpm@12.4.2 verify
```

## 기술 기준

버전과 이관 순서는 [기술 기준 문서](docs/toolchain.md)에 고정했습니다. 현재 정적 출시 셸은 유지하면서 Node.js 24 LTS, pnpm 12, Turborepo 기반 워크스페이스로 단계적으로 옮깁니다.

```bash
corepack pnpm@12.4.2 install --frozen-lockfile
corepack pnpm@12.4.2 verify
```
