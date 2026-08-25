type Props = {
  className?: string;
  /** Reserve space without shimmer (e.g. fixed-height map shell). */
  static?: boolean;
};

export function Skeleton({ className = '', static: isStatic }: Props) {
  return (
    <div
      className={[isStatic ? 'rounded-lg bg-surface' : 'skeleton', className]
        .filter(Boolean)
        .join(' ')}
      aria-hidden
    />
  );
}
