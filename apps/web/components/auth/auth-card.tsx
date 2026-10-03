export function AuthCard({ title, description, children, footer }: { title: string; description?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="w-full max-w-sm">
      <div className="panel rounded-2xl p-7 shadow-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description ? <p className="mt-1.5 text-sm text-fg-muted">{description}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? <div className="mt-5 text-center text-sm text-fg-subtle">{footer}</div> : null}
    </div>
  );
}
