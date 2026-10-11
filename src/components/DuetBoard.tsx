import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import {
    Shield,
    LayoutGrid,
    HelpCircle,
    Minus,
    Plus,
    Lock,
    RotateCcw,
    LogOut,
    History,
    X,
    Target,
    Sparkles,
    AlertTriangle,
    Infinity as InfinityIcon,
    Flame,
    Radio
} from 'lucide-react';
import { createDuetRoom } from '../utils/duetLogic';
import { sounds } from '../utils/audio';

interface DuetCard {
    id: string;
    word: string;
    role_a: 'agent' | 'neutral' | 'assassin';
    role_b: 'agent' | 'neutral' | 'assassin';
    is_revealed_a: boolean;
    is_revealed_b: boolean;
    grid_index: number;
}

interface RoomData {
    room_code: string;
    current_turn: 'player_a' | 'player_b';
    turn_phase: 'giving_clue' | 'guessing' | 'sudden_death';
    guesses_remaining: number;
    turns_left: number;
    total_turns: number | null;
    mistakes_made: number;
    max_mistakes: number;
    found_agents: number;
    status: 'in_progress' | 'won' | 'lost' | 'abandoned';
    last_clue_word: string | null;
    last_clue_count: number | null;
}

interface ClueRecord {
    id: string;
    player: string;
    word: string;
    count: number;
    created_at: string;
}

interface DuetBoardProps {
    roomCode: string;
    defaultRole?: 'player_a' | 'player_b';
    onExit: () => void;
}

