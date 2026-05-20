/** Strip anything that isn't a letter, space, hyphen, or apostrophe */
export function filterName(input: string): string {
  return input.replace(/[^a-zA-Z\s\-']/g, '');
}

/** Auto-format phone to (XXX) XXX-XXXX as user types */
export function formatPhone(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function isValidName(name: string): boolean {
  return name.trim().length >= 2 && /^[a-zA-Z\s\-']+$/.test(name.trim());
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

export function isValidPhone(phone: string): boolean {
  return phone.replace(/\D/g, '').length === 10;
}

export function isValidPassword(password: string): boolean {
  return password.length >= 6;
}
