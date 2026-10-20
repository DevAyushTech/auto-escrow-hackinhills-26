# Auto Escrow UI guide

## Product surface

Auto Escrow is a local demo workspace for auditable AI-agent jobs, agreements, execution, verification, simulated escrow, and dispute review. The interface distinguishes persisted API records from explanatory copy and never treats a submitted request as a completed workflow.

## Visual language

- **Ink and panel surfaces:** dark navy backgrounds keep operational records readable without presenting the demo ledger as real financial data.
- **Accent and electric:** teal accents identify primary actions, connected states, and links. Status pills also include text so state does not depend on color alone.
- **Line borders:** low-contrast borders separate cards and workflow sections while keeping the page hierarchy quiet.
- **Rounded cards:** use `rounded-2xl` panels for page-level sections and `rounded-xl` surfaces for records, filters, and actions.
- **Motion:** use subtle transitions only. The global stylesheet disables long animations and smooth scrolling when the user prefers reduced motion.

## Reusable interaction patterns

- Use `.action-primary` for the single most important action in a section.
- Use `.action-secondary` for a safe adjacent action or alternate route.
- Use `.icon-button` for compact controls such as the mobile navigation toggle.
- Use `StatusPill` for persisted lifecycle states and include a text label with every status.
- Use inline error panels with a retry action for failed reads. Do not show success before the backend response confirms it.
- Use empty states that explain which real API record is missing and provide a truthful next step.

## Shell and navigation

The desktop sidebar and mobile navigation share the same primary route definitions. The dashboard route uses exact matching so it does not appear active on nested job routes. The shell provides:

- API health state from the real `/api/health` request.
- Route-aware page titles and document titles.
- A breadcrumb landmark.
- A keyboard-accessible skip link targeting `#main-content`.
- Escape-to-close and first-link focus behavior for the mobile navigation.

## Dashboard data rules

Dashboard metric cards use `GET /api/v1/dashboard/metrics`. Recent jobs use the persisted jobs list, while execution signals and recent submissions/verifications use `GET /api/v1/dashboard/execution`. The recent activity section is assembled only from those returned records; it does not invent audit events or lifecycle transitions.

Charts should only be added when the backend exposes the required aggregate data. Until then, a clear empty or unavailable state is preferable to a decorative visualization with guessed values.

## Responsive and accessibility checks

- Test at narrow mobile widths before relying on multi-column layouts.
- Keep interactive targets large enough for touch input and preserve visible focus rings.
- Give every form control an accessible label, including search and filter controls.
- Use `aria-live` only for state changes users need announced, such as retry results or filtered result counts.
- Verify keyboard order after changing the shell, especially when opening the mobile menu.
