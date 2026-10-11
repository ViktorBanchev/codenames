import { supabase } from './supabase';

const DEFAULT_BG_WORDS = [
  'САТЕЛИТ', 'ОКЕАН', 'РАКЕТА', 'ДИАМАНТ', 'КОРАБ',
  'ВУЛКАН', 'РОБОТ', 'ОСТРОВ', 'КОМПАС', 'МОСТ',
  'ЗАМЪК', 'ПИСТОЛЕТ', 'ОГЪН', 'ВЯТЪР', 'ЛАЗЕР',
  'МУЗИКА', 'ЗЛАТО', 'СЯНКА', 'АГЕНТ', 'ПОЛЕТ',
  'ТУНЕЛ', 'ПЛАНЕТА', 'МРЕЖА', 'ДЪЖД', 'СПИРАЛА',
  'СТУД', 'СЛЪНЦЕ', 'ГОРСТ', 'КЛЮЧ', 'КАМЪК',
  'ВЛАК', 'КУЛА', 'ЛЕОПАРД', 'РИФ', 'МОНЕТА',
  'ШПИОНИН', 'СИГНАЛ', 'БАТЕРИЯ', 'ПРИЗРАК', 'АРХИВ'
];

export type RoleType = 'agent' | 'neutral' | 'assassin';

export interface CardAssignment {
  room_code: string;
  word: string;
  role_a: RoleType;
  role_b: RoleType;
  grid_index: number;
}

export async function createDuetRoom(roomCode: string, packId?: string) {
  let pool = [...DEFAULT_BG_WORDS];

  if (packId) {
    const { data } = await supabase.from('pack_words').select('word').eq('pack_id', packId);
    if (data && data.length >= 25) {
      pool = data.map((d) => d.word);
    }
  }

  // Pick 25 distinct words
  const selectedWords = pool.sort(() => 0.5 - Math.random()).slice(0, 25);

  // Exact Duet matrix: 15 shared agents, 3 assassins, neutrals
  const rolePairs: Array<{ a: RoleType; b: RoleType }> = ([
    { a: 'agent', b: 'agent' }, { a: 'agent', b: 'agent' }, { a: 'agent', b: 'agent' },
    { a: 'agent', b: 'neutral' }, { a: 'agent', b: 'neutral' }, { a: 'agent', b: 'neutral' },
    { a: 'agent', b: 'neutral' }, { a: 'agent', b: 'neutral' }, { a: 'agent', b: 'assassin' },
    { a: 'neutral', b: 'agent' }, { a: 'neutral', b: 'agent' }, { a: 'neutral', b: 'agent' },
    { a: 'neutral', b: 'agent' }, { a: 'neutral', b: 'agent' }, { a: 'assassin', b: 'agent' },
    { a: 'assassin', b: 'assassin' },
    { a: 'assassin', b: 'neutral' }, { a: 'neutral', b: 'assassin' },
    { a: 'neutral', b: 'neutral' }, { a: 'neutral', b: 'neutral' }, { a: 'neutral', b: 'neutral' },
    { a: 'neutral', b: 'neutral' }, { a: 'neutral', b: 'neutral' }, { a: 'neutral', b: 'neutral' },
    { a: 'neutral', b: 'neutral' }
  ] as const).map(pair => ({ ...pair })).sort(() => 0.5 - Math.random());

  const cardsPayload: CardAssignment[] = selectedWords.map((word, idx) => ({
    room_code: roomCode,
    word: word.trim().toLocaleUpperCase('bg'),
    role_a: rolePairs[idx].a,
    role_b: rolePairs[idx].b,
    grid_index: idx,
  }));

  await supabase.from('duet_rooms').upsert({
    room_code: roomCode,
    current_turn: 'player_a', // Operative A gives first clue
    turn_phase: 'giving_clue', // 'giving_clue' | 'guessing'
    guesses_remaining: 0,
    turns_left: 9,
    mistakes_made: 0,
    max_mistakes: 2,
    found_agents: 0,
    status: 'in_progress',
    last_clue_word: null,
    last_clue_count: null,
  });

  await supabase.from('duet_cards').delete().eq('room_code', roomCode);
  await supabase.from('duet_cards').insert(cardsPayload);
}