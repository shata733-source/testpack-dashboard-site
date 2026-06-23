# V24 B Item Root Cleanup

- Removed the stacked legacy V15/V16/V19/V20/V22/V23 client scripts that were fighting each other.
- USER CLEARED is now name only from the source/render logic, not from a repeating patch.
- Save/Clear Date use /api/bitem/state GET endpoint to avoid HTML fallback on preview deployments.
- Clear Date removes Punch Cleared Date and keeps the last editor name.
- Buttons are solid/non-transparent and easier to read.
