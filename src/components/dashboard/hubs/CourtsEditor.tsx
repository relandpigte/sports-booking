"use client";

import { useState } from "react";
import { COURT_TYPES } from "@/lib/constants";
import type { Court } from "@/lib/hubs";

type Row = {
  key: string;
  id: string;
  name: string;
  courtType: string;
  rate: string;
};

export function CourtsEditor({ defaultValue = [] }: { defaultValue?: Court[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    defaultValue.map((c) => ({
      key: c.id,
      id: c.id,
      name: c.name,
      courtType: c.courtType,
      rate: c.hourlyRate != null ? String(c.hourlyRate) : "",
    }))
  );

  function add() {
    setRows((r) => [
      ...r,
      { key: crypto.randomUUID(), id: "", name: "", courtType: "covered", rate: "" },
    ]);
  }
  function remove(key: string) {
    setRows((r) => r.filter((x) => x.key !== key));
  }
  function patch(key: string, p: Partial<Row>) {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...p } : x)));
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="text-sm font-medium text-gray-800">
          Courts <span className="font-normal text-gray-400">({rows.length})</span>
        </span>
        <p className="text-xs text-gray-500">
          Each court follows the hub&apos;s operating hours. Set a type and
          hourly rate per court.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div
            key={row.key}
            className="flex flex-wrap items-center gap-2 rounded-lg border border-gray-200 p-2"
          >
            <input type="hidden" name="courtIds" value={row.id} />
            <input
              name="courtNames"
              value={row.name}
              onChange={(e) => patch(row.key, { name: e.target.value })}
              placeholder={`Court ${i + 1} name`}
              className="min-w-[8rem] flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
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
