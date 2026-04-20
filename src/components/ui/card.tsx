import * as React from 'react';
import { cn } from '@/lib/utils';

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('bg-[var(--surface)] border border-[var(--border)] rounded-sm overflow-hidden', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  dot?: 'cyan' | 'green' | 'orange' | 'red';
}

const CardHeader = React.forwardRef<HTMLDivElement, CardHeaderProps>(
  ({ className, dot = 'cyan', children, ...props }, ref) => {
    const dotColor = {
      cyan:   'bg-[var(--cyan)]',
      green:  'bg-[var(--green)]',
      orange: 'bg-[var(--orange)]',
      red:    'bg-[var(--red)]',
    }[dot];

    return (
      <div
        ref={ref}
        className={cn(
          'flex items-center gap-2 px-4 py-3 bg-[var(--surface2)] border-b border-[var(--border)] text-[11px] text-[var(--muted)] tracking-widest',
          className,
        )}
        {...props}
      >
        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', dotColor)} />
        {children}
      </div>
    );
  },
);
CardHeader.displayName = 'CardHeader';

const CardBody = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-5', className)} {...props} />
  ),
);
CardBody.displayName = 'CardBody';

export { Card, CardHeader, CardBody };
