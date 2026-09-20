/**
 * Date and Time formatting utilities for PekePark Admin OS
 * Ensures unified 12-Hour AM/PM formatting across all client devices and operating systems.
 */

export function formatTime12H(dateInput: Date | string | number | null | undefined, includeSeconds = false): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
    hour12: true
  });
}

export function formatDate(dateInput: Date | string | number | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!dateInput) return '';
  const date = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return '';

  return date.toLocaleDateString('es-MX', options || {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}
