"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setSession } from "@/lib/session";

type UserOption = { id: number; name: string };

export default function LoginPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selected, setSelected] = useState<number | "">("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    fetch("/api/users")
      .then((r) => r.json())
      .then((d) => setUsers(d.users));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (selected === "" || pin.length === 0) return;

    const user = users.find((u) => u.id === selected)!;
    setChecking(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, pin }),
      });
      if (res.ok) {
        setSession({ userId: user.id, name: user.name, pin });
        router.push("/");
      } else {
        const d = await res.json();
        setError(d.error ?? "Something went wrong.");
      }
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16">
      <p className="font-mono text-xs tracking-widest2 text-amber uppercase mb-2">
        Mortal Locks
      </p>
      <h1 className="font-display text-3xl font-semibold mb-8">Who&apos;s picking?</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm text-mute mb-1">Name</label>
          <select
            className="w-full bg-panel border border-panelLine rounded-md px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-amber"
            value={selected}
            onChange={(e) => setSelected(Number(e.target.value))}
          >
            <option value="" disabled>
              Select your name
            </option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-mute mb-1">PIN</label>
          <input
            type="password"
            inputMode="numeric"
            className="w-full bg-panel border border-panelLine rounded-md px-3 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-amber"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="4-digit PIN"
          />
        </div>

        {error && <p className="text-loss text-sm">{error}</p>}

        <button
          type="submit"
          disabled={checking}
          className="w-full bg-amber text-field font-semibold rounded-md py-2 hover:opacity-90 transition disabled:opacity-50"
        >
          {checking ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}
