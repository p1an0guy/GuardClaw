import type { HouseholdMember } from "@/lib/types";

interface Props {
  member: HouseholdMember;
}

export function HouseholdMemberCard({ member }: Props) {
  const isChild = member.role === "child";
  return (
    <article className="rounded-3xl border border-[var(--line)] bg-white/70 p-5 shadow-sm backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold">{member.name}</h3>
          <p className="text-sm capitalize text-[var(--muted)]">{member.role}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${
            member.status === "home" ? "bg-sage/15 text-green-900" : "bg-slate-100 text-slate-700"
          }`}
        >
          {member.status === "home" ? "At home" : "Away"}
        </span>
      </div>
      <div className="mt-5 rounded-2xl bg-stone-50/80 p-4">
        <p className="text-sm text-[var(--muted)]">
          {isChild
            ? "Most affected in this demo because the home signal confirms occupancy."
            : `Notify priority ${member.priority}. Preferred channels: ${member.channels.join(", ")}.`}
        </p>
      </div>
    </article>
  );
}

