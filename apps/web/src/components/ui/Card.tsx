import { cn } from '@/lib/utils';

interface CardProps { children: React.ReactNode; className?: string; onClick?: () => void; }
interface CardHeaderProps { children: React.ReactNode; className?: string; }
interface CardBodyProps { children: React.ReactNode; className?: string; }
interface CardFooterProps { children: React.ReactNode; className?: string; }

export function Card({ children, className, onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'rounded-xl border border-gray-200 dark:border-gray-700',
        'bg-white dark:bg-gray-900 shadow-sm',
        onClick && 'cursor-pointer hover:border-brand-400 dark:hover:border-brand-600 transition-colors',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: CardHeaderProps) {
  return <div className={cn('px-4 py-3 border-b border-gray-100 dark:border-gray-800', className)}>{children}</div>;
}

export function CardBody({ children, className }: CardBodyProps) {
  return <div className={cn('px-4 py-4', className)}>{children}</div>;
}

export function CardFooter({ children, className }: CardFooterProps) {
  return <div className={cn('px-4 py-3 border-t border-gray-100 dark:border-gray-800', className)}>{children}</div>;
}
