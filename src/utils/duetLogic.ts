import { supabase } from './supabase';

export type RoleType = 'agent' | 'neutral' | 'assassin';

export interface CardAssignment {
    room_code: string;
    word: string;
    role_a: RoleType;
    role_b: RoleType;
    grid_index: number;
}

export interface HostOptions {
    turnsLimit?: number; // 99 represents Infinity
    maxMistakes?: number; // 99 represents Infinity
}

export const DEFAULT_BG_WORDS = [
    // Природа и стихии
    'ВУЛКАН', 'ОКЕАН', 'ОСТРОВ', 'ВЯТЪР', 'ОГЪН', 'ДЪЖД', 'МЪГЛА', 'ЛЕДНИК',
    'ПУСТИНЯ', 'ГОРА', 'РЕКА', 'ПЕЩЕРА', 'БУРЯ', 'МЪЛНИЯ', 'ПЛАНИНА', 'ВЪЛНА',
    // Космос и наука
    'РАКЕТА', 'САТЕЛИТ', 'ПЛАНЕТА', 'ЛАЗЕР', 'РОБОТ', 'АТОМ', 'КОМЕТА', 'ГАЛАКТИКА',
    'ОРБИТА', 'ТЕЛЕСКОП', 'МАГНИТ', 'СОНДА', 'СВЕТЛИНА', 'ГРАВИТАЦИЯ',
    // Шпионаж и тактика
    'АГЕНТ', 'ПИСТОЛЕТ', 'СЯНКА', 'КОМПАС', 'ТУНЕЛ', 'МРЕЖА', 'КОД', 'ШИФЪР',
    'МАСКА', 'КАПАН', 'ПАСПОРТ', 'СЛЕДА', 'ТРЕЗОР', 'ТАЙНА', 'РАДАР', 'МИСИЯ',
    // Предмети и конструкции
    'ДИАМАНТ', 'КОРАБ', 'МОСТ', 'ЗАМЪК', 'ЗЛАТО', 'КУЛА', 'ЧАСОВНИК', 'КОТВА',
    'КЛЮЧ', 'КНИГА', 'ОГЛЕДАЛО', 'МОНЕТА', 'ФЕНЕР', 'КАРТА', 'СТЪКЛО', 'ВЛАК',
    'САМОЛЕТ', 'ПЕЧАТ', 'ФЛАГ', 'ВРАТА', 'СТЕНА', 'ВЕРИГА', 'КУТИЯ', 'МЕЧ',
    // Животни и флора
    'ОРЕЛ', 'ВЪЛК', 'ЗМИЯ', 'ТИГЪР', 'АКУЛА', 'СОКОЛ', 'МЕЧКА', 'ЛЪВ',
    'ДЪБ', 'РОЗА', 'ТРЪН', 'ПАЯК', 'БУХАЛ', 'ДЕЛФИН', 'ГАРВАН', 'ПАНТЕРА',
    // Абстрактни и понятия
    'МУЗИКА', 'ПОЛЕТ', 'СЪН', 'ВРЕМЕ', 'СИЛА', 'СКОРОСТ', 'СЪДБА', 'ИГРА',
    'ИСТИНА', 'РИСК', 'СТУД', 'ТОПЛИНА', 'ПОКОЙ', 'ПАМЕТ', 'СВОБОДА', 'ЗАКОН'
];

export async function createDuetRoom(
    roomCode: string,
    packId?: string,
    options: HostOptions = {}
) {
    const turnsLimit = options.turnsLimit ?? 9;
    const maxMistakes = options.maxMistakes ?? 2;

    let pool = [...DEFAULT_BG_WORDS];

    if (packId) {
        const { data } = await supabase.from('pack_words').select('word').eq('pack_id', packId);
        if (data && data.length >= 25) {
            pool = data.map((d) => d.word);
        }
    }

    const selectedWords = [...pool].sort(() => 0.5 - Math.random()).slice(0, 25);

    const rolePairs: Array<{ a: RoleType; b: RoleType }> = ([
        { a: 'agent', b: 'agent' }, { a: 'agent', b: 'agent' }, { a: 'agent', b: 'agent' },
        { a: 'agent', b: 'assassin' },
        { a: 'agent', b: 'neutral' }, { a: 'agent', b: 'neutral' }, { a: 'agent', b: 'neutral' }, { a: 'agent', b: 'neutral' }, { a: 'agent', b: 'neutral' },
        { a: 'assassin', b: 'agent' },
        { a: 'assassin', b: 'assassin' },
        { a: 'assassin', b: 'neutral' },
        { a: 'neutral', b: 'agent' }, { a: 'neutral', b: 'agent' }, { a: 'neutral', b: 'agent' }, { a: 'neutral', b: 'agent' }, { a: 'neutral', b: 'agent' },
        { a: 'neutral', b: 'assassin' },
        { a: 'neutral', b: 'neutral' }, { a: 'neutral', b: 'neutral' }, { a: 'neutral', b: 'neutral' }, { a: 'neutral', b: 'neutral' }, { a: 'neutral', b: 'neutral' }, { a: 'neutral', b: 'neutral' }, { a: 'neutral', b: 'neutral' },
    ] as const).map(p => ({ ...p })).sort(() => 0.5 - Math.random());

    const cardsPayload: CardAssignment[] = selectedWords.map((word, idx) => ({
        room_code: roomCode,
        word: word.trim().toLocaleUpperCase('bg'),
        role_a: rolePairs[idx].a,
        role_b: rolePairs[idx].b,
        grid_index: idx,
    }));

    // Clean old rows first
    await supabase.from('duet_clues').delete().eq('room_code', roomCode);
    await supabase.from('duet_cards').delete().eq('room_code', roomCode);

    const { error: roomError } = await supabase.from('duet_rooms').upsert({
        room_code: roomCode,
        current_turn: 'player_a',
        turn_phase: 'giving_clue',
        guesses_remaining: 0,
        turns_left: turnsLimit,
        total_turns: turnsLimit,
        mistakes_made: 0,
        max_mistakes: maxMistakes,
        found_agents: 0,
        status: 'in_progress',
        last_clue_word: null,
        last_clue_count: null,
    });

    if (roomError) {
        console.error('Room init error:', roomError);
        throw roomError;
    }

    const { error: cardsError } = await supabase.from('duet_cards').insert(cardsPayload);
    if (cardsError) {
        console.error('Cards insert error:', cardsError);
        throw cardsError;
    }
}