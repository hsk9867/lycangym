# 라이칸짐 연수점 배포 — Cloudflare(정적) + Supabase(관리자·통계) + 호스팅케이알 도메인(라이칸짐.com)

| 역할 | 서비스 | 비용 |
|---|---|---|
| 홈페이지 파일(HTML·CSS·JS·사진·영상) | Cloudflare Workers Static Assets | 무료 |
| 관리자 로그인 · 문구/가격/리뷰/사진 저장 · 방문 기록 | Supabase (Auth · Postgres · Storage) | 무료 플랜 |
| 도메인 라이칸짐.com (punycode `xn--oi2bw61a1wbh8g.com`) | 호스팅케이알 구매 → 네임서버를 Cloudflare 로 | 도메인 비용만 |

브라우저가 Supabase 를 **직접** 호출하므로 Cloudflare 쪽에는 서버 코드(worker.js)가 없습니다.
anon 키는 공개용이고, 쓰기 권한은 `supabase/schema.sql` 의 RLS 로 "로그인한 관리자만" 으로 막혀 있습니다.

## 1. Supabase (처음 한 번)
1. https://supabase.com → New project (이름 `lycangym`, 리전 Northeast Asia(Seoul)). DB 비밀번호는 따로 적어 두기.
2. SQL Editor → New query → `supabase/schema.sql` 내용 전체 붙여넣고 **Run**.
3. Authentication → Users → **Add user** → 사장님(또는 홍스랩) 이메일·비밀번호, *Auto Confirm User* 체크.
4. Authentication → Sign In / Providers → Email → **Allow new users to sign up 끄기** (아무나 가입 못 하게).
5. Project Settings → API 에서 `Project URL` 과 `anon public` 키를 복사해 `js/sb-config.js` 에 채운다.

## 2. Cloudflare (프로젝트 폴더 `C:\Users\홍아름\lycangym` 에서, 별도 PowerShell)
```powershell
npx wrangler login        # 홍스랩 Cloudflare 계정 (hongslab 과 같은 계정)
npx wrangler deploy       # → https://lycangym.<계정>.workers.dev
```
`wrangler.jsonc` 는 정적 자산만 올리는 설정이라 D1·시크릿이 없습니다. 파일을 고친 뒤에는 다시 `npx wrangler deploy` 만 하면 됩니다(GitHub 푸시만으로는 반영되지 않음).

## 3. 도메인 연결 (호스팅케이알 → Cloudflare)
1. Cloudflare 대시보드 → **Add a domain** → `라이칸짐.com` 입력(한글 그대로 또는 `xn--oi2bw61a1wbh8g.com`) → Free → 안내되는 네임서버 2개 확인.
2. 호스팅케이알 → 나의 서비스 → 도메인 관리 → **네임서버 변경** → Cloudflare 네임서버 2개 입력. (반영 수 분~수 시간, 호스팅케이알 기본 파킹 레코드는 Cloudflare 가 가져온 DNS 목록에서 지워도 됨)
3. Cloudflare → Workers & Pages → `lycangym` → Settings → **Domains & Routes** → Add → Custom domain → `xn--oi2bw61a1wbh8g.com` 추가, 같은 방법으로 `www.xn--oi2bw61a1wbh8g.com` 도 추가. 인증서는 자동.
4. (선택) www → 루트로 보내기: 도메인 → Rules → Redirect Rules → `www.라이칸짐.com/*` → `https://라이칸짐.com/$1` 301.
5. 주소창에 `라이칸짐.com` 을 치면 브라우저가 알아서 punycode 로 바꿔 접속합니다. 검색 등록(네이버 서치어드바이저·구글 서치콘솔)은 `https://xn--oi2bw61a1wbh8g.com/` 로 등록하고, 소유 확인은 메타태그 방식을 쓸 것(Cloudflare 가 `/x.html` 을 `/x` 로 리디렉트하므로 HTML 파일 방식은 실패).

## 4. 관리자 사용법
- 주소: `https://라이칸짐.com/admin` (검색 노출 안 됨, robots 차단).
- 탭: **방문 통계**(오늘·7일·30일 조회/방문자, 일별 막대, 페이지별, 유입 경로) · **문구** · **가격표**(헬스/필라테스) · **리뷰** · **사진**(메인 슬라이드·비포애프터·소통, 올리면 긴 변 1800px 로 줄여 Storage `site` 버킷에 저장).
- 저장하면 고객 화면은 새로고침 때 반영됩니다. "원래대로" 를 누르면 HTML 에 적힌 기본값으로 돌아갑니다.
- 비밀번호 변경·재설정: Supabase → Authentication → Users → 해당 사용자 → Reset password / 새 사용자 추가.

## 5. 운영 메모
- 방문 기록은 `visits` 테이블에 쌓입니다(개인정보 없음: 페이지, 유입 도메인, 무작위 브라우저 ID, 화면 폭). 오래된 기록 정리: SQL Editor 에서 `delete from visits where ts < now() - interval '1 year';`
- Supabase 무료 플랜은 **7일간 요청이 전혀 없으면 프로젝트가 일시정지**됩니다. 방문 기록이 매일 들어가므로 실제 운영 중엔 거의 해당되지 않지만, 정지되면 대시보드에서 Restore 를 누르면 됩니다. 정지 중에도 홈페이지 자체(Cloudflare)는 정상이고 관리자 저장값만 잠시 안 보입니다(cms.js 가 1.5초 안에 응답이 없으면 원래 문구를 보여줌).
- CSS/JS 를 고치면 `?v=` 캐시 버전을 올려야 합니다(scratchpad 의 bump.py 또는 ly_patch.py 와 같은 방식).
