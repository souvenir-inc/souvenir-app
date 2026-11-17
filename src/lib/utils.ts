import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge only knows Tailwind's default scales. Without this, `text-body` would be read as a
// text colour and dropped by a later `text-[var(--…)]`, and `p-inset-md` would not replace `p-2`.
// Keep in step with the @theme block in src/styles/tokens/scales.css.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: [
        "inset-xs", "inset-sm", "inset-md", "inset-lg", "inset-xl",
        "stack-xs", "stack-sm", "stack-md", "stack-lg", "stack-xl",
        "inline-xs", "inline-sm", "inline-md", "inline-lg",
      ],
    },
    classGroups: {
      "font-size": [{
        text: ["display", "heading-xl", "heading", "heading-md", "heading-sm", "body-lg", "body", "body-sm", "small", "caption", "code"],
      }],
      shadow: [{ shadow: ["1", "2", "3", "4", "soft", "panel", "tile"] }],
      duration: [{ duration: ["instant", "fast", "base", "slow"] }],
      ease: [{ ease: ["standard", "emphasized", "exit"] }],
      z: [{ z: ["base", "raised", "sticky", "dropdown", "overlay", "modal", "popover", "toast", "tooltip"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
