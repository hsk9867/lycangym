-- 라이칸짐 연수점 D1 스키마
-- settings : 관리자 비밀번호 해시(auth), 세션 서명 키(session_key), 로그인 실패 기록
-- content  : 관리자가 바꾼 문구·가격표·리뷰·사진 목록 (key → JSON 문자열)
-- visits   : 방문 기록 (개인정보 없음)
-- files    : 관리자가 올린 사진 (R2 대신 D1 BLOB, 올릴 때 긴 변 1600px 로 줄여 보통 200~400KB)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS content (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS visits (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  ts   INTEGER NOT NULL,
  page TEXT NOT NULL,
  ref  TEXT,
  sid  TEXT,
  w    INTEGER
);
CREATE INDEX IF NOT EXISTS visits_ts ON visits (ts);
CREATE TABLE IF NOT EXISTS files (
  id      TEXT PRIMARY KEY,
  mime    TEXT NOT NULL,
  size    INTEGER NOT NULL,
  data    BLOB NOT NULL,
  created INTEGER NOT NULL
);
