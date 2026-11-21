export type ReviewAction =
  | "cursorDown"
  | "cursorUp"
  | "extendDown"
  | "extendUp"
  | "toggleFlag"
  | "commentOrEdit"
  | "nextFinding"
  | "prevFinding"
  | "saveOrSubmit"
  | "escape"
  | "toggleHelp"

export type ReviewKeyScope = "grid" | "thread" | "summary" | "global"

export interface KeymapEntry {
  readonly action: ReviewAction
  readonly keys: readonly string[]
  readonly displayKeys: readonly string[]
  readonly label: string
  readonly description: string
  readonly scopes: readonly ReviewKeyScope[]
}

export const REVIEW_KEYMAP: readonly KeymapEntry[] = [
  {
    action: "cursorDown",
    keys: ["j", "ArrowDown"],
    displayKeys: ["j", "↓"],
    label: "Next line",
    description: "Move cursor down to the next flaggable line",
    scopes: ["grid", "global"],
  },
  {
    action: "cursorUp",
    keys: ["k", "ArrowUp"],
    displayKeys: ["k", "↑"],
    label: "Previous line",
    description: "Move cursor up to the previous flaggable line",
    scopes: ["grid", "global"],
  },
  {
    action: "extendDown",
    keys: ["J", "Shift+ArrowDown"],
    displayKeys: ["Shift+j", "Shift+↓"],
    label: "Extend range down",
    description: "Flag a contiguous range downward from the anchor line",
    scopes: ["grid", "global"],
  },
  {
    action: "extendUp",
    keys: ["K", "Shift+ArrowUp"],
    displayKeys: ["Shift+k", "Shift+↑"],
    label: "Extend range up",
    description: "Flag a contiguous range upward from the anchor line",
    scopes: ["grid", "global"],
  },
  {
    action: "toggleFlag",
    keys: ["f"],
    displayKeys: ["f"],
    label: "Toggle flag",
    description: "Flag or unflag the current cursor line",
    scopes: ["grid", "global"],
  },
  {
    action: "commentOrEdit",
    keys: ["c", "Enter"],
    displayKeys: ["c", "Enter"],
    label: "Comment / edit",
    description: "Flag current line and open or edit its inline thread",
    scopes: ["grid"],
  },
  {
    action: "nextFinding",
    keys: ["n"],
    displayKeys: ["n"],
    label: "Next finding",
    description: "Jump cursor to the next flagged finding",
    scopes: ["grid", "global"],
  },
  {
    action: "prevFinding",
    keys: ["p"],
    displayKeys: ["p"],
    label: "Previous finding",
    description: "Jump cursor to the previous flagged finding",
    scopes: ["grid", "global"],
  },
  {
    action: "saveOrSubmit",
    keys: ["Mod+Enter"],
    displayKeys: ["⌘/Ctrl+Enter"],
    label: "Save / submit",
    description: "Save active inline thread or submit the review",
    scopes: ["thread", "summary", "grid", "global"],
  },
  {
    action: "escape",
    keys: ["Escape"],
    displayKeys: ["Esc"],
    label: "Close / clear",
    description: "Close inline thread editor or clear range selection",
    scopes: ["thread", "summary", "grid", "global"],
  },
  {
    action: "toggleHelp",
    keys: ["?"],
    displayKeys: ["?"],
    label: "Keyboard shortcuts",
    description: "Show or hide this keyboard shortcuts reference",
    scopes: ["grid", "global"],
  },
] as const
