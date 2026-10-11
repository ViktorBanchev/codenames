import React, { useState, useEffect } from 'react';
import { X, Plus, FileText, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../utils/supabase';

interface WordPackDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    selectedPackId: string | null;
    onSelectPack: (packId: string) => void;
}

export function WordPackDrawer({
    isOpen,
    onClose,
    selectedPackId,
    onSelectPack,
}: WordPackDrawerProps) {
    const [packs, setPacks] = useState<{ id: string; name: string }[]>([]);
    const [words, setWords] = useState<string[]>([]);
    const [newWord, setNewWord] = useState('');
    const [newPackName, setNewPackName] = useState('');
    const [bulkInput, setBulkInput] = useState('');
    const [isBulkOpen, setIsBulkOpen] = useState(false);

    useEffect(() => {
        loadPacks();
    }, []);

    useEffect(() => {
        if (selectedPackId) loadWords(selectedPackId);
    }, [selectedPackId]);

    const loadPacks = async () => {
        const { data } = await supabase.from('word_packs').select('*').order('created_at', { ascending: false });
        if (data && data.length > 0) {
            setPacks(data);
            if (!selectedPackId) onSelectPack(data[0].id);
        }
    };

    const loadWords = async (packId: string) => {
        const { data } = await supabase.from('pack_words').select('word').eq('pack_id', packId);
        if (data) setWords(data.map((row) => row.word));
    };

    const handleCreatePack = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newPackName.trim()) return;
        const { data } = await supabase.from('word_packs').insert({ name: newPackName.trim() }).select().single();
        if (data) {
            setPacks([data, ...packs]);
            onSelectPack(data.id);
            setNewPackName('');
        }
    };

    const handleAddWord = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newWord.trim() || !selectedPackId) return;
        const clean = newWord.trim().toUpperCase();
        const { error } = await supabase.from('pack_words').insert({ pack_id: selectedPackId, word: clean });
        if (!error) {
            setWords((prev) => [...prev, clean]);
            setNewWord('');
        }
    };

    const handleDeleteWord = async (word: string) => {
        if (!selectedPackId) return;
        await supabase.from('pack_words').delete().eq('pack_id', selectedPackId).eq('word', word);
        setWords((prev) => prev.filter((w) => w !== word));
    };

    const handleBulkImport = async () => {
        if (!selectedPackId || !bulkInput.trim()) return;
        const items = bulkInput
            .split(/[\n,]/)
            .map((w) => w.trim().toUpperCase())
            .filter((w) => w.length > 0);

        const uniqueWords = Array.from(new Set(items));
        const records = uniqueWords.map((word) => ({ pack_id: selectedPackId, word }));

        await supabase.from('pack_words').upsert(records, { onConflict: 'pack_id,word' });
        loadWords(selectedPackId);
        setBulkInput('');
        setIsBulkOpen(false);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex flex-col justify-end backdrop-blur-sm">
            <div className="bg-[#F8F6F0] dark:bg-[#12141C] border-t border-[#E6E2D8] dark:border-[#1F242E] rounded-t-3xl max-h-[85vh] flex flex-col p-4 text-zinc-900 dark:text-zinc-100">
                <div className="flex items-center justify-between pb-3 border-b border-[#E6E2D8] dark:border-[#1F242E]">
                    <div>
                        <h2 className="font-extrabold text-sm uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                            Secret Lexicon & Inside Jokes
                        </h2>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-zinc-500">
                            {words.length >= 25 ? (
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold">
                                    <CheckCircle2 size={13} /> {words.length} / 25 ready
                                </span>
                            ) : (
                                <span className="flex items-center gap-1 text-amber-500 font-bold">
                                    <AlertCircle size={13} /> {words.length} / 25 words (min 25)
                                </span>
                            )}
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="py-2.5 flex gap-2 overflow-x-auto shrink-0">
                    {packs.map((p) => (
                        <button
                            key={p.id}
                            onClick={() => onSelectPack(p.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition ${selectedPackId === p.id
                                    ? 'bg-emerald-600 text-white shadow-md'
                                    : 'bg-zinc-200 dark:bg-zinc-800/80 text-zinc-600 dark:text-zinc-400'
                                }`}
                        >
                            {p.name}
                        </button>
                    ))}
                </div>

                <form onSubmit={handleCreatePack} className="flex gap-2 my-2 shrink-0">
                    <input
                        type="text"
                        placeholder="New deck name..."
                        value={newPackName}
                        onChange={(e) => setNewPackName(e.target.value)}
                        className="flex-1 bg-white dark:bg-[#090A0C] border border-[#E6E2D8] dark:border-[#1F242E] px-3 py-2 rounded-xl text-xs outline-none focus:border-emerald-500"
                    />
                    <button
                        type="submit"
                        className="px-3 bg-zinc-300 dark:bg-zinc-800 text-xs font-bold rounded-xl"
                    >
                        Create
                    </button>
                </form>

                <div className="space-y-3 flex-1 overflow-y-auto pt-1">
                    <form onSubmit={handleAddWord} className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Add inside joke word..."
                            value={newWord}
                            onChange={(e) => setNewWord(e.target.value)}
                            className="flex-1 bg-white dark:bg-[#090A0C] border border-[#E6E2D8] dark:border-[#1F242E] px-3.5 py-2 rounded-xl text-xs uppercase font-extrabold outline-none focus:border-emerald-500"
                        />
                        <button
                            type="submit"
                            className="px-3 bg-emerald-600 text-white rounded-xl text-xs font-bold active:translate-y-0.5"
                        >
                            <Plus size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsBulkOpen(!isBulkOpen)}
                            className="px-2.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-xl text-xs font-semibold flex items-center gap-1 border border-[#E6E2D8] dark:border-[#1F242E]"
                        >
                            <FileText size={14} /> Bulk
                        </button>
                    </form>

                    {isBulkOpen && (
                        <div className="p-2.5 bg-white dark:bg-[#090A0C] rounded-2xl border border-[#E6E2D8] dark:border-[#1F242E] space-y-2">
                            <textarea
                                rows={3}
                                placeholder="Paste words separated by comma or newlines..."
                                value={bulkInput}
                                onChange={(e) => setBulkInput(e.target.value)}
                                className="w-full bg-[#F8F6F0] dark:bg-[#12141C] p-2 text-xs rounded-xl outline-none uppercase font-bold border border-[#E6E2D8] dark:border-[#1F242E]"
                            />
                            <button
                                onClick={handleBulkImport}
                                className="w-full py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold"
                            >
                                Save All Words
                            </button>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-1.5 pb-4">
                        {words.map((w) => (
                            <span
                                key={w}
                                className="inline-flex items-center gap-1.5 bg-white dark:bg-[#161922] border border-[#E6E2D8] dark:border-[#1F242E] shadow-sm px-2.5 py-1.5 rounded-xl text-xs font-extrabold uppercase"
                            >
                                {w}
                                <button onClick={() => handleDeleteWord(w)} className="text-zinc-400 hover:text-rose-500">
                                    <X size={12} />
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}