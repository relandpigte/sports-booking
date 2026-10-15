"use client";

import { useRef, useState } from "react";
import { COURT_TYPES, GAMES } from "@/lib/constants";
import type { Court } from "@/lib/hubs";

type Row = {
  key: string;
  id: string;
  name: string;
  sport: string;
  courtType: string;
  rate: string;
};

export function CourtsEditor({
  defaultValue = [],
  defaultSports = ["pickleball"],
}: {
  defaultValue?: Court[];
  defaultSports?: string[];
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    defaultValue.map((c) => ({
      key: c.id,
      id: c.id,
      name: c.name,
      sport: c.sport ?? (defaultSports.length === 1 ? defaultSports[0] : ""),
      courtType: c.courtType,
      rate: c.hourlyRate != null ? String(c.hourlyRate) : "",
    }))
  );

  function add() {
    setRows((r) => [
      ...r,
      {
        key: crypto.randomUUID(),
        id: "",
        name: "",
        sport: defaultSports[0] ?? "",
        courtType: "covered",
        rate: "",
      },
    ]);
  }
  function remove(key: string) {
    setRows((r) => r.filter((x) => x.key !== key));
  }
  function patch(key: string, p: Partial<Row>) {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));
  }

  // The rows post in DOM order, and the server saves that order as each
  // court's sortOrder — so reordering here is all it takes.
  const listRef = useRef<HTMLDivElement>(null);
  // Native drag only starts from the grip, so text in the inputs can still be
  // selected with the mouse.
  const [armedKey, setArmedKey] = useState<string | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  function moveTo(key: string, target: number) {
    setRows((r) => {
      const from = r.findIndex((x) => x.key === key);
      if (from < 0 || target < 0 || target >= r.length || from === target) {
        return r;
      }
      const next = [...r];
      const [row] = next.splice(from, 1);
      next.splice(target, 0, row);
      return next;
    });
  }

  function step(key: string, index: number, direction: -1 | 1) {
    const target = index + direction;
    moveTo(key, target);
    // Moving a row can detach the focused button from the DOM. Put focus
    // back on the same control, or its sibling once the row hits an end.
    const atEnd = target === 0 || target === rows.length - 1;
    const focus = atEnd ? (direction === -1 ? "down" : "up") : direction === -1 ? "up" : "down";
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector<HTMLButtonElement>(
          `[data-row="${key}"] [data-move="${focus}"]`
        )
        ?.focus();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="text-sm font-medium text-gray-800">
          Courts <span className="font-normal text-gray-400">({rows.length})</span>
        </span>
        <p className="text-xs text-gray-500">
          Each court follows the hub&apos;s operating hours. Set a type and
          hourly rate per court, and drag or use the arrows to set the order
          players see.
        </p>
      </div>

      <div ref={listRef} className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div
            key={row.key}
            data-row={row.key}
            draggable={armedKey === row.key}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              // Firefox won't start a drag without data.
              e.dataTransfer.setData("text/plain", row.name);
              setDraggingKey(row.key);
            }}
            onDragOver={(e) => {
              if (!draggingKey) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (draggingKey !== row.key) moveTo(draggingKey, i);
            }}
            onDrop={(e) => e.preventDefault()}
            onDragEnd={() => {
              setDraggingKey(null);
              setArmedKey(null);
            }}
            className={`flex flex-wrap items-center gap-2 rounded-lg border p-2 transition-colors ${
              draggingKey === row.key
                ? "border-primary/50 bg-primary/5 opacity-60"
                : "border-gray-200"
            }`}
          >
            <div className="flex items-center gap-0.5">
              <span
                onPointerDown={() => setArmedKey(row.key)}
                onPointerUp={() => setArmedKey(null)}
                title="Drag to reorder"
                aria-hidden="true"
                className="hidden cursor-grab touch-none rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 active:cursor-grabbing sm:inline-flex"
              >
                <GripIcon />
              </span>
              <div className="flex flex-col">
                <button
                  type="button"
                  data-move="up"
                  onClick={() => step(row.key, i, -1)}
                  disabled={i === 0}
                  aria-label={`Move ${row.name || `court ${i + 1}`} up`}
                  className="rounded p-0.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronIcon direction="up" />
                </button>
                <button
                  type="button"
                  data-move="down"
                  onClick={() => step(row.key, i, 1)}
                  disabled={i === rows.length - 1}
                  aria-label={`Move ${row.name || `court ${i + 1}`} down`}
                  className="rounded p-0.5 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:pointer-events-none disabled:opacity-30"
                >
                  <ChevronIcon direction="down" />
                </button>
              </div>
            </div>
            <input type="hidden" name="courtIds" value={row.id} />
            <input
              name="courtNames"
              value={row.name}
              onChange={(e) => patch(row.key, { name: e.target.value })}
              placeholder={`Court ${i + 1} name`}
              className="min-w-[8rem] flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <select
              name="courtSports"
              value={row.sport}
              required
              onChange={(e) => patch(row.key, { sport: e.target.value })}
              aria-label={`${row.name || `Court ${i + 1}`} sport`}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="">Choose sport</option>
              {GAMES.map((game) => (
                <option key={game.value} value={game.value}>
                  {game.label}
                </option>
              ))}
            </select>
            <select
              name="courtTypes"
              value={row.courtType}
              onChange={(e) => patch(row.key, { courtType: e.target.value })}
              aria-label="Court type"
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              {COURT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <span className="text-sm text-gray-400">₱</span>
              <input
                name="courtRates"
                type="number"
                min="0"
                step="0.01"
                value={row.rate}
                onChange={(e) => patch(row.key, { rate: e.target.value })}
                placeholder="0.00"
                aria-label="Hourly rate"
                className="w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-xs text-gray-400">/hr</span>
            </div>
            <button
              type="button"
              onClick={() => remove(row.key)}
              className="rounded-md px-2 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="self-start rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
      >
        + Add court
      </button>
    </div>
  );
}

function GripIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="6" r="1.6" />
      <circle cx="15" cy="6" r="1.6" />
      <circle cx="9" cy="12" r="1.6" />
      <circle cx="15" cy="12" r="1.6" />
      <circle cx="9" cy="18" r="1.6" />
      <circle cx="15" cy="18" r="1.6" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === "up" ? "M6 15l6-6 6 6" : "M6 9l6 6 6-6"} />
    </svg>
  );
}
