import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'w-full bg-[var(--bg)] border border-[var(--border2)] rounded-sm text-[var(--green)] font-mono text-[13px] px-3 py-2 outline-none transition-colors duration-150',
      'placeholder:text-[var(--muted2)] placeholder:italic',
      'focus:border-[var(--cyan)] focus:shadow-[0_0_0_1px_rgba(126,232,250,0.15)]',
      'disabled:opacity-35 disabled:cursor-not-allowed',
      'read-only:text-[var(--muted)] read-only:cursor-default',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export { Input };
