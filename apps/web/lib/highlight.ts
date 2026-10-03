import "server-only";
import { createHighlighter, type Highlighter, type ThemeRegistration } from "shiki";

/** Custom code theme tuned to the INRENT palette (mint strings, iris keywords, amber numbers). */
const inrentTheme: ThemeRegistration = {
  name: "inrent-dark",
  type: "dark",
  colors: { "editor.background": "#00000000", "editor.foreground": "#d9dde6" },
  tokenColors: [
    { scope: ["comment", "punctuation.definition.comment"], settings: { foreground: "#5d6474", fontStyle: "italic" } },
    { scope: ["string", "string.quoted", "string.template"], settings: { foreground: "#7ff0cd" } },
    { scope: ["constant.numeric", "constant.language", "constant.language.boolean"], settings: { foreground: "#f5b455" } },
    { scope: ["keyword", "storage", "storage.type", "keyword.control", "keyword.operator.new"], settings: { foreground: "#a3a9ff" } },
    { scope: ["entity.name.function", "support.function", "meta.function-call"], settings: { foreground: "#8ecbff" } },
    { scope: ["variable.parameter", "variable.other.property", "meta.object-literal.key", "support.type.property-name"], settings: { foreground: "#e4e7ee" } },
    { scope: ["support.type.property-name.json"], settings: { foreground: "#a3c8ff" } },
    { scope: ["entity.name.type", "entity.name.class", "support.class"], settings: { foreground: "#f0c987" } },
    { scope: ["variable.other.constant", "variable.language"], settings: { foreground: "#ffb2a6" } },
    { scope: ["punctuation", "meta.brace", "keyword.operator"], settings: { foreground: "#8a91a1" } },
    { scope: ["entity.name.tag"], settings: { foreground: "#a3a9ff" } },
    { scope: ["entity.other.attribute-name"], settings: { foreground: "#8ecbff" } },
    { scope: ["variable.other.env", "variable.other.normal.shell", "punctuation.definition.variable.shell"], settings: { foreground: "#f5b455" } },
  ],
};

const LANGS = ["bash", "shell", "python", "javascript", "typescript", "tsx", "json", "yaml", "http", "diff", "dockerfile", "sql", "toml", "text"] as const;

let highlighter: Promise<Highlighter> | null = null;

function getHighlighter() {
  highlighter ??= createHighlighter({ themes: [inrentTheme], langs: LANGS.filter((l) => l !== "text") });
  return highlighter;
}

const ALIASES: Record<string, string> = { sh: "bash", zsh: "bash", curl: "bash", js: "javascript", ts: "typescript", node: "javascript", py: "python", yml: "yaml" };

export async function highlight(code: string, lang = "text"): Promise<string> {
  const h = await getHighlighter();
  const normalized = ALIASES[lang] ?? lang;
  const loaded = h.getLoadedLanguages().includes(normalized) ? normalized : "text";
  return h.codeToHtml(code.replace(/\n$/, ""), { lang: loaded, theme: "inrent-dark" });
}
