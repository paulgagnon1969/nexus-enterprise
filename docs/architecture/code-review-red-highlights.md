# Interpreting Red Highlights in Code Review Sidebar

## Executive summary
This document summarizes how to interpret red highlights and related visual indicators in the code review UI, based on prior discussion. It aims to make reviews more consistent, reduce confusion, and clarify what each visual cue means in practice.

## Context
- During code review, the UI shows red highlights or markers in the sidebar.
- There was uncertainty about whether these indicate errors, suggestions, or simple diffs.
- We want a clear mental model so reviewers and authors can respond appropriately.

## Visual indicators (stub)
- **Red highlights:** Typically indicate removed lines, potential issues, or areas of concern.
- **Green highlights:** Typically indicate added lines.
- **Sidebar markers:** Show where changes occur in the file and help navigate between hunks.

_(Exact meanings should be adjusted to match the specific tool you are using, e.g., GitHub, GitLab, or IDE plugin.)_

## Practical guidance
- Treat red-highlighted regions as areas to double-check for correctness, regressions, or style issues.
- Use comments to clarify intent when large deletions or significant changes appear.
- Don’t assume red always means “error”; it may simply mean “removed” in a diff.

## Detailed notes
_(To be filled in from the “Interpret Red Highlights in Code Review Sidebar” session: tool-specific behavior, any rules we agreed on, and examples.)_

## Decisions / Recommendations
- Align the team on how to interpret and act on these indicators.
- Consider adding screenshots or examples in this doc once finalized.

## Open questions
- Which exact review tool(s) should this doc target (e.g., GitHub PR UI in browser, Warp sidebar, IDE plugin)?
- Are there additional colors or icons (warnings, errors, suggestions) that need documenting?