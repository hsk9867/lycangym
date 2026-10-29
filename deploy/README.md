# 라이칸짐 연수점 배포 — Cloudflare Workers(정적 + D1) + 호스팅케이알 도메인(라이칸짐.com)

| 역할 | 서비스 | 비용 |
|---|---|---|
| 홈페이지 파일(HTML·CSS·JS·사진·영상) | Cloudflare Workers Static Assets | 무료 |
| 관리자 API · 방문 기록 · 올린 사진 | Workers(`worker.js`) + D1(`lycangym-db`) | 무료 (D1 5GB, 하루 10만 요청) |
| 도메인 라이칸짐.com (punycode `xn--oi2bw61a1wbh8g.com`) | 호스팅케이알 구매 → 네임서버를 Cloudflare 로 | 도메인 비용만 |

Supabase 는 무료 계정 한도(활성 프로젝트 2개) 때문에 쓰지 않고, 홍스랩(hongslab.kr)과 같은 D1 방식입니다.
Cloudflare 계정: hsk9867@gmail.com (홍스랩 계정). R2 는 계정에서 미사용이라 사진은 D1 BLOB 에 저장합니다(올릴 때 1600px 로 축소, 보통 200~400KB).

## 처음 한 번 (이미 완료한 것)
- `npx wrangler d1 create lycangym-db` → `wrangler.jsonc` 의 database_id
- `npx wrangler d1 migrations apply lycangym-db --remote` → settings/content/visits/files 테이블
- `npx wrangler deploy` → https://lycangym.hsk9867.workers.dev

## 파일을 고친 뒤
```powershell
cd C:\Users\홍아름\lycangym
npx wrangler deploy
```
GitHub 푸시만으로는 반영되지 않습니다(GitHub Pages 미리보기 hsk9867.github.io/lycangym 은 별개). CSS/JS 를 고치면 4개 HTML 의 `?v=` 캐시 버전을 올릴 것.

## 도메인 연결 (호스팅케이알 → Cloudflare)
1. Cloudflare 대시보드 → **Add a domain** → `라이칸짐.com` (또는 `xn--oi2bw61a1wbh8g.com`) → Free → 안내되는 네임서버 2개 확인.
2. 호스팅케이알 → 나의 서비스 → 도메인 관리 → **네임서버 변경** → Cloudflare 네임서버 2개 입력(반영 수 분~수 시간).
3. Cloudflare → Workers & Pages → `lycangym` → Settings → **Domains & Routes** → Add → Custom domain → `xn--oi2bw61a1wbh8g.com`, 그리고 `www.xn--oi2bw61a1wbh8g.com`. 인증서 자동.
4. (선택) Rules → Redirect Rules: `www.라이칸짐.com/*` → `https://라이칸짐.com/$1` 301.
5. 검색 등록(네이버 서치어드바이저·구글 서치콘솔)은 `https://xn--oi2bw61a1wbh8g.com/` 로, 소유 확인은 **메타태그** 방식(Cloudflare 가 `/x.html` 을 `/x` 로 리디렉트해 HTML 파일 방식은 실패).

## 관리자 (`/admin`)
- 처음 열면 **비밀번호를 정하는 화면**이 나옵니다(8자 이상). 그 뒤로는 그 비밀번호로 로그인. wrangler secret 불필요.
- 탭: 방문 통계(오늘·7일·30일, 일별 막대, 페이지별, 유입 경로) · 문구 · 가격표(헬스/필라테스) · 리뷰 · 사진(메인 슬라이드·비포애프터·소통) · 비밀번호 변경.
- 저장하면 고객 화면은 새로고침 때 반영(최대 30초 캐시). "원래대로" 는 HTML 기본값으로 복귀.
- 비밀번호를 잊으면: `npx wrangler d1 execute lycangym-db --remote --command "DELETE FROM settings WHERE key='auth'"` → /admin 에서 다시 설정.
- 로그인 5회 실패 시 10분 잠금.

## 운영 메모
- 방문 기록은 `visits` (페이지, 유입 도메인, 무작위 브라우저 ID, 화면 폭 — 개인정보 없음). 정리: `npx wrangler d1 execute lycangym-db --remote --command "DELETE FROM visits WHERE ts < strftime('%s','now','-1 year')"`
- 올린 사진은 `files` 테이블, 주소 `/uploads/<id>.jpg`. 안 쓰는 사진 정리는 D1 콘솔에서.
- 로그: `npx wrangler tail`
