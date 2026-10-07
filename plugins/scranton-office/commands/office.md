---
description: Open or close the Scranton office viewer in a split pane
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/office-launch.js"`

Relay the output above to the user in one short sentence. If it says the pane could not be opened automatically, show them the exact command to run in a separate terminal pane, and mention that the terminal needs Sixel support (Windows Terminal 1.22+, WezTerm, iTerm2, foot, mlterm).
