/** 0788123456 -> 078****456. Phone numbers are personal data, so logs only get this. */
export function maskPhone(phone: string): string {
  return phone.length < 7
    ? '***'
    : `${phone.slice(0, 3)}${'*'.repeat(phone.length - 6)}${phone.slice(-3)}`;
}
