/** Address of the public fan app (event pages, ticket links, demo M-Pesa phone). */
export const FAN_URL = (import.meta.env.VITE_FAN_URL as string | undefined)?.replace(/\/$/, '') || 'http://localhost:5173';
