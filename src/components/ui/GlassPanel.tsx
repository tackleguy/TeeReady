import type { HTMLAttributes, ReactNode } from 'react';

interface Props extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'high';
  children: ReactNode;
}

export function GlassPanel({
  variant = 'default',
  className = '',
  children,
  ...rest
}: Props) {
  const panelClass =
    variant === 'high' ? 'floating-panel' : 'floating-subpanel';
  return (
    <div
      className={`${panelClass} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
