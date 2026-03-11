# Contributing to MD Feedback

Thanks for your interest in MD Feedback.

## Reporting issues

Please open bugs and feature requests at:
https://github.com/yeominux/md-feedback/issues

## Pull requests

- Keep changes focused and user-facing.
- Include a clear summary of what changed and why.
- Avoid adding internal-only operational details to public docs.
- Write release notes and README updates in user-facing language.
- Use `pnpm check:user-facing` before opening a PR or tagging a release.

## Release gates

Before tagging or shipping a release, run `pnpm check:release-gates` (expanded checks below):

- `pnpm --filter @md-feedback/shared test`
- `pnpm --filter md-feedback test`
- `pnpm --filter md-feedback build`
- `pnpm --filter md-feedback-vscode test`
- `pnpm --filter md-feedback-vscode build:ext`

For development-time release preflight (docs + tests/build), run:

- `pnpm release:preflight`

For full release readiness right before tagging (includes clean/synced git state), run:

- `pnpm release:ready`

## Shared API policy

- Prefer `MemoV2`-based APIs (`splitDocument`, `extractMemosV2`) for all new code.
- Treat legacy helpers as compatibility-only:
  - `legacy.extractMemos`
  - `legacy.generateReviewSummary`
- Do not add new call sites that depend on deprecated `Memo`-typed flows.
- If legacy behavior must be touched, keep it isolated in `packages/shared/src/legacy.ts` or explicit compatibility paths.

## License

By contributing, you agree your contributions are licensed under [SUL-1.0](./LICENSE).

