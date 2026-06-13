/**
 * On-screen numeric keypad for mobile.
 *
 * Renders digits 0–9 plus Clear, Backspace (⌫) and Enter. It manages a small
 * internal string buffer and notifies the host via callbacks. Physical
 * keyboard input is also supported (handy on desktop).
 */
export class Keypad {
  /**
   * @param {HTMLElement} root      container the keypad is rendered into
   * @param {object} callbacks
   * @param {(value:string)=>void} callbacks.onChange   fires whenever the buffer changes
   * @param {(value:string)=>void} callbacks.onSubmit   fires on Enter / submit
   */
  constructor(root, { onChange, onSubmit }) {
    this.root = root;
    this.onChange = onChange || (() => {});
    this.onSubmit = onSubmit || (() => {});
    this.value = "";
    this._render();
    this._bindKeyboard();
  }

  _render() {
    // Layout grid, last row: Clear, 0, Backspace, with Enter spanning a column.
    const keys = [
      { label: "1", action: () => this.append("1") },
      { label: "2", action: () => this.append("2") },
      { label: "3", action: () => this.append("3") },
      { label: "4", action: () => this.append("4") },
      { label: "5", action: () => this.append("5") },
      { label: "6", action: () => this.append("6") },
      { label: "7", action: () => this.append("7") },
      { label: "8", action: () => this.append("8") },
      { label: "9", action: () => this.append("9") },
      { label: "C", action: () => this.clear(), cls: "key--util", aria: "Clear" },
      { label: "0", action: () => this.append("0") },
      { label: "\u232B", action: () => this.backspace(), cls: "key--util", aria: "Backspace" },
    ];

    this.root.innerHTML = "";
    const grid = document.createElement("div");
    grid.className = "keypad__grid";

    for (const k of keys) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `key ${k.cls || ""}`.trim();
      btn.textContent = k.label;
      btn.setAttribute("aria-label", k.aria || k.label);
      // Use pointerdown (fires immediately on touch) instead of click, which
      // carries a perceptible delay on mobile. preventDefault stops the
      // synthesized click, focus changes and scrolling for zero-lag input.
      btn.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          k.action();
        },
        { passive: false }
      );
      grid.appendChild(btn);
    }

    this.root.appendChild(grid);
  }

  _bindKeyboard() {
    this._keyHandler = (e) => {
      if (this.root.closest("[hidden]")) return; // ignore when keypad not visible
      if (e.key >= "0" && e.key <= "9") {
        this.append(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        this.backspace();
      } else if (e.key === "Escape") {
        this.clear();
      }
    };
    document.addEventListener("keydown", this._keyHandler);
  }

  append(digit) {
    if (this.value.length >= 3) return; // Zetamac answers are at most 3 digits
    this.value += digit;
    this.onChange(this.value);
  }

  backspace() {
    this.value = this.value.slice(0, -1);
    this.onChange(this.value);
  }

  clear() {
    this.value = "";
    this.onChange(this.value);
  }

  submit() {
    this.onSubmit(this.value);
  }

  /** Reset the buffer without firing onChange (used after a correct answer). */
  reset() {
    this.value = "";
  }
}
