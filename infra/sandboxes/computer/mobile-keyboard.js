const DEFAULT_INPUT_LENGTH = 100;

/** Return the remote key changes represented by a mobile input event. */
export function mobileInputChanges(oldValue, newValue, selectionStart = newValue.length) {
  const newLength = Math.max(selectionStart ?? newValue.length, newValue.length);
  const oldLength = oldValue.length;
  let inputCount = newLength - oldLength;
  let backspaces = inputCount < 0 ? -inputCount : 0;

  for (let index = 0; index < Math.min(oldLength, newLength); index += 1) {
    if (newValue.charAt(index) !== oldValue.charAt(index)) {
      inputCount = newLength - index;
      backspaces = oldLength - index;
      break;
    }
  }

  return {
    backspaces,
    text: newValue.slice(newLength - inputCount, newLength),
  };
}

/** True for browsers that can present a touch keyboard. */
export function isTouchBrowser(navigatorLike = globalThis.navigator, windowLike = globalThis) {
  return Boolean(navigatorLike?.maxTouchPoints > 0 || "ontouchstart" in windowLike);
}

/**
 * Connect a hidden text field to noVNC so iOS and Android keyboards can type
 * into the remote desktop. This follows noVNC's full-interface keyboard flow.
 */
export function attachMobileKeyboard(
  rfb,
  {
    button,
    input,
    Keyboard,
    backspaceKeysym,
    lookupKeysym,
    documentTarget = globalThis.document,
    windowTarget = documentTarget?.defaultView ?? globalThis,
  },
) {
  if (!button || !input || !Keyboard || !documentTarget || rfb.viewOnly) return () => {};

  let lastValue = "";
  let closeOnButtonClick = false;
  const visualViewport = windowTarget?.visualViewport;
  const viewportRoot = documentTarget.documentElement;
  const updateVisibleViewport = () => {
    if (documentTarget.activeElement !== input || !visualViewport) return;
    viewportRoot.style.setProperty("--mobile-visual-height", `${visualViewport.height}px`);
    viewportRoot.style.setProperty("--mobile-visual-top", `${visualViewport.offsetTop}px`);
  };
  const clearVisibleViewport = () => {
    viewportRoot.style.removeProperty("--mobile-visual-height");
    viewportRoot.style.removeProperty("--mobile-visual-top");
  };
  const resetInput = () => {
    input.value = "_".repeat(DEFAULT_INPUT_LENGTH - 1);
    lastValue = input.value;
  };
  const setOpen = (open) => {
    const label = open ? "Hide keyboard" : "Show keyboard";
    button.setAttribute("aria-pressed", String(open));
    button.setAttribute("aria-label", label);
    button.setAttribute("title", label);
    button.classList.toggle("active", open);
    viewportRoot.classList.toggle("mobile-keyboard-open", open);
    if (open) updateVisibleViewport();
    else clearVisibleViewport();
    rfb.focusOnClick = !open;
  };
  const show = () => {
    input.focus();
    const length = input.value.length;
    input.setSelectionRange?.(length, length);
  };
  const hide = () => input.blur();
  const onButtonPressStart = () => {
    if (documentTarget.activeElement === input) closeOnButtonClick = true;
  };
  const onButtonClick = () => {
    const shouldHide = closeOnButtonClick || documentTarget.activeElement === input;
    closeOnButtonClick = false;
    if (shouldHide) hide();
    else show();
  };
  const onFocus = () => setOpen(true);
  const onBlur = () => setOpen(false);
  const onInput = (event) => {
    if (!lastValue) resetInput();
    const newValue = event.target.value;
    const changes = mobileInputChanges(lastValue, newValue, event.target.selectionStart);
    for (let index = 0; index < changes.backspaces; index += 1) {
      rfb.sendKey(backspaceKeysym, "Backspace");
    }
    for (const character of changes.text) rfb.sendKey(lookupKeysym(character.codePointAt(0)));

    if (newValue.length > 2 * DEFAULT_INPUT_LENGTH) {
      resetInput();
    } else if (newValue.length < 1) {
      resetInput();
      input.blur();
      setTimeout(() => input.focus(), 0);
    } else {
      lastValue = newValue;
    }
  };
  const keepOpen = (event) => {
    if (documentTarget.activeElement !== input) return;
    // Let the toggle control dismiss without preventDefault swallowing the tap.
    if (event.target === button || button.contains?.(event.target)) return;
    event.preventDefault();
  };
  // Touch/pointer first: blur can run before a synthesized mousedown on mobile.
  const keepOpenEvents = ["pointerdown", "touchstart", "mousedown"];

  resetInput();
  const keyboard = new Keyboard(input);
  keyboard.onkeyevent = (keysym, code, down) => rfb.sendKey(keysym, code, down);
  keyboard.grab();
  button.hidden = false;
  for (const type of keepOpenEvents) button.addEventListener(type, onButtonPressStart);
  button.addEventListener("click", onButtonClick);
  input.addEventListener("input", onInput);
  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", onBlur);
  visualViewport?.addEventListener("resize", updateVisibleViewport);
  visualViewport?.addEventListener("scroll", updateVisibleViewport);
  for (const type of keepOpenEvents) {
    documentTarget.documentElement.addEventListener(type, keepOpen, true);
  }

  return () => {
    keyboard.ungrab?.();
    for (const type of keepOpenEvents) button.removeEventListener(type, onButtonPressStart);
    button.removeEventListener("click", onButtonClick);
    input.removeEventListener("input", onInput);
    input.removeEventListener("focus", onFocus);
    input.removeEventListener("blur", onBlur);
    visualViewport?.removeEventListener("resize", updateVisibleViewport);
    visualViewport?.removeEventListener("scroll", updateVisibleViewport);
    viewportRoot.classList.remove("mobile-keyboard-open");
    clearVisibleViewport();
    for (const type of keepOpenEvents) {
      documentTarget.documentElement.removeEventListener(type, keepOpen, true);
    }
  };
}
