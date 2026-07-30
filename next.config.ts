import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs-dist는 워커 모듈을 상대 경로로 동적 import하는데, 번들러가 그 경로를
  // 바꿔버리면 서버에서 워커를 찾지 못해 깨진다. 번들링 대상에서 제외해
  // Node의 기본 모듈 해석 방식 그대로 불러오게 한다.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
