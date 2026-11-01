import { readSetting, writeSetting } from '@/lib/db/settings';
import {
  careerProfileSchema,
  DEFAULT_CAREER_PROFILE,
  type CareerProfile,
} from '@/lib/handshake/relevance';

const PROFILE_KEY = 'handshake-profile';

export function getCareerProfile(): CareerProfile {
  return readSetting(PROFILE_KEY, careerProfileSchema, DEFAULT_CAREER_PROFILE);
}

export function saveCareerProfile(value: unknown): CareerProfile {
  const profile = careerProfileSchema.parse(value);
  writeSetting(PROFILE_KEY, profile);
  return profile;
}
