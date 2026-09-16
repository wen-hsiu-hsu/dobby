import * as peopleRepo from '../../services/notion/people-repository.js';

export interface EventStatusParams {
  date: string;
  headline: string;
  guests: string[];
  totalSlots: number;
  presentSeasonMembers: number;
  guestFee: number;
  absenteePageIds: string[];
}

/**
 * Renders the full weekly status block (guest list, remaining slots, absentee list, totals)
 * with an arbitrary headline. Used for both success and failure/no-op replies so the user
 * always sees the current state, not just a bare one-line message.
 */
export async function buildEventStatusMessage(params: EventStatusParams): Promise<string> {
  const { date, headline, guests, totalSlots, presentSeasonMembers, guestFee, absenteePageIds } = params;
  const remainingSlots = Math.max(0, totalSlots - guests.length);

  // Numbered guest list (show all slots including empty ones)
  const displaySlots = Math.max(totalSlots, guests.length);
  const guestLines = Array.from({ length: displaySlots }, (_, i) =>
    `${i + 1}. ${guests[i] ?? ''}`,
  ).join('\n');

  let absenteeText = '無';
  if (absenteePageIds.length > 0) {
    const absentees = await peopleRepo.findByPageIds(absenteePageIds);
    absenteeText = absentees.map((p) => p.name).join('、');
  }

  const totalPeople = presentSeasonMembers + guests.length;

  return [
    headline,
    '',
    date,
    `零打名額 ${totalSlots} 人 | $${guestFee}/人`,
    guestLines,
    `剩餘名額：${remainingSlots} 人`,
    `請假：${absenteeText}`,
    '',
    `若要報名請輸入 @Dobby +1`,
    `總人數：共 ${totalPeople} 人`,
  ].join('\n');
}
