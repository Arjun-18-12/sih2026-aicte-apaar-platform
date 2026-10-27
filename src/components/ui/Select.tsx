import React from 'react';
import { cn } from '../../lib/utils';
interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; error?: string; hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}
export default function Select({ label, error, hint, options, placeholder, className, id, ...props }: SelectProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '_');
  return (
    <div>
      {label && <label htmlFor={inputId} className="form-label">{label}</label>}
      <select id={inputId} className={cn('form-input', error && 'error', className)} {...props}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {error && <p className="form-error">{error}</p>}
      {!error && hint && <p className="form-hint">{hint}</p>}
    </div>
  );
}
