import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-hud font-semibold tracking-wider uppercase text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-r from-[#00f0ff] to-[#0070f3] text-[#030712] font-bold shadow-[0_0_20px_rgba(0,240,255,0.4)] hover:shadow-[0_0_30px_rgba(0,240,255,0.65)] hover:brightness-110 active:scale-[0.98]',
        destructive:
          'bg-[#ff3366] text-white shadow-[0_0_20px_rgba(255,51,102,0.4)] hover:bg-[#ff1f57] hover:shadow-[0_0_30px_rgba(255,51,102,0.6)]',
        outline:
          'border border-[#00f0ff]/30 bg-transparent text-[#00f0ff] hover:bg-[#00f0ff]/10 hover:border-[#00f0ff]/60 hover:shadow-[0_0_15px_rgba(0,240,255,0.25)]',
        secondary:
          'bg-[#1e293b] text-[#f8fafc] hover:bg-[#334155] border border-white/10',
        ghost:
          'text-[#94a3b8] hover:text-[#00f0ff] hover:bg-[#00f0ff]/10',
        link:
          'text-[#00f0ff] underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        default: 'h-11 px-5 py-2.5',
        sm: 'h-9 px-3 text-xs',
        lg: 'h-12 px-8 text-base tracking-widest',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };

