# MD Feedback

> 계획을 리뷰하세요. AI 에이전트를 가이드하세요. 자신 있게 배포하세요.

[English](README.md) | [한국어](README.ko.md)

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/yeominux.md-feedback-vscode?label=VS%20Code&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
[![npm](https://img.shields.io/npm/v/md-feedback?logo=npm)](https://www.npmjs.com/package/md-feedback)
[![License: SUL-1.0](https://img.shields.io/badge/License-SUL--1.0-blue.svg)](./LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/ymnseon8)

**MD Feedback**은 AI 코딩을 위한 VS Code 플랜 리뷰 도구입니다. 마크다운 계획서에 Fix/Question/Highlight를 남기면, 에이전트가 MCP로 그 피드백을 직접 읽고 실행할 수 있습니다. 어노테이션은 마크다운 파일 안에 이식 가능한 HTML 코멘트로 저장됩니다 (독점 포맷/클라우드 종속 없음).

[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)에서 설치 후 `.md` 계획서를 열고 `1/2/3` 키로 리뷰하면 바로 사용할 수 있습니다.

**리뷰하세요. 에이전트가 구현합니다. 게이트가 완료를 추적합니다. 핸드오프가 컨텍스트를 보존합니다.**

## 작동 방식

계획서에서 구현까지, 전체 AI 코딩 루프:

```
Step 1  YOU        마크다운으로 계획서 작성
          │
Step 2  YOU        MD Feedback 사이드바에서 열기 → 하이라이트, 수정, 질문
          │         (1, 2, 3 누르기)
          │
Step 3  AGENT      MCP로 어노테이션 읽기 — 내보내기 불필요
          │
Step 4  AGENT      수정 구현, 질문 답변
          │
Step 5  AGENT      메모 완료 표시 → 게이트 자동 평가
          │         "수정 3개 남음" → "모두 완료, 머지 가능"
          │
Step 6  AGENT      핸드오프 생성 → 다음 세션이 이어서 작업
```

1–2단계만 하면 됩니다. 나머지는 에이전트가 합니다.

MCP 우선 방식입니다. 내보내기 기반 워크플로우를 사용하면 2단계 후에 내보내기를 실행하세요.

## 빠른 시작

1. **설치** — [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)에서
2. **MCP 연결** — AI 도구 설정에 추가 (Claude Code, Cursor 등):
   ```json
   { "mcpServers": { "md-feedback": { "command": "npx", "args": ["-y", "md-feedback"] } } }
   ```
3. **어노테이션** — 사이드바에서 `.md` 파일 열기, `1`(하이라이트), `2`(수정), `3`(질문)
4. **완료** — 에이전트가 MCP로 어노테이션을 직접 읽습니다. 내보내기 불필요.

> **MCP 없이?** Command Palette → `MD Feedback: Export` → AI 도구 선택.

## MCP 서버

MD Feedback에는 MCP 서버가 포함되어 있어 AI 에이전트가 수동 내보내기 없이 어노테이션을 읽을 수 있습니다. 에이전트가 메모를 조회하고, 작업 완료를 표시하고, 게이트 상태를 확인하고, 핸드오프를 생성합니다 — 모두 Model Context Protocol을 통해.

**설정:**

```bash
npx md-feedback
```

자세한 내용은 [apps/vscode/README.md#mcp-server--agent-memory](./apps/vscode/README.md#mcp-server--agent-memory)를 참조하세요.

## 패키지

| 패키지 | 설명 | 배포 |
|--------|------|------|
| [apps/vscode](./apps/vscode) | VS Code 확장 | [Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode) |
| [apps/mcp-server](./apps/mcp-server) | MCP 서버 | [npm](https://www.npmjs.com/package/md-feedback) |
| [packages/shared](./packages/shared) | 공유 타입 & 유틸리티 | Private |

## 링크

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
- [npm (MCP 서버)](https://www.npmjs.com/package/md-feedback)
- [이슈 리포트](https://github.com/yeominux/md-feedback-clean/issues)
- [기여하기](./CONTRIBUTING.md)
- [후원하기](https://buymeacoffee.com/ymnseon8)

## 라이선스

[SUL-1.0](./LICENSE) — 개인 및 비상업적 사용 무료.

---

## FAQ

**MD Feedback이 뭔가요?**
MD Feedback은 AI가 생성한 계획서를 구현 전에 리뷰하기 위한 VS Code 확장 + MCP 서버입니다. 텍스트를 선택하고 1(하이라이트), 2(수정), 3(질문)을 누르면 어노테이션이 마크다운 파일 안에 이식 가능한 HTML 코멘트로 저장됩니다. 11개 이상의 AI 도구로 내보내거나, MCP로 에이전트가 직접 읽습니다.

**Markdown Preview Enhanced와 뭐가 다른가요?**
Markdown Preview Enhanced는 읽기 전용 렌더러입니다. MD Feedback은 인터랙티브 리뷰 도구로, AI 에이전트가 실행할 수 있는 구조화된 피드백을 작성합니다.

**Claude Code / Cursor / Copilot에서 쓸 수 있나요?**
네. Claude Code(`CLAUDE.md`), Cursor(`.cursor/rules/`), GitHub Copilot(`.github/copilot-instructions.md`) 등 11개 도구를 지원합니다. MCP를 사용하면 내보내기 없이 에이전트가 직접 읽습니다.

**무료인가요?**
네. [SUL-1.0](./LICENSE) 라이선스 하에 개인 및 비상업적 사용은 무료입니다.

**플랜 리뷰(Plan Review)가 뭔가요?**
플랜 리뷰는 AI가 생성한 계획서를 구현 전에 리뷰하는 것입니다. 코드 리뷰(코드 작성 후)와 달리, 플랜 리뷰는 코드가 나오기 전 설계 단계에서 아키텍처 실수와 요구사항 누락을 잡아냅니다.
