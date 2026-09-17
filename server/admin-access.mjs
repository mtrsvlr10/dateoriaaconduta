export function isAdministrator(user, email = process.env.ADMIN_EMAIL) {
  return Boolean(email?.trim() && user?.email_confirmed_at && user?.email?.toLowerCase() === email.trim().toLowerCase());
}
