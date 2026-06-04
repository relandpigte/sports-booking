"use client";

import { useState } from "react";
import { GAMES } from "@/lib/constants";

export function GamesSelect({
  defaultValue = [],
}: {
  defaultValue?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultValue);

  function toggle(value: string) {
    setSelected((s) =>
      s.includes(value) ? s.filter((v) => v !== value) : [...s, value]
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-800">
        Games Offered{" "}
        <span className="font-normal text-gray-400">(court games)</span>
      </span>
      <div className="flex flex-wrap gap-2">
        {GAMES.map((g) => {
          const on = selected.includes(g.value);
          return (
            <button
              type="button"
              key={g.value}
              onClick={() => toggle(g.value)}
              aria-pressed={on}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                on
                  ? "border-primary bg-primary text-white"
                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {g.label}
            </button>
          );
        })}
      </div>
      {selected.map((v) => (
        <input key={v} type="hidden" name="games" value={v} />
      ))}
    </div>
  );
}
