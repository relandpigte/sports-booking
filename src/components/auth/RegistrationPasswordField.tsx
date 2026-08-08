"use client";

import { useState } from "react";

import { Input } from "@/components/ui/Input";
import { generateSuggestedPassword } from "@/lib/password-suggestion";

export function RegistrationPasswordField({ error }: { error?: string }) {
  const [password, setPassword] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);

  function suggestPassword() {
    const generated = generateSuggestedPassword();
    setPassword(generated);
    setSuggestion(generated);
    setCopyStatus("");
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(suggestion);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Copy unavailable");
    }
  }

  return (
    <div>
      <Input
        label="Password"
        name="password"
        type={passwordVisible ? "text" : "password"}
        placeholder="At least 15 characters"
        autoComplete="new-password"
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          if (event.target.value !== suggestion) setSuggestion("");
          setCopyStatus("");
        }}
        error={error}
        endAdornment={
          <button
            type="button"
            onClick={() => setPasswordVisible((visible) => !visible)}
            aria-label={passwordVisible ? "Hide password" : "Show password"}
            aria-pressed={passwordVisible}
            className="min-h-9 rounded-md px-2 text-xs font-semibold text-primary transition-colors hover:bg-primary-soft"
          >
            {passwordVisible ? "Hide" : "Show"}
          </button>
        }
      />

      {suggestion ? (
        <div className="mt-2.5 rounded-xl border border-[#dfe7e2] bg-primary-soft p-3">
          <p className="text-xs font-semibold text-navy">Suggested password</p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-white px-3 py-2 text-sm font-semibold text-navy">
              {suggestion}
            </code>
            <button
              type="button"
              onClick={copyPassword}
              className="min-h-10 shrink-0 rounded-lg border border-primary/20 bg-white px-3 text-xs font-bold text-primary transition-colors hover:bg-accent-soft"
            >
              {copyStatus === "Copied" ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p aria-live="polite" className="text-xs text-gray-500">
              {copyStatus || "Save this password somewhere secure."}
            </p>
            <button
              type="button"
              onClick={suggestPassword}
              className="shrink-0 text-xs font-semibold text-primary hover:underline"
            >
              Generate another
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={suggestPassword}
          className="mt-2 text-xs font-semibold text-primary hover:underline"
        >
          Suggest a strong password
        </button>
      )}
    </div>
  );
}
