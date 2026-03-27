 import React from 'react';
 import { Bell, BellOff, Loader2 } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { usePushNotifications } from '@/hooks/usePushNotifications';
 import { useAuth } from '@/context/AuthContext';
 import {
   Tooltip,
   TooltipContent,
   TooltipProvider,
   TooltipTrigger,
 } from '@/components/ui/tooltip';
 
 interface PushNotificationToggleProps {
   variant?: 'icon' | 'button';
   className?: string;
 }
 
 const PushNotificationToggle: React.FC<PushNotificationToggleProps> = ({ 
   variant = 'icon',
   className = ''
 }) => {
   const { user } = useAuth();
   const { isSupported, isSubscribed, permission, loading, subscribe, unsubscribe } = usePushNotifications();
 
  // Hide the button if user is not logged in, not supported, or already subscribed
  if (!user || !isSupported || isSubscribed) return null;
 
   const handleToggle = async () => {
    await subscribe();
   };
 
   const getTooltipText = () => {
     if (permission === 'denied') return 'تم رفض إذن الإشعارات من المتصفح';
     return 'تفعيل إشعارات الهاتف';
   };
 
   if (variant === 'button') {
     return (
       <Button
         onClick={handleToggle}
        disabled={loading || permission === 'denied'}
        variant="outline"
         className={`gap-2 ${className}`}
       >
         {loading ? (
           <Loader2 className="h-4 w-4 animate-spin" />
         ) : (
           <BellOff className="h-4 w-4" />
         )}
        تفعيل الإشعارات
       </Button>
     );
   }
 
   return (
     <TooltipProvider>
       <Tooltip>
         <TooltipTrigger asChild>
            <Button
              onClick={handleToggle}
              disabled={loading || permission === 'denied'}
              variant="ghost"
              size="icon"
              className={`relative ${className}`}
              aria-label="تفعيل الإشعارات"
            >
             {loading ? (
               <Loader2 className="h-5 w-5 animate-spin" />
             ) : (
               <BellOff className="h-5 w-5 text-muted-foreground" />
             )}
           </Button>
         </TooltipTrigger>
         <TooltipContent>
           <p>{getTooltipText()}</p>
         </TooltipContent>
       </Tooltip>
     </TooltipProvider>
   );
 };
 
 export default PushNotificationToggle;