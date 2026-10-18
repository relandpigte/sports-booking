// The fields getCurrentUser() returns. Shared with the assisted-user lookup in
// impersonation.ts so an admin assisting someone sees the same shape the user
// would see signed in themselves.
export const currentUserSelect = {
  id: true,
  name: true,
  playerName: true,
  email: true,
  phone: true,
  facebookPage: true,
  image: true,
  role: true,
  partnerStatus: true,
  partnerPaymentMode: true,
  skillLevel: true,
  privateProfile: true,
  chatRestrictedAt: true,
} as const;
