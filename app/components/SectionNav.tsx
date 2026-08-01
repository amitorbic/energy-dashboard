import Link from "next/link";
import { useRouter } from "next/router";

export interface SectionNavLink {
  label: string;
  href: string;
  comingSoon?: boolean;
  /** Override the default pathname match, for routes keyed off query params. */
  active?: boolean;
}

export interface SectionNavGroup {
  heading?: string | null;
  links: SectionNavLink[];
}

interface Props {
  /** Flat list of links, or use `groups` for headed sub-sections. */
  links?: SectionNavLink[];
  groups?: SectionNavGroup[];
  title?: string;
}

export default function SectionNav({ links, groups, title }: Props) {
  const router = useRouter();
  const resolvedGroups: SectionNavGroup[] = groups ?? [{ heading: null, links: links ?? [] }];

  return (
    <aside
      className="w-56 min-h-full shrink-0 py-3"
      style={{
        background: "var(--ct-surface)",
        borderRight: "1px solid var(--ct-border-subtle)",
      }}
    >
      {title && (
        <p
          className="px-4 pb-2 mb-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--ct-text-muted)", borderBottom: "1px solid var(--ct-border-subtle)" }}
        >
          {title}
        </p>
      )}
      {resolvedGroups.map((group, gi) => (
        <div key={gi} className={gi > 0 ? "mt-1" : ""}>
          {group.heading && (
            <p
              className="px-4 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--ct-text-muted)" }}
            >
              {group.heading}
            </p>
          )}
          {group.links.map((item) => {
            if (item.comingSoon) {
              return (
                <div
                  key={item.href}
                  className="flex items-center gap-2 px-4 py-2 text-[12.5px] cursor-not-allowed"
                  style={{ color: "var(--ct-text-muted)" }}
                >
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--ct-border-default)" }} />
                  <span>{item.label}</span>
                  <span
                    className="ml-auto text-[8px] font-bold tracking-wide px-1.5 py-0.5 rounded-full"
                    style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}
                  >
                    Soon
                  </span>
                </div>
              );
            }
            const active = item.active ?? router.pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2 px-4 py-2 text-[12.5px] transition-colors"
                style={
                  active
                    ? { background: "var(--accent-light-tint)", color: "var(--accent-light)", fontWeight: 600 }
                    : { color: "var(--ct-text-secondary)" }
                }
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: active ? "var(--accent-light)" : "var(--ct-border-strong)" }}
                />
                {item.label}
              </Link>
            );
          })}
        </div>
      ))}
    </aside>
  );
}
