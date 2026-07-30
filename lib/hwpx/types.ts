// hwpx 처리 파이프라인 전반에서 공유하는 타입 정의

export interface CharStyle {
  /** hwp 내부 관례: 글자크기는 1/100pt 단위(height)로 저장됨 */
  heightHundredths: number;
  fontName: string | null;
}

export interface SampleStyle {
  title: CharStyle;
  body: CharStyle;
  /** 본문에서 가장 많이 쓰인 글머리 기호 문자 (없으면 null) */
  bulletChar: string | null;
}

export interface DetectedTitle {
  text: string;
  /** 병합 시 문서 업로드 순서 (0부터) */
  sourceIndex: number;
  sourceFileName: string;
}

export interface HwpxSourceFile {
  fileName: string;
  buffer: Buffer;
}
