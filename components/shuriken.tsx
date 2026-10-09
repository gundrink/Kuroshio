export function Shuriken({ size = 28, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={className ? `shuriken ${className}` : "shuriken"}
      width={size}
      height={size}
      viewBox="-50 -50 100 100"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M0-46 L11-11 L46 0 L11 11 L0 46 L-11 11 L-46 0 L-11-11Z M6.5 0A6.5 6.5 0 1 0-6.5 0A6.5 6.5 0 1 0 6.5 0Z"
      />
    </svg>
  );
}
