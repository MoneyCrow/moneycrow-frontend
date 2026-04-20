import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold tracking-widest border',
  {
    variants: {
      variant: {
        pending:  'bg-yellow-400/15 text-[var(--orange)] border-yellow-400/30',
        active:   'bg-cyan-400/15   text-[var(--cyan)]   border-cyan-400/30',
        approved: 'bg-yellow-400/15 text-[var(--orange)] border-yellow-400/30',
        released: 'bg-green-400/15  text-[var(--green)]  border-green-400/30',
        refunded: 'bg-red-400/15    text-[var(--red)]    border-red-400/30',
      },
    },
    defaultVariants: { variant: 'active' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
