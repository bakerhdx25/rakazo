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
  { button, input, Keyboard, backspaceKeysym, lookupKeysym, documentTarget = globalThis.document },
) {
  if (!button || !input || !Keyboard || !documentTarget || rfb.viewOnly) return () => {};

  let lastValue = "";
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
    rfb.focusOnClick = !open;
  };
  const show = () => {
    input.focus();
    const length = input.value.length;
    input.setSelectionRange?.(length, length);
  };
  const hide = () => input.blur();
  const onButtonClick = () => (documentTarget.activeElement === input ? hide() : show());
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
    event.preventDefault();
  };

  resetInput();
  const keyboard = new Keyboard(input);
  keyboard.onkeyevent = (keysym, code, down) => rfb.sendKey(keysym, code, down);
  keyboard.grab();
  button.hidden = false;
  button.addEventListener("click", onButtonClick);
  input.addEventListener("input", onInput);
  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", onBlur);
  documentTarget.documentElement.addEventListener("mousedown", keepOpen, true);

  return () => {
    keyboard.ungrab?.();
    button.removeEventListener("click", onButtonClick);
    input.removeEventListener("input", onInput);
    input.removeEventListener("focus", onFocus);
    input.removeEventListener("blur", onBlur);
    documentTarget.documentElement.removeEventListener("mousedown", keepOpen, true);
  };
}
