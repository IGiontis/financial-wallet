---
name: mockups
description: How to show the owner 2–3 rendered UI options for MyFiWallet before building anything visible. Use for any new page, layout change or restyle he will look at.
---

# Mockups for the owner

He picks from concrete pictures; prose descriptions have misfired. "I trust you" covers logic,
not looks.

1. **Start from what exists**: open the current screen in the demo (http://[::1]:5174, dev-emu)
   and the pages it must match (Goals, Debts/Bills). Improve his current look rather than
   replacing its structure.
2. **2–3 options**, really different from each other, each built from the app's own pieces
   (`docs/COMPONENTS.md`) and tokens (blue colourway, light; one in dark if colour matters),
   with the app's real Greek wording and realistic figures. Phone width (≈375px) first, desktop
   beside it when the layout changes there.
3. Render them (the visualize widget, or an HTML file in the scratchpad opened in the browser
   pane) — never ASCII or bullet lists.
4. Label them Α / Β / Γ, one line each on what is different, and **name your recommendation**
   and why. Pair any data question the design forces (how a field is entered, where it is
   stored).
5. Wait for his pick. Then build exactly that, and record the choice in `docs/DECISIONS.md`.
