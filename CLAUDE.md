# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project status

This repository is in a pre-scaffolding state: there is no `package.json`, no source code, and no
build/lint/test tooling yet. Do not assume a framework, language, or directory layout — ask or check
before generating code that depends on one.

Once a stack is chosen and scaffolded (e.g. via the bkit `/starter`, `/dynamic`, or `/enterprise`
commands), update this file with:
- The actual install/build/lint/test/dev commands (and how to run a single test)
- The high-level architecture (how major directories/modules relate, not a file listing)

## Project rules

- 모든 설명과 주석은 한국어로 작성한다.
- 새 파일은 `my-app` 폴더 안에만 만든다.
- 코드를 바꾸면 반드시 무엇을 왜 바꿨는지 한 줄로 알려준다.
- 파일을 지워야 할 때는 바로 삭제하지 말고, `trash-can` 폴더를 만들어 그 안으로 옮겨만 둔다.
  실제 삭제는 사용자가 직접 확인 후 진행한다.
- 이미 설치된 서브에이전트(bkit 등)는 필요할 때마다 적극 활용한다.

## 작업 방식 (검증 루프)

모든 구현 작업은 아래 루프를 반복한다. 5)에서 통과할 때까지 4)에서 1)로 되돌아간다.

1. **구현한다** — 요청된 변경을 코드로 작성한다.
2. **결과를 직접 확인한다** — 실행하거나 열어봐서(예: 개발 서버 실행 후 브라우저 확인, 스크립트
   실행, 테스트 실행 등) 실제로 동작하는지 눈으로 확인한다. 확인 없이 완료라고 보고하지 않는다.
3. **스스로 코드 리뷰한다** — 방금 바꾼 코드를 다시 읽고 버그, 불필요한 복잡함, 규칙 위반(이 문서의
   다른 규칙 포함) 여부를 점검한다.
4. **문제가 있으면 고치고 1)로 돌아간다** — 문제를 발견하면 즉시 수정하고 루프를 처음부터 반복한다.
5. **통과하면 보고한다** — 무엇을, 왜 바꿨는지 한 줄로 보고한다.

## Tech stack (fixed)

- 프레임워크는 PRD에 정한 대로 **Next.js**로 고정한다. 다른 프레임워크로 바꾸거나 마이그레이션을
  제안하지 않는다.
- 배포는 **Vercel**을 사용한다.

## Secrets and environment

- `.env` holds project secrets and is gitignored (verified: `.env`, `.env.local`, `.env.*.local` are all
  excluded in `.gitignore`). Never print its values to the console or commit it.
- Expected variables (names only — values live only in `.env`):
  - `GITHUB_TOKEN`
  - `SUPABASE_ACCESS_TOKEN`
  - `VERCEL_TOKEN`
  - `OPENAI_API_KEY`
- `토큰 보관.txt` in the project root also appears to hold token/credential notes — treat as sensitive,
  do not read its contents into responses, and do not commit it.
- `.env`를 비롯한 비밀 정보 파일은 항상 `.gitignore`에 등록된 상태를 유지하고, 절대 커밋하지 않으며
  값을 화면(채팅)에 출력하지 않는다.
- 외부 서비스 인증이 필요할 때는 토큰 값을 사용자에게 묻거나 채팅에 출력하지 않고, `.env`에 있는 값을
  읽어서 그대로 사용한다.
  - 예: Supabase 작업이 필요하면 Supabase CLI를 설치하고 `.env`의 `SUPABASE_ACCESS_TOKEN`으로 인증한다.
  - 예: Vercel 작업(배포 등)이 필요하면 Vercel CLI를 설치하고 `.env`의 `VERCEL_TOKEN`으로 인증한다.

## Tooling in this environment

- The `bkit` Claude Code plugin (`popup-studio-ai/bkit-claude-code` marketplace) is installed and
  provides the PDCA development workflow (`/pdca`, `/sprint`) plus level-specific project init commands
  (`/starter` for static sites, `/dynamic` for fullstack + bkend.ai BaaS, `/enterprise` for
  microservices/k8s). Prefer these over ad-hoc scaffolding when starting the actual build.
