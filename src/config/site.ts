/** Facts about the business that the public pages quote. One place, so a change reaches every page. */
export const SITE = {
  name: 'Volita',
  supportEmail: 'GMFreelancers23@gmail.com',
  /** Who runs the service, as named in the Terms and Privacy pages. */
  operator: 'Brandon Myers, South Africa',
  /** The day the Terms and Privacy pages were last changed. */
  legalUpdated: '16 November 2026',
} as const

export const supportMailto = (subject: string): string => `mailto:${SITE.supportEmail}?subject=${encodeURIComponent(subject)}`
