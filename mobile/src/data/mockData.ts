import type { FamilyMember, FamilyMessage } from '../types';

const now = Date.now();

const minutesAgo = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

export const MOCK_FAMILY_ID = 'mock-family';

export const mockMembers: FamilyMember[] = [
  {
    id: 'mock-mason',
    family_id: MOCK_FAMILY_ID,
    name: 'Mason',
    status: 'Safe',
    battery: 86,
    lat: 37.7858,
    lng: -122.4064,
    updated_at: minutesAgo(2),
  },
  {
    id: 'mock-ava',
    family_id: MOCK_FAMILY_ID,
    name: 'Ava',
    status: 'Home',
    battery: 72,
    lat: 37.7793,
    lng: -122.4192,
    updated_at: minutesAgo(8),
  },
  {
    id: 'mock-theo',
    family_id: MOCK_FAMILY_ID,
    name: 'Theo',
    status: 'Moving',
    battery: 51,
    lat: 37.7694,
    lng: -122.4862,
    updated_at: minutesAgo(13),
  },
  {
    id: 'mock-riley',
    family_id: MOCK_FAMILY_ID,
    name: 'Riley',
    status: 'Offline',
    battery: 19,
    lat: 37.8044,
    lng: -122.2711,
    updated_at: minutesAgo(74),
  },
];

export const mockMessages: FamilyMessage[] = [
  {
    id: 'msg-1',
    family_id: MOCK_FAMILY_ID,
    sender_name: 'Ava',
    text: 'Home now. Door is locked.',
    created_at: minutesAgo(18),
  },
  {
    id: 'msg-2',
    family_id: MOCK_FAMILY_ID,
    sender_name: 'Mason',
    text: 'Thanks. I am five minutes away.',
    created_at: minutesAgo(12),
  },
  {
    id: 'msg-3',
    family_id: MOCK_FAMILY_ID,
    sender_name: 'Theo',
    text: 'Checking in from practice.',
    created_at: minutesAgo(7),
  },
];
