const ADMIN_UNLOCK_KEY = 'roster_admin_unlocked';
const ADMIN_PASSWORD = '1430';

export const adminAuthService = {
  isUnlocked(): boolean {
    return sessionStorage.getItem(ADMIN_UNLOCK_KEY) === 'true';
  },

  unlock(password: string): boolean {
    if (password !== ADMIN_PASSWORD) return false;
    sessionStorage.setItem(ADMIN_UNLOCK_KEY, 'true');
    return true;
  },

  lock(): void {
    sessionStorage.removeItem(ADMIN_UNLOCK_KEY);
  },
};
