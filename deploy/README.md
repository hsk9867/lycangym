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

## 2026-11-05 대시보드 개편 후 배포 (한 번만)
```powershell
cd <lycangym 폴더>
npx wrangler login                                   # 이 PC 에서 처음이면 브라우저 로그인
npx wrangler d1 migrations apply lycangym-db --remote  # 0002_hits: 상세 방문 기록 테이블 + 기존 visits 이전
npx wrangler deploy
```
마이그레이션을 빼먹으면 관리자 대시보드가 "no such table: hits" 를 표시합니다(그때 위 명령을 실행하면 됩니다).

## 파일을 고친 뒤
```powershell
npx wrangler deploy
```
GitHub 푸시만으로는 반영되지 않습니다(GitHub Pages 미리보기 hsk9867.github.io/lycangym 은 별개). CSS/JS 를 고치면 4개 HTML 의 `?v=` 캐시 버전을 올릴 것.

## 도메인 연결 (호스팅케이알 → Cloudflare)
1. Cloudflare 대시보드 → **Add a domain** → `라이칸짐.com` (또는 `xn--oi2bw61a1wbh8g.com`) → Free → 안내되는 네임서버 2개 확인.
2. 호스팅케이알 → 나의 서비스 → 도메인 관리 → **네임서버 변경** → Cloudflare 네임서버 2개 입력(반영 수 분~수 시간).
3. Cloudflare → Workers & Pages → `lycangym` → Settings → **Domains & Routes** → Add → Custom domain → `xn--oi2bw61a1wbh8g.com`, 그리고 `www.xn--oi2bw61a1wbh8g.com`. 인증서 자동.
4. (선택) Rules → Redirect Rules: `www.라이칸짐.com/*` → `https://라이칸짐.com/$1` 301.
5. 검색 등록(네이버 서치어드바이저·구글 서치콘솔)은 `https://xn--oi2bw61a1wbh8g.com/` 로, 소유 확인은 **메타태그** 방식(Cloudflare 가 `/x.html` 을 `/x` 로 리디렉트해 HTML 파일 방식은 실패). 메타태그는 4개 HTML 의 `<!-- 네이버 서치어드바이저 · 구글 서치콘솔 소유 확인 메타태그는 이 줄 아래에 넣으세요 -->` 아래에 넣고 배포.

## 관리자 (`/admin`)
- 처음 열면 **비밀번호를 정하는 화면**이 나옵니다(8자 이상). 그 뒤로는 그 비밀번호로 로그인. wrangler secret 불필요. 로그인 5회 실패 시 10분 잠금.
- 메뉴
  - **대시보드**: 오늘·7일·30일·90일·기간 지정, 이전 같은 기간과 비교. 방문·순방문자(신규/재방문)·페이지뷰·연락 액션(전화·카톡·톡톡), 평균 체류시간·스크롤 깊이·이탈률·연락 전환율, 일별 추이(하루 선택 시 시간대별), 유입경로·유입 상세·캠페인(UTM), 방문→연락 퍼널, 요일×시간대 히트맵, 연락 액션별 클릭·사람 수, 유입경로별/페이지별 연락 전환, 많이 본 페이지(체류·스크롤), 첫 방문 페이지, 기기·브라우저·OS·지역(도시)·화면 크기·언어, 최근 활동 50건, 지금 접속(최근 5분).
  - **문구 · 가격표 · 리뷰 · 사진**: 저장하면 고객 화면은 새로고침 때 반영(최대 30초 캐시). "원래대로"는 HTML 기본값으로 복귀. FAQ 문구·가격을 바꾸면 검색엔진용 JSON-LD 도 cms.js 가 같이 맞춥니다.
  - **검색·AI 노출**: robots·sitemap·llms.txt·구조화 데이터·FAQ·H1·OG 등을 사이트에서 직접 읽어 SEO/AEO/GEO 점수로 보여 주고, 서치어드바이저·서치콘솔·리치 결과 테스트·홍스랩 SEO 체커 링크를 모아 둠.
  - **설정**: 비밀번호 변경, 방문 기록 CSV 내보내기, 홍보 링크(UTM) 만들기, 저장 상태.
- 비밀번호를 잊으면: `npx wrangler d1 execute lycangym-db --remote --command "DELETE FROM settings WHERE key='auth'"` → /admin 에서 다시 설정.

## 방문 통계가 세는 방식 (`js/track.js` → `/api/track` → D1 `hits`)
- 개인정보 없음. 페이지 경로, 유입 주소, UTM, 화면 크기, 언어, 브라우저별 무작위 ID(localStorage `ly_sid`), Cloudflare 가 붙여 주는 국가·도시. IP 는 저장하지 않음(ID 가 없을 때만 당일 한정 해시에 사용).
- `type`: view(열람) · event(전화 `tel`, 카카오톡 `kakao`, 네이버 톡톡 `talk`, 인스타 `insta`, 블로그 `blog`, 지도 `map`, 네이버 리뷰 `review`, FAQ 열기 `faq`, 이용권 가격 보기 `price`) · leave(떠날 때 머문 시간 `dur` 초 · 스크롤 깊이 `depth` %).
- "방문" = 같은 날 같은 ID 1회. "지금 접속" = 최근 5분. 관리자로 로그인한 브라우저(쿠키 `ly_admin`)와 봇 UA 는 서버에서 제외.
- 정리: `npx wrangler d1 execute lycangym-db --remote --command "DELETE FROM hits WHERE ts < strftime('%s','now','-1 year')"`. 옛 `visits` 테이블은 0002 마이그레이션이 hits 로 옮긴 뒤 남겨 둠(지워도 됨).

## 검색·AI 노출 (SEO · AEO · GEO) 구성
- 4개 페이지: title/description/canonical/OG/트위터 카드/geo 메타, 페이지 키워드가 들어간 H1(로고는 div), 이미지 alt.
- 구조화 데이터(JSON-LD): 메인 HealthClub+LocalBusiness(주소·좌표·영업시간·결제·편의시설·이용권 OfferCatalog·SNS), WebSite, WebPage(speakable), VideoObject, FAQPage(8문항). 하위 페이지 BreadcrumbList + WebPage + Service(offers).
- 메인 하단 FAQ 섹션(질문→짧은 답, 관리자 문구에서 수정 가능).
- `llms.txt`(AI 가 읽는 소개문: 가격표·주소·전화·FAQ), `robots.txt`(검색엔진·AI 크롤러 허용, /admin·/api 제외), `sitemap.xml`(이미지·영상 포함), `_headers`(llms.txt 텍스트 타입, admin noindex, 캐시).
- 코드 밖 할 일: 네이버 서치어드바이저·구글 서치콘솔 등록과 사이트맵 제출, 네이버 스마트플레이스·인스타 프로필에 홈페이지 주소 넣기, 지역 키워드 블로그 글.

## 운영 메모
- 올린 사진은 `files` 테이블, 주소 `/uploads/<id>.jpg`. 안 쓰는 사진 정리는 D1 콘솔에서.
- 로그: `npx wrangler tail`
