import type { HistoricalCharacterId } from './HistoricalCharacter.types';

export interface HistoricalCharacterDefinition {
  id: HistoricalCharacterId;
  name: string;
  aliases: readonly string[];
  image: string;
  imageV2: string;
  profile: string;
}

export const HISTORICAL_CHARACTERS: Record<
  HistoricalCharacterId,
  HistoricalCharacterDefinition
> = {
  'ly-thai-to': {
    id: 'ly-thai-to',
    name: 'Lý Thái Tổ',
    aliases: ['Lý Công Uẩn'],
    image: 'characters/lythaito.png',
    imageV2: 'characters/v2/lythaito.png',
    profile: 'characters/ly-thai-to/profile.json',
  },
  'ly-the-dan': {
    id: 'ly-the-dan',
    name: 'Lý Thế Dân',
    aliases: ['Đường Thái Tông', 'Li Shimin'],
    image: 'characters/lythedan.png',
    imageV2: 'characters/v2/lythedan.png',
    profile: 'characters/ly-the-dan/profile.json',
  },
};
