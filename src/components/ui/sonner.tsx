import React from 'react';
import { Toaster as SonnerToaster } from 'sonner';

type ToasterProps = React.ComponentProps<typeof SonnerToaster>;

export function Toaster({ ...props }: ToasterProps) {
  return (
    <SonnerToaster
      theme="dark"
      position="top-center"
      richColors
      closeButton
      style={{ zIndex: 99999 }}
      toastOptions={{
        style: {
          background: 'rgba(9, 14, 26, 0.98)',
          border: '1px solid rgba(0, 240, 255, 0.4)',
          color: '#f8fafc',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.9), 0 0 25px rgba(0, 240, 255, 0.25)',
          backdropFilter: 'blur(20px)',
          fontFamily: 'Rajdhani, sans-serif',
          fontSize: '15px',
          fontWeight: 600,
          letterSpacing: '0.5px',
          borderRadius: '12px',
          padding: '12px 18px',
        },
        classNames: {
          description: 'text-[#94a3b8] font-mono text-xs mt-0.5',
          error: '!border-[#ff3366]/80 !text-[#ff3366] !shadow-[0_20px_50px_rgba(0,0,0,0.95),0_0_25px_rgba(255,51,102,0.35)]',
          success: '!border-[#00ff9d]/80 !text-[#00ff9d] !shadow-[0_20px_50px_rgba(0,0,0,0.95),0_0_25px_rgba(0,255,157,0.35)]',
          info: '!border-[#00f0ff]/80 !text-[#00f0ff] !shadow-[0_20px_50px_rgba(0,0,0,0.95),0_0_25px_rgba(0,240,255,0.35)]',
        },
      }}
      {...props}
    />
  );
}
