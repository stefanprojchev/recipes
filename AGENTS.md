# Agent Instructions

All conventions, hard rules, and stack decisions for this codebase live in **`CLAUDE.md`** (single source of truth — read it first), with project-specific values in **`CLAUDE.project.md`**. Claude Code loads both automatically; other agents must read them before making changes.

Task walkthroughs (going live, adding a locale, writing blog posts, customizing OG images) live in `.claude/skills/` — follow the relevant skill file for those tasks.

Do not duplicate rules from `CLAUDE.md` into this file — it exists only as an entry point for tools that read the AGENTS.md standard.
