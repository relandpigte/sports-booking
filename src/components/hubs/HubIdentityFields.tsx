"use client";

import { useState } from "react";

import { Input } from "@/components/ui/Input";
import { HUB_SLUG_MAX_LENGTH, normalizeHubSlug, slugifyHubName } from "@/lib/hub-slug";

export function HubIdentityFields({
  defaultName = "",
  defaultSlug = "",
  nameField = "name",
  nameError,
  slugError,
}: {
  defaultName?: string;
  defaultSlug?: string;
  nameField?: "name" | "hubName";
  nameError?: string;
  slugError?: string;
}) {
  const [name, setName] = useState(defaultName);
  const [slug, setSlug] = useState(
    defaultSlug || slugifyHubName(defaultName)
  );
  const [customized, setCustomized] = useState(Boolean(defaultSlug));

  function updateName(nextName: string) {
    const previousGenerated = slugifyHubName(name);
    const nextGenerated = slugifyHubName(nextName);
    setName(nextName);
    if (!customized || slug === previousGenerated) {
      setSlug(nextGenerated);
      setCustomized(false);
    }
  }

  function updateSlug(value: string) {
    const normalized = normalizeHubSlug(value);
    setSlug(normalized);
    setCustomized(normalized !== slugifyHubName(name));
  }

  return (
    <div className="grid grid-cols-1 gap-5">
      <Input
        label="Hub Name"
        name={nameField}
        placeholder="e.g. Bunal Club"
        autoComplete="organization"
        value={name}
        onChange={(event) => updateName(event.target.value)}
        error={nameError}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="hub-public-slug" className="text-sm font-medium text-gray-800">
          Public URL slug
        </label>
        <div
          className={`flex min-h-11 overflow-hidden rounded-xl border bg-white transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 ${
            slugError ? "border-red-400" : "border-gray-300"
          }`}
        >
          <span className="inline-flex shrink-0 items-center border-r border-gray-200 bg-gray-50 px-3 text-sm text-gray-500 sm:px-4">
            <span className="hidden sm:inline">www.bunal.club</span>/hubs/
          </span>
          <input
            id="hub-public-slug"
            name="slug"
            value={slug}
            onChange={(event) => updateSlug(event.target.value)}
            onBlur={() => {
              if (!slug) {
                setSlug(slugifyHubName(name));
                setCustomized(false);
              }
            }}
            placeholder="bunal-club"
            minLength={3}
            maxLength={HUB_SLUG_MAX_LENGTH}
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            autoComplete="off"
            className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-sm font-medium text-navy placeholder:text-gray-400 focus:outline-none"
            aria-invalid={slugError ? true : undefined}
            aria-describedby="hub-public-slug-help"
          />
        </div>
        <p id="hub-public-slug-help" className="text-xs leading-5 text-gray-400">
          Generated from the hub name. You can customize it using lowercase
          letters, numbers, and hyphens. It must be unique.
        </p>
        {slugError && <p className="text-xs text-red-500">{slugError}</p>}
      </div>
    </div>
  );
}
