export function DemoModeBadge() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm">
      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
      Demo Mode: replay data, no real outbound sends
    </div>
  );
}

