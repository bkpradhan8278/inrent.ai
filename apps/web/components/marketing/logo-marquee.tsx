import { BrandLogo } from "@/components/brand/icons";

const BRANDS = [
  { id: "openai", name: "OpenAI" },
  { id: "anthropic", name: "Anthropic" },
  { id: "google", name: "Google Gemini" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "qwen", name: "Qwen" },
  { id: "mistral", name: "Mistral" },
  { id: "zai", name: "Z.ai GLM" },
  { id: "meta", name: "Meta Llama" },
  { id: "xai", name: "xAI" },
  { id: "moonshotai", name: "Moonshot Kimi" },
  { id: "vllm", name: "vLLM" },
];

/** Infinite logo strip of model vendors INRENT has integrations for (configured per provider). */
export function LogoMarquee() {
  const row = (hidden: boolean) =>
    BRANDS.map((b) => (
      <li key={`${b.id}-${hidden}`} aria-hidden={hidden || undefined} className="flex h-12 shrink-0 items-center gap-2.5 rounded-xl border border-border bg-surface/70 px-4 text-[14.5px] font-medium text-fg-muted transition-colors hover:border-border-strong hover:text-fg">
        <BrandLogo brand={b.id} size={22} />
        {b.name}
      </li>
    ));
  return (
    <section className="border-y border-border bg-bg-elevated/60" aria-label="Model vendors">
      <div className="container-page flex flex-col items-center gap-6 py-10">
        <p className="max-w-2xl text-center text-[13.5px] text-fg-subtle">
          Integrations are configured per provider: platform-funded where terms allow, your own key where they don&apos;t.
        </p>
        <div className="marquee-host relative w-full overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_8%,#000_92%,transparent)]">
          <ul className="marquee flex w-max gap-3">
            {row(false)}
            {row(true)}
          </ul>
        </div>
      </div>
    </section>
  );
}
