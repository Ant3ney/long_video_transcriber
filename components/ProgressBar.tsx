"use client";

// ============================================================
// Reusable progress bar component with label and percentage
// ============================================================

interface ProgressBarProps {
  /** Progress value from 0 to 100 */
  value: number;
  /** Optional label shown above the bar */
  label?: string;
  /** Show percentage text */
  showPercent?: boolean;
  /** Color variant */
  variant?: "blue" | "green" | "yellow" | "red" | "indigo";
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Additional class names */
  className?: string;
}

const colorMap = {
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  indigo: "bg-indigo-500",
};

const trackColorMap = {
  blue: "bg-blue-100 dark:bg-blue-950",
  green: "bg-emerald-100 dark:bg-emerald-950",
  yellow: "bg-amber-100 dark:bg-amber-950",
  red: "bg-red-100 dark:bg-red-950",
  indigo: "bg-indigo-100 dark:bg-indigo-950",
};

const sizeMap = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

export default function ProgressBar({
  value,
  label,
  showPercent = true,
  variant = "blue",
  size = "md",
  className = "",
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={className}>
      {(label || showPercent) && (
        <div className="flex justify-between items-center mb-1">
          {label && (
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {label}
            </span>
          )}
          {showPercent && (
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {Math.round(clamped)}%
            </span>
          )}
        </div>
      )}
      <div
        className={`w-full rounded-full overflow-hidden ${trackColorMap[variant]} ${sizeMap[size]}`}
      >
        <div
          className={`${sizeMap[size]} rounded-full transition-all duration-500 ease-out ${colorMap[variant]}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

