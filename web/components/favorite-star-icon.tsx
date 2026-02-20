import { cn } from "@/lib/utils";

export function FavoriteStarIcon({
  filled,
  size = 72,
  className,
}: {
  filled: boolean;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      width={size}
      height={size}
      style={{ width: size, height: size, minWidth: size, minHeight: size, flexShrink: 0 }}
      className={cn(
        "block shrink-0 transition-colors cursor-pointer",
        filled ? "fill-rose-500 stroke-rose-600" : "fill-transparent stroke-current",
        className,
      )}
    >
      <path
        d="M12 20.8l-1.2-1.1C5.2 14.7 2 11.8 2 8.2 2 5.3 4.3 3 7.2 3c1.6 0 3.1.7 4.1 1.9C12.3 3.7 13.8 3 15.4 3 18.3 3 20.6 5.3 20.6 8.2c0 3.6-3.2 6.5-8.8 11.5L12 20.8z"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
