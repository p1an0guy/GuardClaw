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

export type AppNotification = {
  id: string;
  family_id: string;
  target_role: 'guardian' | 'all';
  title: string;
  body: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
};

export type LocationLabel = 'home' | 'school' | 'work';

export type SavedLocation = {
  id: string;
  family_id: string;
  label: LocationLabel;
  lat: number;
  lng: number;
  created_at: string;
};