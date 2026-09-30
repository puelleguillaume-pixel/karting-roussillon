import { isoWeekdayOf } from '../dates';
import type { BlockReason, BlockType } from '../types';

/** Saisie d'un blocage (formulaire), convertie en entrée RPC à l'envoi */
export interface BlockDraft {
  block_type: BlockType;
  date: string;
  start_clock: string;
  end_date: string;
  end_clock: string;
  all_tracks: boolean;
  track_ids: string[];
  reason: BlockReason | '';
  public_label: string;
  is_public: boolean;
  repeat: 'none' | 'weekly' | 'daily';
  repeat_days: number[];
  repeat_until: string;
  internal_note: string;
  customer_id: string | null;
  request_id: string | null;
}

export function emptyDraft(day: string, overrides: Partial<BlockDraft> = {}): BlockDraft {
  return {
    block_type: 'full_day',
    date: day,
    start_clock: '09:00',
    end_date: day,
    end_clock: '13:00',
    all_tracks: false,
    track_ids: [],
    reason: '',
    public_label: '',
    is_public: false,
    repeat: 'none',
    repeat_days: [isoWeekdayOf(day)],
    repeat_until: '',
    internal_note: '',
    customer_id: null,
    request_id: null,
    ...overrides,
  };
}

