import React from 'react';
import { toast } from 'sonner';
import { ShieldAlert, CheckCircle2, Info, Radio } from 'lucide-react';

export const cyberToast = {
  error: (message: string, code = 'ERR_AUTH') => {
    toast.error(message, {
      description: `SYS_ALERT // ${code}`,
      icon: <ShieldAlert className="text-[#ff3366] shrink-0" size={18} />,
      duration: 4000,
    });
  },

  success: (message: string, code = 'ACK_200') => {
    toast.success(message, {
      description: `SYS_CONFIRMED // ${code}`,
      icon: <CheckCircle2 className="text-[#00ff9d] shrink-0" size={18} />,
      duration: 3500,
    });
  },

  info: (message: string, code = 'INFO_SYS') => {
    toast.info(message, {
      description: `SYS_TELEMETRY // ${code}`,
      icon: <Radio className="text-[#00f0ff] shrink-0" size={18} />,
      duration: 3500,
    });
  },
};

export { toast };
