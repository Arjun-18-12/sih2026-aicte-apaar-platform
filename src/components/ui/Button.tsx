import React from 'react';
import { cn } from '../../lib/utils';
import Spinner from './Spinner';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export default function Button({ variant = 'primary', size = 'md', loading, icon, children, className, disabled, ...props }: ButtonProps) {
  const variantClass = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    danger: 'btn-danger',
    ghost: 'btn-ghost',
  }[variant];

  const sizeClass = { sm: 'btn-sm', md: '', lg: 'btn-lg' }[size];

  return (
    <button className={cn('btn', variantClass, sizeClass, className)} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size={16} /> : icon}
      {children}
    </button>
  );
}
