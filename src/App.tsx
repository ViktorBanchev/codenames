import { useState, useEffect } from 'react';
import { HostScreen } from './components/HostScreen';
import { WordPackDrawer } from './components/WordPackDrawer';
import { DuetBoard } from './components/DuetBoard';
import { supabase } from './utils/supabase';
import { ArrowRight, Sun, Moon, Edit3, Clipboard } from 'lucide-react';

export default function App() {
	const [view, setView] = useState<'lobby' | 'host' | 'game'>('lobby');
	const [roomCode, setRoomCode] = useState('');
	const [inputCode, setInputCode] = useState('');
	const [playerRole, setPlayerRole] = useState<'player_a' | 'player_b'>('player_a');
	const [isDark, setIsDark] = useState(true);
	const [isWordDrawerOpen, setIsWordDrawerOpen] = useState(false);
	const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
	const [packWordCount, setPackWordCount] = useState(0);

	useEffect(() => {
		if (isDark) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}, [isDark]);

	useEffect(() => {
		if (selectedPackId) {
			supabase
				.from('pack_words')
				.select('*', { count: 'exact', head: true })
				.eq('pack_id', selectedPackId)
				.then(({ count }) => setPackWordCount(count || 0));
		}
	}, [selectedPackId, isWordDrawerOpen]);

	const handleJoin = () => {
		if (!inputCode.trim()) return;
		setRoomCode(inputCode.trim().replace('#', ''));
		setPlayerRole('player_b'); // Joining partner automatically takes Operative B
		setView('game');
	};

	const handlePasteCode = async () => {
		try {
			const text = await navigator.clipboard.readText();
			if (text) setInputCode(text.trim().replace('#', ''));
		} catch { }
	};

	if (view === 'game') {
		return (
			<DuetBoard
				roomCode={roomCode}
				defaultRole={playerRole}
				onExit={() => setView('lobby')}
			/>
		);
	}

	if (view === 'host') {
		return (
			<>
				<HostScreen
					onLaunch={(code) => {
						setRoomCode(code);
						setPlayerRole('player_a'); // Host takes Operative A
						setView('game');
					}}
					onBack={() => setView('lobby')}
					onOpenWordDrawer={() => setIsWordDrawerOpen(true)}
					selectedPackId={selectedPackId}
					selectedPackWordCount={packWordCount}
					isDark={isDark}
					onToggleTheme={() => setIsDark(!isDark)}
				/>
				<WordPackDrawer
					isOpen={isWordDrawerOpen}
					onClose={() => setIsWordDrawerOpen(false)}
					selectedPackId={selectedPackId}
					onSelectPack={setSelectedPackId}
				/>
			</>
		);
	}

	return (
		<div className="tactical-tabletop min-h-screen max-w-md mx-auto flex flex-col justify-between p-4 border-x border-surface select-none text-text-primary">
			<div>
				<header className="flex items-center justify-between pb-3 border-b border-surface">
					<div className="w-6 h-6 rounded-md bg-surface-elevated border border-surface flex items-center justify-center font-telemetry font-bold text-xs text-primary">
						?
					</div>
					<span className="font-telemetry text-xs font-bold tracking-widest text-primary">
						DUET PROTOCOL
					</span>
					<button
						onClick={() => setIsDark(!isDark)}
						className="p-1.5 rounded-lg bg-surface border border-surface text-text-secondary"
					>
						{isDark ? <Sun size={16} /> : <Moon size={16} />}
					</button>
				</header>

				<div className="text-center my-6">
					<div className="w-12 h-12 mx-auto rounded-xl bg-primary text-text-inverted flex items-center justify-center font-bold text-xl shadow-sm mb-3">
						👥
					</div>
					<h1 className="font-card text-2xl font-bold tracking-tight">
						CODENAMES <span className="text-primary">DUET</span>
					</h1>
					<p className="text-xs text-text-secondary mt-1 max-w-65 mx-auto">
						Cooperative 2-Player Secret Agent Word Game. Uncover all 15 agents before time runs out.
					</p>
				</div>

				<button
					onClick={() => setView('host')}
					className="w-full p-4 mb-3 rounded-xl bg-primary hover:opacity-95 text-text-inverted flex items-center justify-between shadow-btn active:translate-y-0.5 transition"
				>
					<div className="text-left">
						<div className="font-card text-sm font-bold flex items-center gap-2">
							Host New Mission
							<span className="text-[9px] bg-secondary-container text-black px-1.5 py-0.5 rounded font-bold uppercase font-telemetry">
								Operative A
							</span>
						</div>
						<div className="text-[11px] opacity-90 mt-0.5">
							Generate secret room code & start as Operative A
						</div>
					</div>
					<ArrowRight size={20} />
				</button>

				<div className="p-4 rounded-xl bg-surface border border-surface shadow-sm mb-4">
					<div className="flex items-center justify-between text-xs font-telemetry font-bold text-text-secondary uppercase tracking-wider mb-2">
						<span>Join with Code</span>
						<span className="text-[10px] text-primary">Operative B</span>
					</div>
					<div className="flex gap-2">
						<input
							type="text"
							placeholder="E.G. 4289"
							value={inputCode}
							onChange={(e) => setInputCode(e.target.value)}
							className="flex-1 bg-canvas border border-surface px-3.5 py-2.5 rounded-lg text-xs uppercase font-telemetry font-bold outline-none focus:border-primary text-text-primary"
						/>
						<button
							onClick={handlePasteCode}
							className="px-3 bg-surface-elevated border border-surface text-text-secondary rounded-lg text-xs font-bold flex items-center gap-1 active:translate-y-0.5"
						>
							<Clipboard size={14} /> Paste
						</button>
						<button
							onClick={handleJoin}
							className="px-3.5 bg-primary text-text-inverted rounded-lg text-xs font-bold shadow-btn active:translate-y-0.5"
						>
							<ArrowRight size={16} />
						</button>
					</div>
				</div>

				<div
					onClick={() => setIsWordDrawerOpen(true)}
					className="p-3.5 rounded-xl bg-surface border border-surface shadow-sm flex items-center justify-between cursor-pointer active:scale-[0.99] transition"
				>
					<div>
						<div className="font-card text-xs font-bold flex items-center gap-2">
							<span>Custom Word Deck</span>
							<span className="text-[9px] bg-primary-container text-white px-1.5 py-0.5 rounded font-bold font-telemetry">
								{packWordCount} Words
							</span>
						</div>
						<div className="text-[11px] text-text-secondary mt-0.5">
							Add inside jokes, nicknames, or custom packs
						</div>
					</div>
					<div className="p-2 rounded-lg bg-surface-elevated text-text-secondary">
						<Edit3 size={15} />
					</div>
				</div>
			</div>

			<footer className="text-center py-2 text-[10px] text-text-secondary font-telemetry">
				DUET SYNC ACTIVE // v1.0
			</footer>

			<WordPackDrawer
				isOpen={isWordDrawerOpen}
				onClose={() => setIsWordDrawerOpen(false)}
				selectedPackId={selectedPackId}
				onSelectPack={setSelectedPackId}
			/>
		</div>
	);
}