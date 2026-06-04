import { forwardRef, type TextareaHTMLAttributes } from "react";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, id, className = "", ...props }, ref) => {
    const textareaId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={textareaId} className="text-sm font-medium text-gray-800">
          {label}
        </label>
        <textarea
          ref={ref}
          id={textareaId}
          className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
            error ? "border-red-400" : "border-gray-300"
          } ${className}`}
          aria-invalid={error ? true : undefined}
          {...props}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";
