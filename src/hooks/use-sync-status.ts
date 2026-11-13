import { useSyncExternalStore } from 'react';
import { getSyncStatus, onSyncStatus } from '@/lib/sync';

export const useSyncStatus = () => useSyncExternalStore(onSyncStatus, getSyncStatus);
