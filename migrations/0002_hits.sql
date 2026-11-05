-- 라이칸짐 연수점 방문 통계 2단계: 상세 방문 기록(hits)
-- visits(1단계: 페이지·유입 도메인·브라우저 ID·화면 폭)를 대체한다. 개인정보는 저장하지 않는다.
--   type    : view(페이지 열람) | event(전화·카톡·지도 등 클릭) | leave(페이지 떠남: 체류시간·스크롤 깊이)
--   vid     : 브라우저별 무작위 ID(localStorage ly_sid). 없으면 당일 한정 해시(날짜+IP+UA)
--   source  : 분류된 유입경로(네이버 검색·네이버 지도·인스타그램·카카오톡·직접 유입 …)
--   country/city : Cloudflare 가 요청에 붙여 주는 국가·도시(IP 는 저장하지 않음)
CREATE TABLE IF NOT EXISTS hits (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts       INTEGER NOT NULL,
  day      TEXT NOT NULL,          -- 한국시간 YYYY-MM-DD
  hour     INTEGER NOT NULL,       -- 한국시간 0~23
  type     TEXT NOT NULL,          -- view | event | leave
  name     TEXT,                   -- event 이름 (tel, kakao, insta, blog, map, review, talk, faq …)
  path     TEXT NOT NULL,
  ref_host TEXT,
  ref_url  TEXT,
  source   TEXT NOT NULL,
  medium   TEXT,
  campaign TEXT,
  device   TEXT,
  browser  TEXT,
  os       TEXT,
  country  TEXT,
  city     TEXT,
  vid      TEXT NOT NULL,
  screen   TEXT,
  lang     TEXT,
  dur      INTEGER,                -- leave: 머문 시간(초)
  depth    INTEGER                 -- leave: 가장 많이 내린 스크롤 깊이(%)
);
CREATE INDEX IF NOT EXISTS idx_hits_day ON hits (day, type);
CREATE INDEX IF NOT EXISTS idx_hits_ts ON hits (ts);
CREATE INDEX IF NOT EXISTS idx_hits_vid ON hits (vid, day);

-- 1단계 visits 기록을 hits 로 옮긴다 (유입경로·기기는 가진 정보 범위에서 추정)
INSERT INTO hits (ts, day, hour, type, path, ref_host, source, device, browser, os, vid, screen)
SELECT
  ts,
  date(ts + 32400, 'unixepoch'),
  CAST(strftime('%H', ts + 32400, 'unixepoch') AS INTEGER),
  'view',
  page,
  ref,
  CASE
    WHEN ref IS NULL OR ref = '' THEN '직접 유입'
    WHEN ref LIKE '%search.naver.com%' THEN '네이버 검색'
    WHEN ref LIKE '%m.place.naver.com%' OR ref LIKE '%map.naver.com%' OR ref LIKE '%place.naver.com%' THEN '네이버 지도·플레이스'
    WHEN ref LIKE '%blog.naver.com%' THEN '네이버 블로그'
    WHEN ref LIKE '%naver.%' THEN '네이버'
    WHEN ref LIKE '%google.%' THEN '구글'
    WHEN ref LIKE '%instagram.com%' THEN '인스타그램'
    WHEN ref LIKE '%kakao.com%' THEN '카카오톡'
    WHEN ref LIKE '%daum.net%' THEN '다음'
    WHEN ref LIKE '%hongslab%' THEN '홍스랩'
    ELSE '기타 사이트'
  END,
  CASE WHEN w IS NOT NULL AND w < 768 THEN '모바일' WHEN w IS NOT NULL AND w < 1024 THEN '태블릿' WHEN w IS NOT NULL THEN 'PC' ELSE '알 수 없음' END,
  '알 수 없음',
  '알 수 없음',
  COALESCE(sid, printf('%016x', id)),
  CASE WHEN w IS NOT NULL THEN w || 'w' ELSE NULL END
FROM visits
WHERE NOT EXISTS (SELECT 1 FROM hits LIMIT 1);
