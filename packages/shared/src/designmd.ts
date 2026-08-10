/**
 * Serialize a learned Design DNA (`ThemeTokens`) into a Google **DESIGN.md** document
 * — the format Google Labs Code publishes for communicating a design system to AI agents
 * (https://github.com/google-labs-code/design.md): YAML frontmatter tokens + markdown prose.
 *
 * `toDesignMd()` is the full canonical document (download / recap appendix / `npx
 * @google/design.md lint`). `designMdPromptBlock()` is a compact variant injected into the
 * agent system prompts so preference-learning is handed to the model in Google's own format,
 * while respecting the live latency budget.
 *
 * `ThemeTokens` stays the internal source of truth; this is a pure, dependency-free mapping
 * onto Material-3 token roles.
 */

import type { ThemeTokens } from "./themes";

/** Parse a CSS dimension like "8px" / "16px" / "-0.02em" into number + unit (unit defaults to px).
 *  Tolerant of an undefined/empty value (a partial theme must not crash the whole app). */
function parseDim(value: string | undefined): { n: number; unit: string } {
  const m = /^(-?[\d.]+)\s*([a-z%]*)$/i.exec((value ?? "").trim());
  if (!m) return { n: 0, unit: "px" };
  return { n: parseFloat(m[1]!), unit: m[2] || "px" };
}

/** Scale a CSS dimension by a factor, keeping its unit (e.g. scaleDim("16px", 1.5) -> "24px"). */
function scaleDim(value: string, factor: number): string {
  const { n, unit } = parseDim(value);
  return `${Math.round(n * factor * 100) / 100}${unit}`;
}

/** YAML single-quoted scalar (font-family lists contain commas + double quotes).
 *  Tolerant of an undefined value so a partial theme can't throw mid-render. */
function yamlSingle(s: string | undefined): string {
  return `'${(s ?? "").replace(/'/g, "''")}'`;
}

/** The `colors:` block — ThemeTokens mapped onto Material-3 color roles. */
function colorsBlock(t: ThemeTokens): string[] {
  return [
    "colors:",
    `  primary: "${t.accent}"`,
    `  on-primary: "${t.bg}"`,
    `  secondary: "${t.accent2}"`,
    `  background: "${t.bg}"`,
    `  surface: "${t.surface}"`,
    `  surface-container: "${t.surface2}"`,
    `  on-surface: "${t.ink}"`,
    `  on-surface-variant: "${t.mut}"`,
    `  outline: "${t.border}"`,
  ];
}

function typographyBlock(t: ThemeTokens, full: boolean): string[] {
  const fam = yamlSingle(t.font);
  const body = [
    "  body-md:",
    `    fontFamily: ${fam}`,
    "    fontSize: 15px",
    '    fontWeight: "400"',
    "    lineHeight: 22px",
  ];
  if (!full) return ["typography:", ...body];
  return [
    "typography:",
    "  headline-lg:",
    `    fontFamily: ${fam}`,
    "    fontSize: 28px",
    '    fontWeight: "600"',
    "    lineHeight: 34px",
    "    letterSpacing: -0.01em",
    ...body,
    "  label-md:",
    `    fontFamily: ${fam}`,
    "    fontSize: 11px",
    '    fontWeight: "600"',
    "    lineHeight: 16px",
    "    letterSpacing: 0.04em",
  ];
}

function frontmatter(t: ThemeTokens, full: boolean): string[] {
  const lines: string[] = [
    `name: ${t.name}`,
    "version: alpha",
    `description: ${yamlSingle(t.vibe)}`,
    ...colorsBlock(t),
    ...typographyBlock(t, full),
    "rounded:",
    `  sm: ${scaleDim(t.radius, 0.5)}`,
    `  md: ${t.radius}`,
    `  lg: ${scaleDim(t.radius, 1.5)}`,
    "  full: 9999px",
    "spacing:",
    `  unit: ${t.pad}`,
    `  gutter: ${scaleDim(t.pad, 2)}`,
  ];
  if (full) {
    lines.push(
      "components:",
      "  button-primary:",
      '    backgroundColor: "{colors.primary}"',
      '    textColor: "{colors.on-primary}"',
      '    typography: "{typography.label-md}"',
      '    rounded: "{rounded.md}"',
      '    padding: "{spacing.unit}"',
      "  card:",
      '    backgroundColor: "{colors.surface}"',
      '    textColor: "{colors.on-surface}"',
      '    rounded: "{rounded.md}"',
      '    padding: "{spacing.gutter}"',
    );
  }
  return lines;
}

/** Full canonical DESIGN.md: frontmatter + prose in the spec's section order. */
export function toDesignMd(theme: ThemeTokens): string {
  const fm = frontmatter(theme, true).join("\n");
  const prose = [
    "## Overview",
    `**${theme.name}** is the design system learned from the meeting. It evokes ${theme.vibe}.`,
    `Hold to that reference: it carries its own restraint, so favour what it would include and omit what it would not.`,
    `${theme.density} density, ${theme.typeLabel} typography.`,
    "",
    "## Colors",
    `A ${theme.bg} background carries ${theme.surface} and ${theme.surface2} surfaces. Text is ${theme.ink} with ${theme.mut} for secondary copy, separated by ${theme.border} hairlines. ${theme.accent} is the primary accent and ${theme.accent2} the secondary — reserve them for emphasis, not large fills.`,
    "",
    "## Typography",
    `${theme.typeLabel}, set in ${theme.font}. Headlines are tight and confident; body copy stays comfortable and legible.`,
    "",
    "## Layout",
    `${theme.density} spacing built on a ${theme.pad} base unit, with room to breathe between regions.`,
    "",
    "## Elevation & Depth",
    `Depth is quiet: \`box-shadow: ${theme.shadow}\`. Lift surfaces only enough to read as layered — no heavy drop shadows.`,
    "",
    "## Shapes",
    `Corners are radius ${theme.radius}. Keep the radius consistent across cards, inputs, and buttons.`,
    "",
    "## Components",
    `Primary buttons use the primary accent with on-primary text. Cards sit on a surface with a single hairline border and the shared corner radius.`,
    "",
    "## Do's and Don'ts",
    `- **Do** treat this like a printed object — restrained, intentional, hierarchy carried by type and spacing.`,
    `- **Do** let "${theme.vibe}" decide ambiguous calls.`,
    `- **Don't** add gradients, glows, or decorative noise unless the reference itself calls for them.`,
  ].join("\n");
  return `---\n${fm}\n---\n\n${prose}\n`;
}

/** Compact DESIGN.md for prompt injection — tokens as context + a tight intent statement. */
export function designMdPromptBlock(theme: ThemeTokens): string {
  const fm = frontmatter(theme, false).join("\n");
  const prose = [
    "## Overview",
    `Evokes ${theme.vibe}. ${theme.density} density, ${theme.typeLabel} typography. Treat it like a printed object — restrained and intentional.`,
    "## Do's and Don'ts",
    `- Do let "${theme.vibe}" decide ambiguous visual calls.`,
    `- Don't add gradients, glows, or decorative noise unless that reference calls for them.`,
  ].join("\n");
  return `---\n${fm}\n---\n\n${prose}`;
}
