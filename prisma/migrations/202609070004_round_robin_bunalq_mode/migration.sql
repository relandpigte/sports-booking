-- Round Robin remains distinct from the adaptive Balanced mode so existing
-- BunalQ runs retain their configured matching behavior.
ALTER TYPE "OpenPlayMatchingMode" ADD VALUE IF NOT EXISTS 'ROUND_ROBIN';
