import * as React from 'react';
import { cn } from '../../lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-lg border bg-[#0b1329]/80 px-4 py-2 text-sm text-[#f8fafc] placeholder:text-[#64748b] transition-all file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 font-sans',
          error
            ? 'border-[#ff3366] shadow-[0_0_12px_rgba(255,51,102,0.35),inset_0_0_6px_rgba(255,51,102,0.15)] focus-visible:ring-1 focus-visible:ring-[#ff3366]'
            : 'border-[#00f0ff]/20 focus-visible:border-[#00f0ff] focus-visible:shadow-[0_0_15px_rgba(0,240,255,0.25)] focus-visible:ring-1 focus-visible:ring-[#00f0ff]',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };

