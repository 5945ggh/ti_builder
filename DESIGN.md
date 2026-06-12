# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-06-11
- Primary product surfaces: internal admin workbench, questionnaire editor, answer flow, response review, settings.
- Evidence reviewed: `docs/prd-test-workbench.md`, `README.md`, `app/globals.css`, `app/admin/**`, `components/questionnaire/questionnaire-preview.tsx`.

## Brand
- Personality: restrained internal tool with a recognized tech/console workbench tone, practical, calm, and dense enough for repeated team use.
- Trust signals: clear validation state, explicit irreversible actions, visible versioning, stable data tables.
- Avoid: marketing hero layouts, decorative gradients, heavy shadows, oversized type, casual one-off visual flourishes, and reverting the current workbench into a generic minimalist style.

## Product goals
- Goals: help a small team create, edit, publish, test, review, and export exploratory questionnaire data quickly.
- Non-goals: public-facing polish, share graphics, consumer-brand expression, complex visual builder behavior.
- Success signals: operators can scan status quickly, edit JSON safely, preview changes, and publish with confidence.

## Personas and jobs
- Primary personas: technical owner and team members using a shared internal admin password.
- User jobs: generate questionnaire drafts, edit schema, validate and preview, publish immutable versions, run internal answers, review result quality.
- Key contexts of use: desktop-first internal work, occasional mobile answer flow checks, fast iteration during a traffic window.

## Information architecture
- Primary navigation: admin home links to questionnaires, settings, and response/result surfaces.
- Core routes/screens: login, workbench home, questionnaire list, questionnaire create/edit, schema format guide, internal answer, response detail, settings.
- Content hierarchy: current task first, validation/metadata second, historical or irreversible operations tucked into dedicated sections.

## Design principles
- Use one visual source of truth: all new visual values must come from `app/globals.css` tokens.
- Prefer operational clarity over ornament: structured console-like surfaces, compact spacing, 8px radius, no decorative cards inside cards, and no one-off visual values outside tokens.
- Separate risk levels: primary saves use solid primary, secondary navigation/actions use outlined buttons, irreversible publish actions require explicit confirmation.
- Keep editing and previewing together: questionnaire schema editing and read-only preview share the main viewport when width allows.

## Visual language
- Color: current chamber-slate/warm-ochre tech palette is accepted, including blueprint-dot background and dark code surfaces, but color choices must come from `app/globals.css` tokens or established component classes.
- Typography: local/system-safe sans and display stacks for UI, `--font-mono` for IDs, JSON, vectors, and code-like text; do not use remote font imports.
- Spacing/layout rhythm: use `--space-1`, `--space-2`, `--space-3`, `--space-4`, `--space-6`, `--space-8`.
- Shape/radius/elevation: use `--radius`; mechanical borders and restrained console surfaces are allowed when implemented through reusable classes.
- Motion: no decorative motion; state changes should be immediate and boring.
- Imagery/iconography: not required for the current internal workbench; console labels, bracketed technical markers, and dark code surfaces are allowed when they support scanning.

## Components
- Existing components to reuse: `.panel`, `.disclosure-panel`, `.field`, `.button`, `.icon-button`, `.notice`, `.table`, `.row`, `.meta-list`, `.code-editor`, `.code-sample`, `.muted-code`.
- New/changed components: disclosure sections for secondary workflows, token/id truncation plus copy affordance, 50/50 editor preview layout.
- Variants and states: `.button` primary, `.button.secondary`/`.button.ghost` secondary, `.button.danger` irreversible, `.notice.ok`, `.notice.warn`, `.notice.info`.
- Token/component ownership: global tokens and generic components live in `app/globals.css`; pages should reuse classes and avoid inline style objects for generic visual treatment.

## Accessibility
- Target standard: pragmatic WCAG AA for admin surfaces where feasible.
- Keyboard/focus behavior: controls must keep visible focus; disclosure summaries, buttons, and links must be keyboard reachable.
- Contrast/readability: semantic notices must remain readable on soft backgrounds.
- Screen-reader semantics: preserve native form labels, buttons, links, tables/regions where available.
- Reduced motion and sensory considerations: no required animation in v1.

## Responsive behavior
- Supported breakpoints/devices: desktop-first; admin pages collapse to single-column below 720px.
- Layout adaptations: editor and preview are 50/50 columns on wide screens and stacked on narrow screens.
- Touch/hover differences: critical actions must not depend on hover-only content.

## Interaction states
- Loading: buttons should show in-progress text and disabled state.
- Empty: render useful empty notices, not placeholder-like technical noise.
- Error: validation and AI failures use `.notice.warn` or `.form-error` with preserved line breaks.
- Success: use `.notice.ok` for confirmed saves, valid schema, and completed actions.
- Disabled: disabled controls use subdued text and surface.
- Offline/slow network, if applicable: show existing pending state; do not add complex client state for v1.

## Content voice
- Tone: concise Chinese UI copy for operators.
- Terminology: use “问卷”, “草稿”, “发布版本”, “测试 token”, “维度”, “题目”, “评分 prompt”.
- Microcopy rules: avoid English section labels in visible UI except schema field names, JSON keys, model names, and API terms.

## Implementation constraints
- Framework/styling system: Next.js App Router with global CSS; no new UI dependency for this pass.
- Design-token constraints: new colors, spacing, font sizes, radius, fonts, backgrounds, and surface treatments must reference `:root` variables or existing classes in `app/globals.css`.
- Performance constraints: keep editor as textarea for v1; do not introduce CodeMirror until the editing workflow requires it.
- Compatibility constraints: use native HTML controls and progressive disclosure where possible.
- Test/screenshot expectations: after UI changes, run lint/typecheck/build; use browser screenshot checks for substantial visual changes when a local server is available.

## Open questions
- [ ] Should the public answer/result surfaces later get a separate visual language from the internal admin workbench?
- [ ] Should token copy buttons show persisted “已复制” state per row instead of relying on the clipboard action succeeding silently?
