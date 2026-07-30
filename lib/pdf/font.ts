import fs from "node:fs/promises";

// pdf-lib 기본 폰트는 한글을 그릴 수 없어서 시스템 폰트를 읽어 임베드한다.
// ⚠️ 지금은 로컬(Windows) 개발 환경의 맑은 고딕 경로를 그대로 사용한다.
// Vercel(Linux) 배포 시에는 이 경로에 폰트가 없으므로, 라이선스가 자유로운
// 한글 폰트(예: Noto Sans KR)를 프로젝트 assets로 따로 준비해 바꿔줘야 한다.
const WINDOWS_KOREAN_FONT_PATH = "C:/Windows/Fonts/malgun.ttf";

let cachedFontBytes: Buffer | null = null;

export async function loadKoreanFontBytes(): Promise<Buffer> {
  if (cachedFontBytes) return cachedFontBytes;
  try {
    cachedFontBytes = await fs.readFile(WINDOWS_KOREAN_FONT_PATH);
    return cachedFontBytes;
  } catch {
    throw new Error(
      "한글 폰트를 찾지 못했습니다. 로컬 Windows 환경이 아니라면 lib/pdf/font.ts에서 폰트 경로를 프로젝트에 포함된 한글 폰트 파일로 바꿔주세요.",
    );
  }
}