export function DuetBoard({ roomCode, defaultRole = 'player_a', onExit }: DuetBoardProps) {
    const [cards, setCards] = useState<DuetCard[]>([]);
    const [room, setRoom] = useState<RoomData | null>(null);
    const [clues, setClues] = useState<ClueRecord[]>([]);
    const playerSide = defaultRole;
    const [activeTab, setActiveTab] = useState<'tabletop' | 'keycard'>('tabletop');
    const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
    const [clueWord, setClueWord] = useState('');
    const [clueCount, setClueCount] = useState<number>(0);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);
    const [rematching, setRematching] = useState(false);
    const [showExitConfirm, setShowExitConfirm] = useState(false);
    const [confirmPass, setConfirmPass] = useState(false);

    // Synchronize entire room state cleanly
    const loadFullRoomData = useCallback(async () => {
        const { data: roomData, error: rErr } = await supabase
            .from('duet_rooms')
            .select('*')
            .eq('room_code', roomCode)
            .maybeSingle();
        if (rErr) setErrorMsg(rErr.message);
        else if (roomData) setRoom(roomData);

        const { data: cardsData, error: cErr } = await supabase
            .from('duet_cards')
            .select('*')
            .eq('room_code', roomCode)
            .order('grid_index', { ascending: true });
        if (cErr) setErrorMsg(cErr.message);
        else if (cardsData) setCards(cardsData);

        const { data: cluesData } = await supabase
            .from('duet_clues')
            .select('*')
            .eq('room_code', roomCode)
            .order('created_at', { ascending: false });
        if (cluesData) setClues(cluesData);
    }, [roomCode]);

    useEffect(() => {
        loadFullRoomData();

        // Listen to ALL events on duet_rooms (* = INSERT, UPDATE, DELETE)
        const roomChannel = supabase
            .channel(`duet_room:${roomCode}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'duet_rooms', filter: `room_code=eq.${roomCode}` },
                (payload) => {
                    if (payload.eventType === 'DELETE') {
                        onExit();
                    } else {
                        setRoom(payload.new as RoomData);
                    }
                }
            )
            .subscribe();

        // Listen to cards and strictly keep grid_index ordering
        const cardChannel = supabase
            .channel(`duet_cards:${roomCode}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'duet_cards', filter: `room_code=eq.${roomCode}` },
                () => {
                    supabase
                        .from('duet_cards')
                        .select('*')
                        .eq('room_code', roomCode)
                        .order('grid_index', { ascending: true })
                        .then(({ data }) => {
                            if (data) setCards(data);
                        });
                }
            )
            .subscribe();

        // Listen to clues
        const clueChannel = supabase
            .channel(`duet_clues:${roomCode}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'duet_clues', filter: `room_code=eq.${roomCode}` },
                () => {
                    supabase
                        .from('duet_clues')
                        .select('*')
                        .eq('room_code', roomCode)
                        .order('created_at', { ascending: false })
                        .then(({ data }) => {
                            if (data) setClues(data);
                        });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(roomChannel);
            supabase.removeChannel(cardChannel);
            supabase.removeChannel(clueChannel);
        };
    }, [roomCode, loadFullRoomData, onExit]);

    // Turn logic
    const isSuddenDeath = room?.turn_phase === 'sudden_death';
    const isMyClueTurn = !isSuddenDeath && room?.current_turn === playerSide && room?.turn_phase === 'giving_clue';
    const isMyGuessTurn = isSuddenDeath || (!isSuddenDeath && room?.current_turn !== playerSide && room?.turn_phase === 'guessing');

    useEffect(() => {
        if (isMyGuessTurn && activeTab === 'keycard') {
            setActiveTab('tabletop');
        }
    }, [isMyGuessTurn, activeTab]);

    useEffect(() => {
        if (room?.status === 'lost') sounds.assassin();
        if (room?.status === 'won') sounds.agentFound();
    }, [room?.status]);

    const myTotalTargets = 9;
    const myTargetsFound = cards.filter((card) => {
        const isMyAgent = playerSide === 'player_a' ? card.role_a === 'agent' : card.role_b === 'agent';
        const foundByPartner = playerSide === 'player_a' ? card.is_revealed_a : card.is_revealed_b;
        return isMyAgent && foundByPartner;
    }).length;

    const handleTransmitClue = async () => {
        if (!clueWord.trim() || !room || !isMyClueTurn) return;

        const formattedWord = clueWord.trim().toLocaleUpperCase('bg');
        sounds.tap();

        const allowedGuesses = clueCount === 0 ? 99 : clueCount + 1;
        const playerTitle = playerSide === 'player_a' ? 'OPERATIVE A' : 'OPERATIVE B';

        await supabase.from('duet_clues').insert({
            room_code: roomCode,
            player: playerTitle,
            word: formattedWord,
            count: clueCount,
        });

        await supabase
            .from('duet_rooms')
            .update({
                last_clue_word: formattedWord,
                last_clue_count: clueCount,
                turn_phase: 'guessing',
                guesses_remaining: allowedGuesses,
            })
            .eq('room_code', roomCode);

        setClueWord('');
        setActiveTab('tabletop');
    };

    const handlePassTurn = async () => {
        if (!room || !isMyGuessTurn) return;
        sounds.tap();

        if (isSuddenDeath) {
            await supabase.from('duet_rooms').update({ status: 'lost' }).eq('room_code', roomCode);
            return;
        }

        const isInfiniteTurns = (room.turns_left ?? 9) >= 99;
        const nextTurnsLeft = isInfiniteTurns ? 99 : Math.max(0, room.turns_left - 1);
        const nextClueGiver = playerSide;
        const enterSuddenDeath = !isInfiniteTurns && nextTurnsLeft === 0 && room.found_agents < 15;

        await supabase
            .from('duet_rooms')
            .update({
                current_turn: nextClueGiver,
                turn_phase: enterSuddenDeath ? 'sudden_death' : 'giving_clue',
                guesses_remaining: enterSuddenDeath ? 99 : 0,
                turns_left: nextTurnsLeft,
            })
            .eq('room_code', roomCode);

        setSelectedCardId(null);
        setConfirmPass(false);
    };

    const handleConfirmGuess = async () => {
        if (!selectedCardId || !room || !isMyGuessTurn) return;
        const card = cards.find((c) => c.id === selectedCardId);
        if (!card) return;

        const partnerRole = playerSide === 'player_a' ? card.role_b : card.role_a;
        const revealColumn = playerSide === 'player_a' ? 'is_revealed_b' : 'is_revealed_a';

        const isInfiniteTurns = (room.turns_left ?? 9) >= 99;
        const isInfiniteMistakes = (room.max_mistakes ?? 2) >= 99;

        let nextTurns = room.turns_left;
        let nextMistakes = room.mistakes_made;
        let nextFound = room.found_agents;
        let nextStatus = room.status;
        let nextGuesses = room.guesses_remaining - 1;
        let nextTurn = room.current_turn;
        let nextPhase = room.turn_phase;

        if (partnerRole === 'agent') {
            sounds.agentFound();
            nextFound += 1;
            if (nextFound >= 15) {
                nextStatus = 'won';
            } else if (!isSuddenDeath && nextGuesses <= 0) {
                if (!isInfiniteTurns) nextTurns = Math.max(0, nextTurns - 1);
                nextTurn = playerSide;
                if (!isInfiniteTurns && nextTurns === 0) {
                    nextPhase = 'sudden_death';
                    nextGuesses = 99;
                } else {
                    nextPhase = 'giving_clue';
                }
            }
        } else if (partnerRole === 'neutral') {
            sounds.bystander();
            nextMistakes += 1;

            if (isSuddenDeath) {
                nextStatus = 'lost';
            } else {
                if (!isInfiniteTurns) nextTurns = Math.max(0, nextTurns - 1);
                nextTurn = playerSide;
                nextGuesses = 0;

                if (!isInfiniteMistakes && nextMistakes >= room.max_mistakes) {
                    nextStatus = 'lost';
                } else if (!isInfiniteTurns && nextTurns === 0) {
                    nextPhase = 'sudden_death';
                    nextGuesses = 99;
                } else {
                    nextPhase = 'giving_clue';
                }
            }
        } else if (partnerRole === 'assassin') {
            nextStatus = 'lost';
        }

        await supabase.from('duet_cards').update({ [revealColumn]: true }).eq('id', card.id);
        await supabase
            .from('duet_rooms')
            .update({
                turns_left: nextTurns,
                mistakes_made: nextMistakes,
                found_agents: nextFound,
                status: nextStatus,
                guesses_remaining: nextGuesses,
                current_turn: nextTurn,
                turn_phase: nextPhase,
            })
            .eq('room_code', roomCode);

        setSelectedCardId(null);
        setConfirmPass(false);
    };

    const handleRematch = async () => {
        setRematching(true);
        try {
            await createDuetRoom(roomCode, undefined, {
                turnsLimit: room?.total_turns ?? 9,
                maxMistakes: room?.max_mistakes ?? 2
            });
            await loadFullRoomData();
        } finally {
            setRematching(false);
        }
    };

    // Close room completely in DB if explicitly terminated
    const handleTerminateRoom = async () => {
        await supabase.from('duet_rooms').update({ status: 'abandoned' }).eq('room_code', roomCode);
        onExit();
    };

    const partnerLabel = playerSide === 'player_a' ? 'OPERATIVE B' : 'OPERATIVE A';
    const myLabel = playerSide === 'player_a' ? 'OPERATIVE A' : 'OPERATIVE B';

    const totalTokenSlots = room?.total_turns ?? 9;
    const isInfiniteTokenPool = (room?.turns_left ?? 9) >= 99 || totalTokenSlots >= 99;
    const isInfiniteMistakes = (room?.max_mistakes ?? 2) >= 99;

    return (
        <div className="tactical-tabletop flex flex-col min-h-screen max-w-md mx-auto select-none border-x border-surface relative">
            {/* Top Header */}
            <header className="px-4 py-3 flex items-center justify-between border-b border-surface bg-canvas/80 backdrop-blur shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-surface-elevated border border-surface flex items-center justify-center text-xs font-bold text-primary">
                        <HelpCircle size={14} />
                    </div>
                    <span className="font-telemetry font-bold text-xs tracking-wider text-text-primary">
                        DUET : #{roomCode}
                    </span>
                    <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                </div>

                <div className="flex items-center gap-2">
                    <div className="font-telemetry text-[10px] px-2.5 py-1 rounded-md bg-surface-elevated border border-surface font-bold text-primary shadow-sm tracking-wider">
                        {myLabel}
                    </div>
                    <button
                        onClick={() => setShowExitConfirm(true)}
                        className="p-1 text-text-secondary hover:text-error transition"
                        title="Leave / Exit Room"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </header>

            {/* Error Banner */}
            {errorMsg && (
                <div className="mx-3 mt-2 p-2.5 bg-red-950/80 border border-red-500 text-red-200 text-xs rounded-xl font-telemetry">
                    ⚠ ERROR: {errorMsg}
                </div>
            )}

            {/* Mission Tracker */}
            <section className="mx-3 my-2 p-3 bg-surface rounded-xl border border-surface shadow-sm shrink-0">
                <div className="grid grid-cols-3 gap-2 text-center items-center">
                    <div>
                        <div className="font-telemetry text-[9px] uppercase tracking-wider text-text-secondary">Total Agents</div>
                        <div className="font-card font-bold text-sm text-primary mt-0.5">
                            {room?.found_agents ?? 0} / 15
                        </div>
                    </div>

                    <div>
                        <div className="font-telemetry text-[9px] uppercase tracking-wider text-text-secondary">Time Tokens</div>
                        {isInfiniteTokenPool ? (
                            <div className="flex items-center justify-center gap-1 font-telemetry font-bold text-sm text-secondary mt-0.5">
                                <InfinityIcon size={16} />
                            </div>
                        ) : (
                            <div className="flex justify-center flex-wrap gap-1 mt-1 max-w-[100px] mx-auto">
                                {Array.from({ length: totalTokenSlots }).map((_, i) => (
                                    <span
                                        key={i}
                                        className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${i < (room?.turns_left ?? totalTokenSlots)
                                            ? 'bg-secondary-container border border-secondary shadow-[0_0_6px_rgba(234,179,8,0.3)]'
                                            : 'bg-surface-elevated opacity-30'
                                            }`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="font-telemetry text-[9px] uppercase tracking-wider text-text-secondary">Mistakes</div>
                        <div className="font-card font-bold text-sm text-error mt-0.5">
                            {room?.mistakes_made ?? 0} / {isInfiniteMistakes ? '∞' : (room?.max_mistakes ?? 2)}
                        </div>
                    </div>
                </div>

                {activeTab === 'keycard' && (
                    <div className="mt-2.5 pt-2 border-t border-surface flex items-center justify-between text-xs font-telemetry">
                        <span className="text-text-secondary flex items-center gap-1">
                            <Target size={13} className="text-primary" /> {partnerLabel} Uncovered on My Card:
                        </span>
                        <span className="font-bold text-primary">
                            {myTargetsFound} / {myTotalTargets}
                        </span>
                    </div>
                )}
            </section>

            {/* Dynamic Status / Clue Banner */}
            <div
                className={`mx-3 mb-2 px-3 py-2 text-white rounded-lg flex items-center justify-between text-xs shadow-sm shrink-0 ${isSuddenDeath ? 'bg-red-950 border border-red-600 animate-pulse' : 'bg-primary-container'
                    }`}
            >
                <div className="font-telemetry flex items-center gap-1.5 flex-1 min-w-0 pr-2">
                    {isSuddenDeath ? (
                        <span className="truncate font-bold flex items-center gap-1">
                            <Flame size={14} className="text-amber-400" /> SUDDEN DEATH: 0 Clues Left! Blind Guess Remaining Agents!
                        </span>
                    ) : room?.turn_phase === 'giving_clue' ? (
                        <span className="truncate">
                            {isMyClueTurn ? '⚡ YOUR TURN: Formulate Clue Cipher' : `⏳ Awaiting cipher from ${partnerLabel}...`}
                        </span>
                    ) : (
                        <span className="truncate">
                            CIPHER: <strong>{room?.last_clue_word}</strong> ({room?.last_clue_count === 0 ? '∞' : room?.last_clue_count}) •{' '}
                            {isMyGuessTurn
                                ? `Guesses left: ${room?.guesses_remaining === 99 ? '∞' : room?.guesses_remaining}`
                                : `${partnerLabel} guessing`}
                        </span>
                    )}
                </div>
                <span className="font-telemetry text-[9px] uppercase bg-black/40 px-1.5 py-0.5 rounded font-bold shrink-0">
                    {isSuddenDeath ? 'SUDDEN DEATH' : room?.turn_phase === 'giving_clue' ? 'CIPHER' : 'GUESS'}
                </span>
            </div>

            {/* 5x5 Grid / Waiting State */}
            <main className="flex-1 px-3 grid grid-cols-5 gap-1.5 place-content-center">
                {cards.length === 0 ? (
                    <div className="col-span-5 py-16 text-center flex flex-col items-center justify-center gap-3">
                        <div className="relative w-14 h-14 flex items-center justify-center">
                            <span className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
                            <span className="w-14 h-14 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
                            <Radio size={22} className="text-primary absolute" />
                        </div>
                        <div>
                            <div className="font-card font-bold text-sm text-text-primary tracking-wide">
                                ESTABLISHING SECURE PROTOCOL
                            </div>
                            <p className="font-telemetry text-[11px] text-text-secondary mt-1 max-w-[240px] leading-relaxed mx-auto">
                                {playerSide === 'player_a'
                                    ? 'Awaiting configuration launch from Mission Setup...'
                                    : 'Operative A is assembling mission parameters and keycard matrix...'}
                            </p>
                        </div>
                    </div>
                ) : (
                    cards.map((card) => {
                        const isKeycard = activeTab === 'keycard';
                        const myKeyRole = playerSide === 'player_a' ? card.role_a : card.role_b;
                        const alreadyGuessedByMe = playerSide === 'player_a' ? card.is_revealed_b : card.is_revealed_a;
                        const alreadyGuessedByPartner = playerSide === 'player_a' ? card.is_revealed_a : card.is_revealed_b;
                        const isSelected = selectedCardId === card.id;

                        let cardBg = 'bg-surface-card border-card';
                        // let textColor = 'text-text-primary';
                        let shadow = 'shadow-card';

                        if (isKeycard) {
                            if (myKeyRole === 'agent') {
                                cardBg = 'bg-primary-container border-primary text-white';
                            } else if (myKeyRole === 'assassin') {
                                cardBg = 'bg-zinc-950 border-red-500 text-white';
                            } else {
                                cardBg = 'bg-surface-elevated border-surface opacity-35 text-text-secondary';
                            }
                        } else if (alreadyGuessedByMe) {
                            const partnerRole = playerSide === 'player_a' ? card.role_b : card.role_a;
                            if (partnerRole === 'agent') {
                                cardBg = 'bg-primary-container border-primary text-white opacity-85';
                            } else if (partnerRole === 'neutral') {
                                cardBg = 'bg-stone-800 border-stone-600 opacity-60 text-stone-300';
                            } else {
                                cardBg = 'bg-red-950 border-red-600 text-red-200';
                            }
                            shadow = 'shadow-none';
                        } else if (isSelected) {
                            cardBg = 'bg-surface-elevated border-2 border-primary ring-2 ring-primary/30';
                            shadow = 'shadow-card-lift -translate-y-1';
                        }

                        return (
                            <button
                                key={card.id}
                                disabled={isKeycard || alreadyGuessedByMe || !isMyGuessTurn || room?.status !== 'in_progress'}
                                onClick={() => {
                                    sounds.tap();
                                    if (isSelected) {
                                        // Second tap on the active card confirms the guess directly!
                                        handleConfirmGuess();
                                    } else {
                                        setSelectedCardId(card.id);
                                        setConfirmPass(false);
                                    }
                                }}
                                className={`aspect-4/3 rounded-lg p-1 flex flex-col items-center justify-center transition-all duration-150 border relative ${cardBg} ${shadow} active:scale-95`}
                            >
                                <span className="font-card text-[clamp(8px,1.9vw,11px)] font-bold uppercase leading-tight text-center px-0.5">
                                    {card.word}
                                </span>

                                {!isKeycard && alreadyGuessedByMe && (
                                    <span className="font-telemetry text-[7.5px] mt-0.5 uppercase tracking-wider font-bold">
                                        {(playerSide === 'player_a' ? card.role_b : card.role_a) === 'agent' ? '✓ AGENT' : '• BYSTANDER'}
                                    </span>
                                )}

                                {!isKeycard && !alreadyGuessedByMe && alreadyGuessedByPartner && (
                                    <span className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-secondary-container" title="Partner already uncovered this card" />
                                )}

                                {isSelected && !alreadyGuessedByMe && (
                                    <div className="absolute inset-0 bg-primary/95 rounded-lg flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-150 px-0.5">
                                        <span className="text-[9px] font-telemetry font-extrabold text-text-inverted tracking-wider leading-tight text-center">
                                            TAP TO CONFIRM
                                        </span>
                                    </div>
                                )}
                            </button>
                        );
                    })
                )}
            </main>

            {/* Action Area */}
            <section className="mx-3 mt-2 mb-2 p-2.5 bg-surface rounded-xl border border-surface shadow-sm shrink-0">
                {room?.status !== 'in_progress' ? (
                    <div className="text-center py-2 font-telemetry font-bold text-xs text-text-secondary">
                        {room?.status === 'abandoned' ? 'MISSION ABANDONED BY OPERATIVE' : 'OPERATION CONCLUDED // INSPECT DEBRIEF MODAL'}
                    </div>
                ) : isMyClueTurn ? (
                    <div className="flex items-center gap-1.5">
                        <input
                            type="text"
                            placeholder="CLUE CIPHER"
                            value={clueWord}
                            onChange={(e) => setClueWord(e.target.value)}
                            className="flex-1 bg-canvas border border-surface px-2.5 py-1.5 rounded-lg font-card text-xs uppercase font-bold text-text-primary outline-none focus:border-primary"
                        />
                        <div className="flex items-center border border-surface rounded-lg bg-canvas px-1.5 py-1 gap-1 text-xs font-telemetry font-bold text-text-primary">
                            <button
                                onClick={() => {
                                    sounds.tap();
                                    setClueCount((c) => (c <= 1 ? 0 : c - 1));
                                }}
                                className="p-0.5 text-text-secondary hover:text-text-primary"
                            >
                                <Minus size={12} />
                            </button>
                            <span className="w-4 text-center flex items-center justify-center">
                                {clueCount === 0 ? <InfinityIcon size={13} className="text-primary" /> : clueCount}
                            </span>
                            <button
                                onClick={() => {
                                    sounds.tap();
                                    setClueCount((c) => (c === 0 ? 1 : c + 1));
                                }}
                                className="p-0.5 text-text-secondary hover:text-text-primary"
                            >
                                <Plus size={12} />
                            </button>
                        </div>
                        <button
                            onClick={handleTransmitClue}
                            className="px-3 py-1.5 bg-primary text-text-inverted font-telemetry font-bold text-xs rounded-lg shadow-btn active:translate-y-0.5"
                        >
                            TRANSMIT
                        </button>
                    </div>
                ) : isMyGuessTurn ? (
                    <div className="flex gap-2">
                        {selectedCardId ? (
                            <>
                                <button
                                    onClick={handleConfirmGuess}
                                    className="flex-1 py-2 px-3 bg-primary text-text-inverted font-telemetry font-bold text-xs rounded-lg shadow-btn active:translate-y-0.5"
                                >
                                    CONFIRM: {cards.find((c) => c.id === selectedCardId)?.word}
                                </button>
                                <button
                                    onClick={() => {
                                        sounds.tap();
                                        setSelectedCardId(null);
                                    }}
                                    className="px-3 py-2 bg-surface-elevated text-text-secondary font-telemetry font-bold text-xs rounded-lg border border-surface"
                                >
                                    CANCEL
                                </button>
                            </>
                        ) : confirmPass ? (
                            <div className="flex gap-1.5 w-full">
                                <button
                                    onClick={handlePassTurn}
                                    className="flex-1 py-2 bg-error text-white font-telemetry font-bold text-xs rounded-lg active:scale-95 shadow-btn"
                                >
                                    {isSuddenDeath ? 'CONFIRM FORFEIT?' : 'CONFIRM END TURN?'}
                                </button>
                                <button
                                    onClick={() => setConfirmPass(false)}
                                    className="px-3 py-2 bg-surface-elevated text-text-secondary font-telemetry font-bold text-xs rounded-lg border border-surface"
                                >
                                    CANCEL
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setConfirmPass(true)}
                                className="w-full py-2 bg-surface-elevated border border-surface text-text-secondary hover:text-text-primary font-telemetry font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 active:scale-95"
                            >
                                <RotateCcw size={13} />
                                <span>{isSuddenDeath ? 'FORFEIT / GIVE UP' : `END TURN / PASS TO ${partnerLabel}`}</span>
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="py-1 text-center font-telemetry text-xs text-text-secondary">
                        {room?.turn_phase === 'giving_clue'
                            ? `Waiting for ${partnerLabel} to formulate cipher...`
                            : `${partnerLabel} is guessing on the tabletop...`}
                    </div>
                )}
            </section>

            {/* Dock Navigation */}
            <nav className="border-t border-surface bg-surface p-2 flex justify-around items-center shrink-0">
                <button
                    onClick={() => {
                        sounds.tap();
                        setActiveTab('tabletop');
                    }}
                    className={`flex items-center gap-1.5 font-telemetry text-xs font-bold px-3 py-2 rounded-lg transition ${activeTab === 'tabletop' ? 'bg-primary text-text-inverted' : 'text-text-secondary'
                        }`}
                >
                    <LayoutGrid size={15} /> TABLETOP
                </button>

                <button
                    disabled={isMyGuessTurn}
                    onClick={() => {
                        sounds.tap();
                        setActiveTab('keycard');
                    }}
                    className={`flex items-center gap-1.5 font-telemetry text-xs font-bold px-3 py-2 rounded-lg transition ${activeTab === 'keycard'
                        ? 'bg-primary text-text-inverted'
                        : isMyGuessTurn
                            ? 'opacity-40 cursor-not-allowed text-text-secondary'
                            : 'text-text-secondary'
                        }`}
                >
                    {isMyGuessTurn ? <Lock size={14} /> : <Shield size={15} />}
                    <span>KEYCARD</span>
                </button>

                <button
                    onClick={() => {
                        sounds.tap();
                        setShowHistory(true);
                    }}
                    className="flex items-center gap-1.5 font-telemetry text-xs font-bold px-3 py-2 rounded-lg text-text-secondary hover:text-text-primary transition"
                >
                    <History size={15} />
                    <span>LOG ({clues.length})</span>
                </button>
            </nav>

            {/* Exit / Rejoin Options Modal */}
            {showExitConfirm && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-150">
                    <div className="p-5 bg-surface border border-surface rounded-2xl max-w-xs w-full">
                        <h3 className="font-card font-bold text-base text-text-primary">Depart Mission Room?</h3>
                        <p className="text-xs text-text-secondary mt-1 mb-4 leading-relaxed">
                            You can step out and reconnect later using #{roomCode}, or terminate the game for both operatives.
                        </p>
                        <div className="space-y-2">
                            <button
                                onClick={onExit}
                                className="w-full py-2.5 bg-primary text-text-inverted rounded-xl font-bold font-telemetry text-xs shadow-btn"
                            >
                                LEAVE (KEEP GAME ACTIVE)
                            </button>
                            <button
                                onClick={handleTerminateRoom}
                                className="w-full py-2.5 bg-red-950/80 border border-red-600 text-red-200 rounded-xl font-bold font-telemetry text-xs"
                            >
                                TERMINATE FOR BOTH
                            </button>
                            <button
                                onClick={() => setShowExitConfirm(false)}
                                className="w-full py-2 text-text-secondary font-telemetry text-xs font-bold"
                            >
                                CANCEL
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Abandoned Modal (if partner terminated the room) */}
            {room && room.status === 'abandoned' && (
                <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-40 flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-200">
                    <AlertTriangle size={36} className="text-error mb-3" />
                    <h2 className="font-card text-xl font-bold text-text-primary">MISSION TERMINATED</h2>
                    <p className="text-xs text-text-secondary mt-1 mb-5 max-w-xs">
                        Your partner has closed or terminated this mission room.
                    </p>
                    <button
                        onClick={onExit}
                        className="w-full max-w-xs py-3 bg-primary text-text-inverted rounded-xl font-bold font-telemetry text-xs shadow-btn"
                    >
                        RETURN TO LOBBY
                    </button>
                </div>
            )}

            {/* Transmission History Drawer */}
            {showHistory && (
                <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex flex-col p-4 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between pb-3 border-b border-surface">
                        <div className="flex items-center gap-2">
                            <History size={17} className="text-primary" />
                            <span className="font-card font-bold text-sm text-text-primary">Transmission Paper Trail</span>
                        </div>
                        <button
                            onClick={() => setShowHistory(false)}
                            className="p-1 text-text-secondary hover:text-text-primary rounded-lg bg-surface border border-surface"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto py-3 space-y-2">
                        {clues.length === 0 ? (
                            <div className="text-center py-12 text-xs font-telemetry text-text-secondary">
                                No clues transmitted yet this operation.
                            </div>
                        ) : (
                            clues.map((c) => (
                                <div key={c.id} className="p-3 bg-surface rounded-xl border border-surface flex items-center justify-between">
                                    <div>
                                        <span className="text-[10px] font-telemetry font-bold text-text-secondary block">
                                            {c.player}
                                        </span>
                                        <span className="font-card text-sm font-bold tracking-wider text-primary">
                                            {c.word}
                                        </span>
                                    </div>
                                    <div className="px-2.5 py-1 rounded-md bg-surface-elevated font-telemetry font-bold text-xs text-text-primary border border-surface flex items-center gap-1">
                                        Count: {c.count === 0 ? <InfinityIcon size={12} className="text-primary" /> : c.count}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* Debrief Modal */}
            {room && room.status !== 'in_progress' && room.status !== 'abandoned' && (
                <div className="absolute inset-0 bg-black/90 backdrop-blur-md z-40 flex flex-col items-center justify-center p-6 text-center animate-in zoom-in-95 duration-200">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-surface border border-surface shadow-lg">
                        {room.status === 'won' ? (
                            <Sparkles size={32} className="text-primary" />
                        ) : (
                            <AlertTriangle size={32} className="text-error" />
                        )}
                    </div>

                    <h2 className="font-card text-2xl font-bold tracking-tight text-text-primary">
                        {room.status === 'won' ? 'OPERATION COMPLETE' : 'MISSION COMPROMISED'}
                    </h2>
                    <p className="text-xs text-text-secondary mt-1 max-w-70">
                        {room.status === 'won'
                            ? 'All 15 operatives established contact successfully.'
                            : !isInfiniteMistakes && room.mistakes_made >= room.max_mistakes
                                ? 'Exceeded maximum allowable bystander mistakes.'
                                : !isInfiniteTokenPool && room.turns_left <= 0
                                    ? 'Sudden death failed before retrieving all agents.'
                                    : 'Black assassin contact triggered.'}
                    </p>

                    <div className="my-5 p-3 rounded-xl bg-surface border border-surface grid grid-cols-3 gap-3 w-full max-w-xs font-telemetry text-xs">
                        <div>
                            <div className="text-[9px] text-text-secondary uppercase">Agents</div>
                            <div className="font-bold text-primary mt-0.5">{room.found_agents} / 15</div>
                        </div>
                        <div>
                            <div className="text-[9px] text-text-secondary uppercase">Tokens Left</div>
                            <div className="font-bold text-secondary mt-0.5">
                                {isInfiniteTokenPool ? '∞' : `${room.turns_left} / ${totalTokenSlots}`}
                            </div>
                        </div>
                        <div>
                            <div className="text-[9px] text-text-secondary uppercase">Mistakes</div>
                            <div className="font-bold text-error mt-0.5">
                                {room.mistakes_made} / {isInfiniteMistakes ? '∞' : room.max_mistakes}
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-2.5 w-full max-w-xs">
                        <button
                            disabled={rematching}
                            onClick={handleRematch}
                            className="flex-1 py-3 bg-primary text-text-inverted rounded-xl font-bold font-telemetry text-xs shadow-btn active:translate-y-0.5"
                        >
                            {rematching ? 'RECONFIGURING...' : 'NEW OPERATION'}
                        </button>
                        <button
                            onClick={onExit}
                            className="px-4 py-3 bg-surface-elevated border border-surface text-text-secondary rounded-xl font-bold font-telemetry text-xs"
                        >
                            LOBBY
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}