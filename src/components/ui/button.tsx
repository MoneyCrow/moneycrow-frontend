import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // base
  'inline-flex items-center justify-center font-mono text-xs font-semibold tracking-wider border rounded-sm cursor-pointer transition-all duration-150 disabled:opacity-35 disabled:cursor-not-allowed select-none',
  {
    variants: {
      variant: {
        primary: 'bg-cyan-400/10 border-cyan-400 text-cyan-400 hover:enabled:bg-cyan-400/20',
        success: 'bg-green-400/10 border-green-400 text-green-400 hover:enabled:bg-green-400/20',
        danger:  'bg-red-400/10  border-red-400  text-red-400  hover:enabled:bg-red-400/20',
        ghost:   'border-transparent text-[var(--muted)] hover:enabled:text-[var(--text)] hover:enabled:bg-white/5',
      },
      size: {
        default: 'px-5 py-2',
        sm:      'px-3 py-1.5 text-[11px]',
        icon:    'px-3 py-2',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
