import { createContext, useContext } from 'react';
import type { AdminMe } from './types';

export const AdminMeContext = createContext<AdminMe | null>(null);

/** Membre de l'équipe connecté (disponible dans toutes les pages /admin). */
export function useStaffMember(): AdminMe & { isOwner: boolean } {
  const me = useContext(AdminMeContext);
  if (!me) throw new Error('useStaffMember() doit être utilisé dans l’espace dirigeant');
  return { ...me, isOwner: me.role === 'owner' };
}
