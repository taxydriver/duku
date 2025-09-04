// apps/duku-ui/src/app/page.tsx
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Welcome to Duku 🎬</h1>
      <p className="text-muted-foreground">
        Discover yourself by rating movies and playing with algorithms.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/rate"
          className="rounded-lg border p-6 hover:bg-accent transition"
        >
          <h2 className="font-semibold mb-2">Rate Movies →</h2>
          <p className="text-sm text-muted-foreground">
            Build your profile by rating popular films.
          </p>
        </Link>

        <Link
          href="/algo"
          className="rounded-lg border p-6 hover:bg-accent transition"
        >
          <h2 className="font-semibold mb-2">Algo Playground →</h2>
          <p className="text-sm text-muted-foreground">
            Play with algorithms, adjust knobs, and see what comes out.
          </p>
        </Link>

        <Link
          href="/recs"
          className="rounded-lg border p-6 hover:bg-accent transition"
        >
          <h2 className="font-semibold mb-2">Recommendations →</h2>
          <p className="text-sm text-muted-foreground">
            Get movie picks tailored for you.
          </p>
        </Link>
      </div>
    </div>
  );
}