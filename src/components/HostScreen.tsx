import { useState } from 'react';
import { Copy, Check, ArrowRight, BookOpen, Sparkles, Sun, Moon, ArrowLeft } from 'lucide-react';
import { createDuetRoom } from '../utils/duetLogic';

interface HostScreenProps {
    onLaunch: (roomCode: string) => void;
    onBack: () => void;
    onOpenWordDrawer: () => void;
    selectedPackId: string | null;
    selectedPackWordCount: number;
    isDark: boolean;
    onToggleTheme: () => void;
}

export function HostScreen({
    onLaunch,
    onBack,
    onOpenWordDrawer,
    selectedPackId,
    selectedPackWordCount,
    isDark,
    onToggleTheme,
}: HostScreenProps) {
    const [roomCode] = useState(() => Math.floor(1000 + Math.random() * 9000).toString());
    const [copied, setCopied] = useState(false);
    const [useCustomPack, setUseCustomPack] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(roomCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleStart = async () => {
        await createDuetRoom(roomCode, useCustomPack && selectedPackId ? selectedPackId : undefined);
        onLaunch(roomCode);
    };

    return (
        <div className="tactical-tabletop min-h-screen max-w-md mx-auto text-text-primary flex flex-col justify-between p-4 border-x border-surface select-none">
            <div>
                <header className="flex items-center justify-between pb-3 border-b border-surface">
                    <button onClick={onBack} className="p-1 text-text-secondary hover:text-text-primary">
                        <ArrowLeft size={20} />
                    </button>
                    <span className="font-telemetry text-xs font-bold uppercase tracking-widest text-primary">
                        Mission Briefing
                    </span>
                    <button
                        onClick={onToggleTheme}
                        className="p-1.5 rounded-lg bg-surface border border-surface text-text-secondary"
                    >
                        {isDark ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                </header>

                <div className="my-4">
                    <span className="font-telemetry text-[10px] font-bold uppercase tracking-widest text-primary">
                        ● Cooperative Intelligence Setup
                    </span>
                    <h1 className="font-card text-2xl font-bold tracking-tight text-text-primary mt-1">
                        Host New Mission
                    </h1>
                    <p className="text-xs text-text-secondary mt-0.5">
                        Configure room parameters and pass the code to your partner.
                    </p>
                </div>

                <div className="p-4 rounded-xl bg-surface border border-surface shadow-sm mb-4">
                    <div className="font-telemetry text-[10px] font-bold text-text-secondary uppercase tracking-wider mb-1">
                        Secret Cipher Code
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-2xl font-bold font-telemetry tracking-widest text-primary">
                            #{roomCode}
                        </span>
                        <button
                            onClick={handleCopy}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-surface-elevated border border-surface text-text-secondary active:translate-y-0.5"
                        >
                            {copied ? <Check size={14} className="text-primary" /> : <Copy size={14} />}
                            {copied ? 'Copied' : 'Copy'}
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="font-telemetry text-[11px] font-bold uppercase tracking-wider text-text-secondary">
                        Word Deck & Vocabulary
                    </div>

                    <button
                        onClick={() => setUseCustomPack(false)}
                        className={`w-full p-3.5 rounded-xl text-left border flex items-center justify-between transition ${!useCustomPack
                                ? 'bg-surface border-primary'
                                : 'bg-surface/50 border-surface'
                            }`}
                    >
                        <div className="flex items-center gap-3">
                            <BookOpen size={18} className="text-primary" />
                            <div>
                                <div className="text-xs font-bold font-card">Standard Duet Deck</div>
                                <div className="text-[10px] text-text-secondary">Default Bulgarian agent nouns</div>
                            </div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${!useCustomPack ? 'border-primary' : 'border-surface'}`}>
                            {!useCustomPack && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                    </button>

                    <div
                        className={`p-3.5 rounded-xl border transition ${useCustomPack
                                ? 'bg-surface border-primary'
                                : 'bg-surface/50 border-surface'
                            }`}
                    >
                        <div className="flex items-center justify-between mb-2 cursor-pointer" onClick={() => setUseCustomPack(true)}>
                            <div className="flex items-center gap-3">
                                <Sparkles size={18} className="text-secondary" />
                                <div>
                                    <div className="text-xs font-bold font-card flex items-center gap-2">
                                        Custom Inside Jokes Pack
                                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary-container text-white font-bold uppercase font-telemetry">
                                            Active
                                        </span>
                                    </div>
                                    <div className="text-[10px] text-text-secondary">Player-defined vocabulary list</div>
                                </div>
                            </div>
                            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${useCustomPack ? 'border-primary' : 'border-surface'}`}>
                                {useCustomPack && <div className="w-2 h-2 rounded-full bg-primary" />}
                            </div>
                        </div>

                        <div className="pt-2 border-t border-surface flex items-center justify-between">
                            <span className="font-telemetry text-[10px] font-bold text-text-secondary">
                                {selectedPackWordCount} words ready
                            </span>
                            <button
                                onClick={onOpenWordDrawer}
                                className="font-telemetry text-[11px] font-bold text-primary underline underline-offset-2"
                            >
                                Edit Inside Jokes →
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <footer className="pt-4 shrink-0">
                <button
                    onClick={handleStart}
                    className="w-full py-3.5 rounded-xl bg-primary hover:opacity-95 text-text-inverted font-bold text-sm uppercase tracking-wider flex items-center justify-center gap-2 shadow-btn active:translate-y-0.5"
                >
                    <span>Launch Mission Room</span>
                    <ArrowRight size={16} />
                </button>
            </footer>
        </div>
    );
}