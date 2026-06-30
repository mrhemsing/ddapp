# UI Narration Contract

Narration should describe actions and outcomes, not interface labels, colors, or temporary screen-state words that can change independently.

Examples:

- Prefer "tap to begin" over naming a specific button label.
- Prefer "the stop will open" over naming a transient screen state.
- Avoid color instructions unless the color is treated as a fixed product contract.

If narration must reference a UI label, color, or state word, that reference becomes a matched pair. Any later UI change to the referenced label, color, or state must update the matching narration in the same change.
