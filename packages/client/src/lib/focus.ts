/**
 * Element to give focus back to when a dialog closes. Opened from a « ⋯ » menu item, the item is gone by then,
 * so fall back to the menu's trigger button (Radix marks it data-state="open").
 */
export function focusReturnTarget(): HTMLElement | null {
  const active =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  if (active?.closest('[role="menu"]'))
    return document.querySelector<HTMLElement>(
      '[aria-haspopup="menu"][data-state="open"]',
    );
  return active;
}
