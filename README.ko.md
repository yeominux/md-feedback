# MD Feedback

> 계획을 리뷰하세요. AI 에이전트를 가이드하세요. 자신 있게 배포하세요.

[English](README.md) | [한국어](README.ko.md)

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/yeominux.md-feedback-vscode?label=VS%20Code&logo=visual-studio-code)](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
[![npm](https://img.shields.io/npm/v/md-feedback?logo=npm)](https://www.npmjs.com/package/md-feedback)
[![License: SUL-1.0](https://img.shields.io/badge/License-SUL--1.0-blue.svg)](./LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-support-yellow?logo=buy-me-a-coffee&logoColor=white)](https://buymeacoffee.com/ymnseon8)

**MD Feedback**은 AI 에이전트가 구현하기 전에 마크다운 계획서를 리뷰하기 위한 VS Code 확장 + MCP 서버입니다. 위계는 명확합니다: 먼저 마크다운 계획을 기준으로 진행하고, 그 다음 MCP로 어노테이션 메모를 반영합니다.

[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)에서 설치 후 `.md` 계획서에서 텍스트를 선택하고 `1/2/3` 키로 리뷰하면 바로 사용할 수 있습니다.

**리뷰하세요. 에이전트가 구현합니다. 게이트가 완료를 추적합니다. 핸드오프가 컨텍스트를 보존합니다.**

![MD Feedback 데모: VS Code 사이드바에서 Fix, Question, Highlight로 마크다운 계획서에 어노테이션을 추가하고 AI 적용 결과를 리뷰하는 과정](https://raw.githubusercontent.com/yeominux/md-feedback/main/assets/demo.gif)

> 최신(v1.5.3): 여러 문단에 걸친 하이라이트가 의도대로 하나의 어노테이션으로 병합됩니다.

## 작동 방식

계획서에서 구현까지, 전체 AI 코딩 루프:

```plaintext
Step 1  YOU        마크다운으로 계획서 작성
          │
Step 2  YOU        MD Feedback 사이드바에서 열기 → 하이라이트, 수정, 질문
          │         (1, 2, 3 누르기)
          │
Step 3  AGENT      MCP 워크플로우로 마크다운 계획 기준 진행
          │
Step 4  AGENT      계획 하위에서 어노테이션 메모(Fix/Question) 반영
          │
Step 5  YOU        AI 작업 검토 → 승인, 수정 요청, 또는 거부
          │
Step 6  AGENT      게이트 자동 평가
          │         "수정 3개 남음" → "모두 완료, 머지 가능"
          │
Step 7  AGENT      핸드오프 생성 → 다음 세션이 이어서 작업
```

1–2, 5단계만 하면 됩니다. 나머지는 에이전트가 합니다.

구현 워크플로우에는 MCP 연결이 필수입니다. Export/Share는 구현 경로가 아니라 공유/호환용 보조 기능입니다.

## 주요 기능

- **3가지 어노테이션 타입**: Highlight (읽기 표시), Fix (수정 필요), Question (설명 필요)
- **28개 MCP 도구**로 에이전트 직접 연동
- **선택적 공유/호환 내보내기(11개 도구)**: Claude Code, Cursor, Copilot, Codex, Cline, Windsurf, Roo Code, Gemini, Antigravity, Generic, Handoff
- **품질 게이트**: 어노테이션 해결 상태에 따른 자동 평가
- **세션 핸드오프**: AI 에이전트 세션 간 컨텍스트 보존
- **체크포인트**: 스냅샷으로 리뷰 진행 상황 추적
- **플랜 커서**: 문서 내 현재 위치 추적
- **키보드 단축키**: 1, 2, 3 누르면 즉시 어노테이션
- **AI가 수정 적용**: MCP를 통해 에이전트가 구현을 보고하면 인라인 before/after diff로 확인
- **7가지 상태 뱃지**: Open, Working, Review, Answered, Done, Failed, Won't Fix
- **롤백**: 에이전트가 실수하면 마지막 변경을 되돌릴 수 있음
- **일괄 작업**: 여러 수정을 하나의 트랜잭션으로 적용
- **안전한 텍스트 교체**: 같은 텍스트가 여러 곳에 있을 때 에이전트가 어느 것을 변경할지 지정해야 함 (잘못된 줄 수정 방지)
- **파일 안전**: .env, credentials, node_modules 등 민감한 파일 쓰기 차단
- **승인 / 거부 버튼** — 리뷰 필요 시 항상 표시, 한 클릭으로 수락 또는 거부
- **에디터 CodeLens** — 마크다운 파일에서 직접 승인/거부, 사이드바 불필요
- **Activity Bar 배지** — 리뷰 대기 중인 어노테이션 수를 한눈에 확인
- **상태바 + 토스트 알림** — AI가 작업을 전달하면 즉시 알림
- **키보드 단축키** — Ctrl+Shift+A로 승인, Ctrl+Shift+X로 거부
- **게이트 오버라이드** — 자동 평가가 부족할 때 수동으로 게이트 상태 제어
- **외부 파일 diff 인라인** — AI가 변경할 내용을 적용 전에 정확히 확인
- **게이트 전환 알림** — 게이트가 해제되거나 완료될 때 알림
- **동시 작업 보호** — 여러 AI 작업이 동시에 실행될 때 데이터 손상 방지
- **자동 새로고침**: AI가 MCP로 변경하면 문서가 실시간 업데이트
- **이식 가능한 포맷**: HTML 코멘트로 저장 — 모든 마크다운 렌더러에서 작동, git에서도 보존
- **풍부한 렌더링**: Mermaid 다이어그램, 콜아웃 블록, 구문 강조 코드

## 빠른 시작 (2분 이내)

1. **설치** — [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)에서
2. **먼저 어노테이션** — 마크다운에서 텍스트를 선택하고 `1`(하이라이트), `2`(수정), `3`(질문)
3. **MCP 연결(필수)** — 첫 어노테이션 후 사이드바 `Connect AI`를 눌러 MCP 설정 추가:

```json
{ "mcpServers": { "md-feedback": { "command": "npx", "args": ["-y", "md-feedback"] } } }
```

4. **완료** — MCP 연결 후 에이전트가 마크다운 메모를 직접 읽고 구현합니다.

> **MCP는 Node.js 18+ 필요** (`npx` 사용).
> Claude 경로: `.claude/mcp.json`  
> Cursor 경로: `.cursor/mcp.json`

> **지금 바로 해보세요:** [Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)에서 설치 후 아무 `.md` 파일을 열고 `2`를 눌러 첫 Fix 어노테이션을 추가해보세요.

## 사용 사례

### 바이브 코딩 워크플로우
마크다운으로 계획서를 작성합니다. MD Feedback으로 리뷰합니다. AI 에이전트가 리뷰한 그대로 구현합니다. 계획서가 계약서 — 어노테이션이 지시사항입니다.

### AI 계획서 리뷰
AI 에이전트가 구현 계획을 생성합니다. 에이전트가 코드를 작성하기 전에 하이라이트, 수정, 질문으로 리뷰합니다. 구현 후가 아닌 설계 단계에서 오류를 잡습니다.

### 세션 연속성
여러 세션에 걸쳐 AI와 작업하시나요? 핸드오프가 모든 결정, 미해결 질문, 핵심 컨텍스트를 보존합니다. 다음 세션은 이전 세션이 끝난 곳에서 시작합니다.

### 팀 계획서 리뷰
어노테이션은 마크다운 파일 안의 HTML 코멘트입니다. git 커밋, PR, 브랜치 머지를 통과해도 보존됩니다. 일반적인 버전 관리 워크플로우를 통해 리뷰된 계획서를 팀과 공유하세요.

### 품질 게이트 적용
에이전트가 진행하기 전에 충족해야 할 조건을 설정합니다. 게이트는 어노테이션 해결 상태에 따라 자동으로 평가됩니다 — blocked, proceed, done.

## 설계 철학

- **인간은 뭐가 문제인지만 말합니다.** 어떻게 고칠지는 AI가 결정합니다.
- **3가지 어노테이션 타입이면 충분합니다.** AI가 컨텍스트에서 의도를 추론합니다 — 수정이 문서 편집인지 코드 변경인지.
- **마크다운이 유일한 진실의 원천입니다.** 모든 상태가 파일 자체에 존재합니다.
- **인지 부하 제로.** 상태 바가 진행 상황을 패시브하게 표시합니다. 추가 결정이 필요 없습니다.
- **이식 가능하고 git 친화적입니다.** 어노테이션은 HTML 코멘트 — 모든 마크다운 렌더러와 버전 관리에서 보존됩니다.

## VS Code 설정

VS Code 설정에서 `md-feedback.*` 항목으로 동작을 조정할 수 있습니다.
대규모 워크스페이스를 위한 고급 타이밍/성능 옵션도 제공합니다.

## MCP 서버

MD Feedback에는 27개의 도구를 갖춘 MCP 서버가 포함되어 있어 AI 에이전트가 수동 내보내기 없이 어노테이션을 읽을 수 있습니다. 에이전트가 메모를 조회하고, 작업 완료를 표시하고, 수정을 적용하고, 게이트 상태를 확인하고, 핸드오프를 생성합니다 — 모두 Model Context Protocol을 통해.

**설정:**

```bash
npx md-feedback
```

**워크스페이스 지정** — MCP 클라이언트가 `cwd`를 프로젝트 폴더로 설정하지 않는 경우 (예: Antigravity) 명시적으로 지정:

```json
{ "command": "npx", "args": ["-y", "md-feedback", "--workspace=/path/to/project"] }
```

Windows 예시: `{ "command": "npx", "args": ["-y", "md-feedback", "--workspace=C:\\\\work\\\\my-project"] }`  
또는 환경변수: `MD_FEEDBACK_WORKSPACE=/path/to/project`

자세한 내용은 [MCP 서버 문서](./apps/mcp-server/README.md)를 참조하세요.

## 링크

- [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=yeominux.md-feedback-vscode)
- [npm (MCP 서버)](https://www.npmjs.com/package/md-feedback)
- [이슈 리포트](https://github.com/yeominux/md-feedback/issues)
- [기여하기](./CONTRIBUTING.md)
- [후원하기](https://buymeacoffee.com/ymnseon8)

## 라이선스

[SUL-1.0](./LICENSE) — 개인 및 비상업적 사용 무료.

---

## FAQ

**MD Feedback이 뭔가요?**
AI 에이전트가 구현하기 전에 마크다운 계획서를 리뷰하기 위한 VS Code 확장 + MCP 서버입니다. 텍스트를 선택하고 1(하이라이트), 2(수정), 3(질문)을 누르면 어노테이션이 마크다운 파일 안에 이식 가능한 HTML 코멘트로 저장됩니다. 공유용 컨텍스트는 11개 AI 도구로 내보낼 수 있고, 구현은 MCP 경로에서 에이전트가 직접 읽고 반영합니다.

**Claude Code / Cursor / Copilot에서 쓸 수 있나요?**
네. Claude Code(`CLAUDE.md`), Cursor(`.cursor/rules/`), GitHub Copilot(`.github/copilot-instructions.md`) 등 11개 도구로 공유용 컨텍스트를 내보낼 수 있습니다. 실제 구현은 MCP를 통해 에이전트가 마크다운 메모를 직접 읽고 반영하는 경로를 권장합니다.

**MCP가 뭐고 왜 중요한가요?**
MCP(Model Context Protocol)는 AI 에이전트가 외부 도구와 상호작용할 수 있게 하는 프로토콜입니다. MD Feedback의 MCP 서버는 에이전트에게 어노테이션에 대한 직접 접근을 제공하여, 피드백을 읽고, 작업을 완료 표시하고, 게이트를 평가하고, 핸드오프를 자동으로 생성할 수 있습니다.

**여러 사람이 같은 계획서를 리뷰할 수 있나요?**
네. 어노테이션은 마크다운 파일에 내장된 HTML 코멘트입니다. 커밋, 브랜치, PR, 머지를 통해 git으로 이동해도 어노테이션이 온전히 보존됩니다.

**무료인가요?**
네. [SUL-1.0](./LICENSE) 라이선스 하에 개인 및 비상업적 사용은 무료입니다.

**누구를 위한 도구인가요?**
AI 코딩 어시스턴트를 사용하면서, 구현 전에 계획을 리뷰하고, 세션 간 컨텍스트를 보존하고, 비정형 채팅 대신 구조화된 피드백을 에이전트에게 전달하고 싶은 개발자를 위한 도구입니다.

추가 질문과 고급 가이드: [MCP 서버 문서](./apps/mcp-server/README.md), [GitHub Issues](https://github.com/yeominux/md-feedback/issues)

