export const MEMBER_STATUSES = ['Safe', 'Home', 'Moving', 'Needs Help', 'Offline'] as const;

export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type MemberRole = 'guardian' | 'child';

export type FamilyMember = {
  id: string;
  family_id?: string;
  name: string;
  role: MemberRole;
  status: MemberStatus;
  battery: number;
  lat: number | null;
  lng: number | null;
  updated_at: string;
};

export type FamilyMessage = {
  id: string;
  family_id?: string;
  sender_name: string;
  text: string;
  created_at: string;
};

export type QuickActionId = 'safe' | 'check-in' | 'help' | 'share-location';
