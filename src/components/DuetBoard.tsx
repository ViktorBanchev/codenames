import { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { Shield, LayoutGrid, HelpCircle, Minus, Plus, Lock, RotateCcw, LogOut } from 'lucide-react';
import { createDuetRoom } from '../utils/duetLogic';

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
    turn_phase: 'giving_clue' | 'guessing';
    guesses_remaining: number;
    turns_left: number;
    mistakes_made: number;
    max_mistakes: number;
    found_agents: number;
    status: 'in_progress' | 'won' | 'lost';
    last_clue_word: string | null;
    last_clue_count: number | null;
}

interface DuetBoardProps {
    roomCode: string;
    defaultRole?: 'player_a' | 'player_b';
    onExit: () => void;
}

export function DuetBoard({ roomCode, defaultRole = 'player_a', onExit }: DuetBoardProps) {
    const [cards, setCards] = useState<DuetCard[]>([]);
    const [room, setRoom] = useState<RoomData | null>(null);
    // Role is permanently assigned upon room entry and cannot be switched
    const playerSide = defaultRole;
    const [activeTab, setActiveTab] = useState<'tabletop' | 'keycard'>('tabletop');
    const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
    const [clueWord, setClueWord] = useState('');
    const [clueCount, setClueCount] = useState(2);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        supabase
            .from('duet_rooms')
            .select('*')
            .eq('room_code', roomCode)
            .maybeSingle()
            .then(({ data, error }) => {
                if (error) setErrorMsg(error.message);
                else setRoom(data);
            });

        supabase
            .from('duet_cards')
            .select('*')
            .eq('room_code', roomCode)
            .order('grid_index')
            .then(({ data, error }) => {
                if (error) setErrorMsg(error.message);
                else setCards(data || []);
            });

        const cardChannel = supabase
            .channel(`duet_cards:${roomCode}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'duet_cards', filter: `room_code=eq.${roomCode}` },
                (payload) => {
                    if (payload.eventType === 'UPDATE') {
                        setCards((prev) => prev.map((c) => (c.id === payload.new.id ? (payload.new as DuetCard) : c)));
                    } else if (payload.eventType === 'INSERT') {
                        setCards((prev) => [...prev, payload.new as DuetCard]);
                    }
                }
            )
            .subscribe();

        const roomChannel = supabase
            .channel(`duet_room:${roomCode}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'duet_rooms', filter: `room_code=eq.${roomCode}` },
                (payload) => {
                    setRoom(payload.new as RoomData);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(cardChannel);
            supabase.removeChannel(roomChannel);
        };
    }, [roomCode]);

    // Derived states
    const isMyClueTurn = room?.current_turn === playerSide && room?.turn_phase === 'giving_clue';
    const isMyGuessTurn = room?.current_turn !== playerSide && room?.turn_phase === 'guessing';

    // Force tabletop view when guessing to avoid peeking at keycard
    useEffect(() => {
        if (isMyGuessTurn && activeTab === 'keycard') {
            setActiveTab('tabletop');
        }
    }, [isMyGuessTurn, activeTab]);

    const handleTransmitClue = async () => {
        if (!clueWord.trim() || !room || !isMyClueTurn) return;

        await supabase
            .from('duet_rooms')
            .update({
                last_clue_word: clueWord.trim().toLocaleUpperCase('bg'),
                last_clue_count: clueCount,
                turn_phase: 'guessing',
                guesses_remaining: clueCount + 1,
            })
            .eq('room_code', roomCode);

        setClueWord('');
        setActiveTab('tabletop');
    };

    const handlePassTurn = async () => {
        if (!room || !isMyGuessTurn) return;

        const nextTurn = room.current_turn === 'player_a' ? 'player_b' : 'player_a';
        const nextTurnsLeft = Math.max(0, room.turns_left - 1);

        await supabase
            .from('duet_rooms')
            .update({
                current_turn: nextTurn,
                turn_phase: 'giving_clue',
                guesses_remaining: 0,
                turns_left: nextTurnsLeft,
                status: nextTurnsLeft === 0 && room.found_agents < 15 ? 'lost' : room.status,
            })
            .eq('room_code', roomCode);

        setSelectedCardId(null);
    };

    const handleConfirmGuess = async () => {
        if (!selectedCardId || !room || !isMyGuessTurn) return;
        const card = cards.find((c) => c.id === selectedCardId);
        if (!card) return;

        // Evaluated against the partner's secret keycard
        const partnerRole = playerSide === 'player_a' ? card.role_b : card.role_a;
        const revealCol = playerSide === 'player_a' ? 'is_revealed_b' : 'is_revealed_a';

        let nextTurns = room.turns_left;
        let nextMistakes = room.mistakes_made;
        let nextFound = room.found_agents;
        let nextStatus = room.status;
        let nextGuesses = room.guesses_remaining - 1;
        let nextTurn = room.current_turn;
        let nextPhase = room.turn_phase;

        if (partnerRole === 'agent') {
            nextFound += 1;
            if (nextFound >= 15) nextStatus = 'won';
            if (nextGuesses <= 0) {
                nextTurns = Math.max(0, nextTurns - 1);
                nextTurn = room.current_turn === 'player_a' ? 'player_b' : 'player_a';
                nextPhase = 'giving_clue';
            }
        } else if (partnerRole === 'neutral') {
            nextMistakes += 1;
            nextTurns = Math.max(0, nextTurns - 1);
            nextTurn = room.current_turn === 'player_a' ? 'player_b' : 'player_a';
            nextPhase = 'giving_clue';
            nextGuesses = 0;
            if (nextMistakes >= room.max_mistakes) nextStatus = 'lost';
        } else if (partnerRole === 'assassin') {
            nextStatus = 'lost';
        }

        if (nextTurns <= 0 && nextFound < 15) {
            nextStatus = 'lost';
        }

        await supabase.from('duet_cards').update({ [revealCol]: true }).eq('id', card.id);
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
    };

    const partnerLabel = playerSide === 'player_a' ? 'OPERATIVE B' : 'OPERATIVE A';
    const myLabel = playerSide === 'player_a' ? 'OPERATIVE A' : 'OPERATIVE B';

    return (
        <div className="tactical-tabletop flex flex-col min-h-screen max-w-md mx-auto select-none border-x border-surface">
            {/* HUD Header */}
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
                    {/* Permanent Role Badge (Non-clickable) */}
                    <div className="font-telemetry text-[10px] px-2.5 py-1 rounded-md bg-surface-elevated border border-surface font-bold text-primary shadow-sm tracking-wider">
                        {myLabel}
                    </div>

                    {/* Exit Room Action */}
                    <button
                        onClick={onExit}
                        className="p-1 text-text-secondary hover:text-error transition"
                        title="Exit Room"
                    >
                        <LogOut size={16} />
                    </button>
                </div>
            </header>

            {/* Error alert banner */}
            {errorMsg && (
                <div className="mx-3 mt-2 p-2.5 bg-red-950/80 border border-red-500 text-red-200 text-xs rounded-xl font-telemetry">
                    ⚠ ERROR: {errorMsg}
                </div>
            )}

            {/* Mission Tracker */}
            <section className="mx-3 my-2 p-3 bg-surface rounded-xl border border-surface shadow-sm shrink-0">
                <div className="grid grid-cols-3 gap-2 text-center items-center">
                    <div>
                        <div className="font-telemetry text-[9px] uppercase tracking-wider text-text-secondary">Agents</div>
                        <div className="font-card font-bold text-sm text-primary mt-0.5">
                            {room?.found_agents ?? 0} / 15
                        </div>
                    </div>
                    <div>
                        <div className="font-telemetry text-[9px] uppercase tracking-wider text-text-secondary">Time Tokens</div>
                        <div className="flex justify-center gap-1 mt-1">
                            {Array.from({ length: 9 }).map((_, i) => (
                                <span
                                    key={i}
                                    className={`w-2.5 h-2.5 rounded-full ${i < (room?.turns_left ?? 9)
                                        ? 'bg-secondary-container border border-secondary'
                                        : 'bg-surface-elevated'
                                        }`}
                                />
                            ))}
                        </div>
                    </div>
                    <div>
                        <div className="font-telemetry text-[9px] uppercase tracking-wider text-text-secondary">Mistakes</div>
                        <div className="font-card font-bold text-sm text-error mt-0.5">
                            {room?.mistakes_made ?? 0} / {room?.max_mistakes ?? 2}
                        </div>
                    </div>
                </div>
            </section>

            {/* Dynamic Status / Clue Banner */}
            <div className="mx-3 mb-2 px-3 py-2 bg-primary-container text-white rounded-lg flex items-center justify-between text-xs shadow-sm shrink-0">
                <div className="truncate font-telemetry">
                    {room?.turn_phase === 'giving_clue' ? (
                        <span>
                            {isMyClueTurn ? '⚡ YOUR TURN: Formulate a Clue' : `⏳ AWAITING CIPHER from ${partnerLabel}...`}
                        </span>
                    ) : (
                        <span>
                            CIPHER: <strong className="tracking-widest">{room?.last_clue_word}</strong> ({room?.last_clue_count})
                            {isMyGuessTurn ? ` • Guesses left: ${room?.guesses_remaining}` : ` • ${partnerLabel} guessing`}
                        </span>
                    )}
                </div>
                <span className="font-telemetry text-[9px] uppercase bg-black/30 px-1.5 py-0.5 rounded font-bold shrink-0 ml-2">
                    {room?.turn_phase === 'giving_clue' ? 'CIPHER PHASE' : 'GUESS PHASE'}
                </span>
            </div>

            {/* 5x5 Card Matrix */}
            <main className="flex-1 px-3 grid grid-cols-5 gap-1.5 place-content-center">
                {cards.length === 0 ? (
                    <div className="col-span-5 py-12 text-center flex flex-col items-center gap-3">
                        <span className="font-telemetry text-xs text-text-secondary">Tabletop matrix is empty</span>
                        <button
                            onClick={() => createDuetRoom(roomCode)}
                            className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl shadow-btn active:translate-y-0.5"
                        >
                            Generate 25 Duet Cards
                        </button>
                    </div>
                ) : (
                    cards.map((card) => {
                        const isKeycard = activeTab === 'keycard';
                        const myKeyRole = playerSide === 'player_a' ? card.role_a : card.role_b;
                        const isRevealed = card.is_revealed_a || card.is_revealed_b;
                        const isSelected = selectedCardId === card.id;

                        let cardBg = 'bg-surface-card border-card';
                        let textColor = 'text-text-primary';
                        let shadow = 'shadow-card';

                        if (isKeycard) {
                            if (myKeyRole === 'agent') {
                                cardBg = 'bg-primary-container border-primary';
                                textColor = 'text-white';
                            } else if (myKeyRole === 'assassin') {
                                cardBg = 'bg-zinc-900 border-red-500 text-white';
                            } else {
                                cardBg = 'bg-surface-elevated border-surface opacity-40';
                                textColor = 'text-text-secondary';
                            }
                        } else if (isRevealed) {
                            cardBg = 'bg-primary-container border-primary opacity-80';
                            textColor = 'text-white';
                            shadow = 'shadow-none';
                        } else if (isSelected) {
                            cardBg = 'bg-surface-elevated border-2 border-secondary-container';
                            shadow = 'shadow-card-lift -translate-y-0.5';
                        }

                        return (
                            <button
                                key={card.id}
                                disabled={isKeycard || isRevealed || !isMyGuessTurn || room?.status !== 'in_progress'}
                                onClick={() => setSelectedCardId(card.id)}
                                className={`aspect-4/3 rounded-lg p-1 flex flex-col items-center justify-center transition-all border ${cardBg} ${shadow} active:translate-y-0.5`}
                            >
                                <span className="font-card text-[clamp(8px,1.9vw,11px)] font-bold uppercase leading-tight tracking-[0.02em] text-center wrap-break-word line-clamp-2 px-0.5">
                                    {card.word}
                                </span>
                                {isRevealed && !isKeycard && (
                                    <span className="font-telemetry text-[7.5px] mt-0.5 uppercase tracking-wider font-bold">
                                        ✓ AGENT
                                    </span>
                                )}
                            </button>
                        );
                    })
                )}
            </main>

            {/* Interactive Bottom Control Panel */}
            <section className="mx-3 mt-2 mb-2 p-2.5 bg-surface rounded-xl border border-surface shadow-sm shrink-0">
                {room?.status !== 'in_progress' ? (
                    <div className="text-center py-2 font-telemetry font-bold text-sm">
                        {room?.status === 'won' ? (
                            <span className="text-primary">🎉 MISSION ACCOMPLISHED: ALL 15 AGENTS FOUND!</span>
                        ) : (
                            <span className="text-error">☠ MISSION COMPROMISED: TIME OR ASSASSIN TRIGGERED</span>
                        )}
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
                            <button onClick={() => setClueCount((c) => Math.max(1, c - 1))} className="p-0.5 text-text-secondary">
                                <Minus size={12} />
                            </button>
                            <span className="w-3 text-center">{clueCount}</span>
                            <button onClick={() => setClueCount((c) => c + 1)} className="p-0.5 text-text-secondary">
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
                                    onClick={() => setSelectedCardId(null)}
                                    className="px-3 py-2 bg-surface-elevated text-text-secondary font-telemetry font-bold text-xs rounded-lg border border-surface"
                                >
                                    CANCEL
                                </button>
                            </>
                        ) : (
                            <button
                                onClick={handlePassTurn}
                                className="w-full py-2 bg-surface-elevated border border-surface text-text-secondary hover:text-text-primary font-telemetry font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 active:translate-y-0.5"
                            >
                                <RotateCcw size={13} />
                                <span>END TURN / PASS TO {partnerLabel}</span>
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
                    onClick={() => setActiveTab('tabletop')}
                    className={`flex items-center gap-1.5 font-telemetry text-xs font-bold px-4 py-2 rounded-lg transition ${activeTab === 'tabletop' ? 'bg-primary text-text-inverted' : 'text-text-secondary'
                        }`}
                >
                    <LayoutGrid size={15} /> TABLETOP
                </button>

                <button
                    disabled={isMyGuessTurn}
                    onClick={() => setActiveTab('keycard')}
                    className={`flex items-center gap-1.5 font-telemetry text-xs font-bold px-4 py-2 rounded-lg transition ${activeTab === 'keycard'
                        ? 'bg-primary text-text-inverted'
                        : isMyGuessTurn
                            ? 'opacity-40 cursor-not-allowed text-text-secondary'
                            : 'text-text-secondary'
                        }`}
                >
                    {isMyGuessTurn ? <Lock size={14} /> : <Shield size={15} />}
                    <span>KEYCARD</span>
                </button>
            </nav>
        </div>
    );
}