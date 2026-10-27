import React from 'react';
import { cn } from '../../lib/utils';
type BadgeVariant = 'blue' | 'green' | 'yellow' | 'red' | 'gray';
interface BadgeProps { variant?: BadgeVariant; children: React.ReactNode; className?: string; }
export default function Badge({ variant = 'gray', children, className }: BadgeProps) {
  return <span className={cn('badge', `badge-${variant}`, className)}>{children}</span>;
}
