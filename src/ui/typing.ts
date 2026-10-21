/** True when a keyboard event target is a text field, so game keys should stay out of the way. */
export function isTyping(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && (t.matches('input, textarea, select') || t.isContentEditable);
}
