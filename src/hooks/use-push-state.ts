import { useSyncExternalStore } from 'react';
import { getPushState, onPushState } from '@/lib/push';

export const usePushState = () => useSyncExternalStore(onPushState, getPushState);
