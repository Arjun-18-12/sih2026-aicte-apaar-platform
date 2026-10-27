import React from 'react';
import { cn } from '../../lib/utils';
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string; error?: string; hint?: string;
}
export default function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '_');
  return (
    <div>
      {label && <label htmlFor={inputId} className="form-label">{label}</label>}
      <input id={inputId} className={cn('form-input', error && 'error', className)} {...props} />
      {error && <p className="form-error">{error}</p>}
      {!error && hint && <p className="form-hint">{hint}</p>}
    </div>
  );
}
