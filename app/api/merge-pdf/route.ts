import { NextRequest, NextResponse } from "next/server";
import { mergePdfFiles } from "@/lib/pdf/merge";
import type { PdfSourceFile } from "@/lib/pdf/merge";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const targets = formData.getAll("files");

  if (targets.length === 0 || !targets.every((f) => f instanceof File)) {
    return NextResponse.json({ error: "병합할 PDF 파일을 1개 이상 업로드해주세요." }, { status: 400 });
  }

  try {
    const files: PdfSourceFile[] = await Promise.all(
      (targets as File[]).map(async (f) => ({
        fileName: f.name,
        buffer: Buffer.from(await f.arrayBuffer()),
      })),
    );

    const { buffer, titles } = await mergePdfFiles(files);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="merged.pdf"',
        "X-Detected-Title-Count": String(titles.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF 병합 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
