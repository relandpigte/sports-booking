export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width="40"
        height="40"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="logoSwirl" x1="6" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="#F4A24C" />
            <stop offset="0.5" stopColor="#E97C3C" />
            <stop offset="1" stopColor="#D94f3d" />
          </linearGradient>
        </defs>
        <path
          d="M24 6c9.94 0 18 8.06 18 18 0 4-3 7-7 7-3.5 0-5.5-2.5-9-2.5-4 0-6.5 4.5-11 4.5"
          stroke="url(#logoSwirl)"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M24 42c-9.94 0-18-8.06-18-18 0-4 3-7 7-7 3.5 0 5.5 2.5 9 2.5 4 0 6.5-4.5 11-4.5"
          stroke="url(#logoSwirl)"
          strokeWidth="5"
          strokeLinecap="round"
          fill="none"
          opacity="0.85"
        />
      </svg>
      <span className="text-2xl font-extrabold tracking-tight text-gray-900">
        SPORTS <span className="text-primary">360</span>
      </span>
    </div>
  );
}
