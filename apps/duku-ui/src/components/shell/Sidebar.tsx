import Link from "next/link";

const nav = [
  { href: "/", label: "Home" },
  { href: "/rate", label: "Rate" },
  { href: "/algo", label: "Algo" },
  { href: "/recs", label: "Recs" },
];

export function Sidebar() {
  return (
    <aside className="w-56 border-r bg-card/30">
      <div className="p-4 text-xl font-semibold">Duku</div>
      <nav className="grid gap-1 p-2">
        {nav.map((n) => (
          <Link key={n.href} href={n.href} className="px-3 py-2 rounded hover:bg-accent">
            {n.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}