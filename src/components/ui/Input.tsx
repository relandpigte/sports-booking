import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  endAdornment?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, endAdornment, id, className = "", ...props }, ref) => {
    const inputId = id ?? props.name;
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-gray-800">
          {label}
        </label>
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            className={`w-full rounded-lg border bg-white px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 ${
              error ? "border-red-400" : "border-gray-300"
            } ${endAdornment ? "pr-16" : ""} ${className}`}
            aria-invalid={error ? true : undefined}
            {...props}
          />
          {endAdornment && (
            <div className="absolute inset-y-0 right-2 flex items-center">
              {endAdornment}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
