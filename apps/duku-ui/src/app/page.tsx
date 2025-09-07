"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function HomePage() {
  const [signedIn, setSignedIn] = useState(false);

  // Check cookie on mount
  useEffect(() => {
    const match = document.cookie.match(/duku_user_id=([^;]+)/);
    setSignedIn(!!match);
  }, []);

  const handleSignOut = async () => {
    await fetch("/api/user/signout", { method: "POST" });
    document.cookie = "duku_user_id=; Max-Age=0; path=/"; // clear client
    setSignedIn(false);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Welcome to Duku 🎬</h1>
      <p className="text-muted-foreground">
        Discover yourself by rating movies and playing with algorithms.
      </p>

      {/* Auth actions */}
      <div className="flex space-x-4">
        {!signedIn && (
          <>
            <Link
              href="/register"
              className="rounded-md bg-green-600 text-white px-4 py-2 hover:bg-green-700 transition"
            >
              Register
            </Link>
            <Link
              href="/signin"
              className="rounded-md bg-blue-600 text-white px-4 py-2 hover:bg-blue-700 transition"
            >
              Sign In
            </Link>
          </>
        )}
        {signedIn && (
          <button
            onClick={handleSignOut}
            className="rounded-md bg-red-600 text-white px-4 py-2 hover:bg-red-700 transition"
          >
            Sign Out
          </button>
        )}
      </div>

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