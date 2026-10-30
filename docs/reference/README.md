# Reference Docs

This folder is the preferred home for project reference material that should influence implementation decisions.

## Put These Here

- page structure notes
- module boundaries
- business rules
- release identity notes
- UI and interaction constraints
- verification summaries that still matter to future work

## Priority

Files in this folder are project-local references and should be preferred over:

- parent-folder notes
- sibling project files
- external memory
- generic agent assumptions

## Current Canonical Project References

The main local truth sources remain:

- `AGENTS.md`
- `app.json`
- `package.json`
- `eas.json`
- `src/config/app-config.ts`
- `src/store/use-app-store.ts`

## Business and Functional Specification Draft

- [橙光 AI 日记业务与功能规格说明书](business-spec/README.md)
- [需求追踪矩阵](business-spec/requirement-matrix.md)
- [待确认规则与原型差异](business-spec/open-questions.md)

This project-local draft describes the current prototype's business capabilities as the basis for later development and testing. Its unconfirmed rules remain open questions until the user confirms the intended scope.

## Implementation Tasks and Test Cases

- [真实业务实施任务与测试案例](delivery/README.md)
- [原始验收到任务与案例的覆盖矩阵](delivery/coverage.md)
- [实施决策登记](delivery/decision-register.md)

Each task and its matching test cases use separate, same-named files. Business decisions remain unconfirmed until recorded; test cases are not execution results.

## App Store Materials

- Current Chinese-only copy: [app-store-materials-brief.md](app-store-materials-brief.md)
- Word version: [app-store-materials-brief.docx](app-store-materials-brief.docx)
- Feishu document: [AI旅行日记 iOS 上架材料（简版）](https://iy5fmr8b2n.feishu.cn/docx/GHjWd53Smo02h5xjD02cTDRdnWe)

Updated on 2026-10-30 for installation identity, AI postcard messages, single-diary deletion, and the privacy-policy entry. AI consent withdrawal and full identity deletion remain unresolved policy/product consistency items, not implemented features. The detailed bilingual materials are historical references.
