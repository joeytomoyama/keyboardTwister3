import React, { useEffect, useMemo, useState } from "react";

// === Keyboard Twister ===
// Up to 4 players share one keyboard. Each round assigns a new random key
// to the current player. Players must keep ALL of their assigned keys held.
// If any assigned key is released, that player is eliminated. Last player wins.
//
// Features:
// - Light/Dark theme toggle (persisted in localStorage)
// - Click player names to rename inline
// - N-key rollover checker: shows current concurrently held keys & max peak

const PLAYER_COLORS = [
  { name: "Player 1", color: "#ef4444" }, // red
  { name: "Player 2", color: "#3b82f6" }, // blue
  { name: "Player 3", color: "#10b981" }, // green
  { name: "Player 4", color: "#f59e0b" }, // amber
];

// Layout of a simple US keyboard without symbols; limiting to letters & digits & space.
const KEY_ROWS: string[][] = [
  ["1","2","3","4","5","6","7","8","9","0"],
  ["Q","W","E","R","T","Y","U","I","O","P"],
  ["A","S","D","F","G","H","J","K","L"],
  ["Z","X","C","V","B","N","M"],
  ["SPACE"],
];

// All selectable keys as a flat list
const ALL_KEYS = KEY_ROWS.flat().filter(k => k !== "");

function normalizeKey(e: KeyboardEvent): string | null {
  // Ignore typing inside inputs/contenteditable
  const target = e.target as HTMLElement | null;
  if (target && (target.tagName === "INPUT" || target.isContentEditable)) {
    return null;
  }
  // Only accept letters, digits, and space.
  const key = e.key;
  if (key === " ") return "SPACE";
  const upper = key.toUpperCase();
  if (/^[A-Z]$/.test(upper)) return upper;
  if (/^[0-9]$/.test(key)) return key; // digits already ok
  return null;
}

function usePressedKeys() {
  const [down, setDown] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handleDown = (e: KeyboardEvent) => {
      const n = normalizeKey(e);
      if (!n) return;
      e.preventDefault();
      setDown(prev => {
        if (prev.has(n)) return prev;
        const next = new Set(prev);
        next.add(n);
        return next;
      });
    };
    const handleUp = (e: KeyboardEvent) => {
      const n = normalizeKey(e);
      if (!n) return;
      e.preventDefault();
      setDown(prev => {
        if (!prev.has(n)) return prev;
        const next = new Set(prev);
        next.delete(n);
        return next;
      });
    };
    window.addEventListener("keydown", handleDown);
    window.addEventListener("keyup", handleUp);
    return () => {
      window.removeEventListener("keydown", handleDown);
      window.removeEventListener("keyup", handleUp);
    };
  }, []);

  return down;
}

type Player = {
  id: number; // 0..3
  name: string;
  color: string;
  alive: boolean;
  keys: string[]; // keys assigned to this player
};

type Phase = "lobby" | "playing" | "finished";

type Theme = "light" | "dark";

export default function KeyboardTwister() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [phase, setPhase] = useState<Phase>("lobby");
  const [round, setRound] = useState(1);
  const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0); // index in active player order
  const pressed = usePressedKeys();
  const [maxSimultaneous, setMaxSimultaneous] = useState<number>(0);
  const [message, setMessage] = useState<string>("Join up to 4 players and press Start.");

  // THEME
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = typeof window !== 'undefined' ? (localStorage.getItem('kbTwisterTheme') as Theme | null) : null;
    return saved || 'light';
  });
  useEffect(() => {
    localStorage.setItem('kbTwisterTheme', theme);
  }, [theme]);

  // Update N-key rollover max whenever the pressed set changes
  useEffect(() => {
    setMaxSimultaneous(prev => Math.max(prev, pressed.size));
  }, [pressed]);

  const skin = useMemo(() => {
    if (theme === 'dark') {
      return {
        page: "inset w-screen h-screen bg-slate-950 text-slate-100 p-6 flex flex-col gap-6",
        panel: "bg-slate-900 border border-slate-800 rounded-2xl p-4",
        softPanel: "bg-slate-900 border border-slate-800 rounded-2xl p-4",
        muted: "opacity-80",
        statusAlive: "text-emerald-400",
        statusOut: "text-rose-400",
        btnReset: "bg-slate-700 hover:bg-slate-600 text-white",
        keyUnowned: "#0f172a",
        keyPressed: "#334155",
        keyBorder: "1px solid #1e293b",
        keyPressedBorder: "2px solid white",
        ownerKeyText: "#0b0f1a",
        chipBg: "bg-slate-800 border border-slate-700",
        chipBorderColor: "#1f2937",
        btnGhost: {
          bg: '#0f172a', text: '#e5e7eb', border: '#1f2937'
        }
      };
    }
    // light
    return {
      page: "inset w-screen h-screen bg-white text-gray-900 p-6 flex flex-col gap-6",
      panel: "bg-gray-100 border border-gray-300 rounded-2xl p-4",
      softPanel: "bg-gray-100 border border-gray-300 rounded-2xl p-4",
      muted: "opacity-80",
      statusAlive: "text-emerald-600",
      statusOut: "text-rose-600",
      btnReset: "bg-gray-300 hover:bg-gray-400 text-black",
      keyUnowned: "#f9fafb",
      keyPressed: "#e5e7eb",
      keyBorder: "1px solid #d1d5db",
      keyPressedBorder: "2px solid black",
      ownerKeyText: "#ffffff",
      chipBg: "bg-gray-200 border border-gray-300",
      chipBorderColor: "#d1d5db",
      btnGhost: {
        bg: '#f3f4f6', text: '#111827', border: '#d1d5db'
      }
    };
  }, [theme]);

  // Editable slot names (used both before and after joining)
  const [slotNames, setSlotNames] = useState<string[]>(PLAYER_COLORS.map(p => p.name));
  const [editingSlot, setEditingSlot] = useState<number | null>(null);

  // Keep a basic history log for fun/debug
  const [log, setLog] = useState<string[]>([]);
  console.log('log', log); // prevent unused var warning
  const addLog = (line: string) => setLog(prev => [line, ...prev].slice(0, 50));

  const activePlayers = useMemo(() => players.filter(p => p.alive), [players]);

  // Assigned keys map -> which player owns this key
  const assignedOwner = useMemo(() => {
    const map = new Map<string, number>();
    players.forEach(p => {
      if (!p.alive) return;
      p.keys.forEach(k => map.set(k, p.id));
    });
    return map;
  }, [players]);

  // Determine eliminated players when any assigned key is not pressed
  useEffect(() => {
    if (phase !== "playing") return;

    setPlayers(prev => {
      let changed = false;
      const next = prev.map(p => ({ ...p }));
      for (const p of next) {
        if (!p.alive) continue;
        const allHeld = p.keys.every(k => pressed.has(k));
        if (!allHeld && p.keys.length > 0) {
          p.alive = false;
          changed = true;
        }
      }
      if (changed) {
        const eliminated = next.filter(p => !p.alive && prev.find(pp => pp.id === p.id)?.alive);
        eliminated.forEach(p => addLog(`${p.name} eliminated!`));
      }
      return next;
    });
  }, [pressed, phase]);

  // Victory condition
  useEffect(() => {
    if (phase !== "playing") return;
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      setPhase("finished");
      setMessage(`${winner.name} wins! 🎉`);
      addLog(`${winner.name} wins!`);
    }
  }, [activePlayers, phase]);

  // If current player was eliminated, advance pointer to next alive automatically
  useEffect(() => {
    if (phase !== "playing") return;
    if (activePlayers.length === 0) return;
    const idx = currentPlayerIndex % activePlayers.length;
    setCurrentPlayerIndex(idx);
  }, [players, phase]);

//   useEffect(() => {
// 	if (phase !== "playing") return;
//     if (activePlayers.length === 0) return;
// 	assignNextKey();
// //   }, [players, phase, round])
//   }, [round])

  useEffect(() => {
	if (phase !== "playing") return;
	assignNextKey();
  }, [phase])

  // keyboard listener for f keys to join/leave players in lobby
	useEffect(() => {
		const handleFKey = (e: KeyboardEvent) => {
			if (phase !== "lobby") return;
			if (e.repeat) return;
			if (document.activeElement && (document.activeElement.tagName === "INPUT" || (document.activeElement as HTMLElement).isContentEditable)) return;
			let slot: number | null = null;
			if (e.key === "F1") slot = 0;
			if (e.key === "F2") slot = 1;
			if (e.key === "F3") slot = 2;
			if (e.key === "F4") slot = 3;
			if (slot !== null) {
				e.preventDefault();
				const joined = !!players.find(p => p.id === slot);
				if (joined) {
					leavePlayer(slot);
				} else {
					joinPlayer(slot);
				}
			}
		};
		window.addEventListener("keydown", handleFKey);
		return () => window.removeEventListener("keydown", handleFKey);
	}, [phase, players, slotNames]);

  const joinPlayer = (slot: number) => {
    if (phase !== "lobby") return;
    if (players.find(p => p.id === slot)) return;
    const def = PLAYER_COLORS[slot];
    setPlayers(prev => [
      ...prev,
      { id: slot, name: slotNames[slot] || def.name, color: def.color, alive: true, keys: [] },
    ]);
  };

  const leavePlayer = (slot: number) => {
    if (phase !== "lobby") return;
    setPlayers(prev => prev.filter(p => p.id !== slot));
  };

  const startGame = () => {
    if (players.length < 2) {
      setMessage("Need at least 2 players to start.");
      return;
    }
    // Reset states
    setPlayers(prev => prev.map(p => ({ ...p, alive: true, keys: [] })));
    setPhase("playing");
    setRound(1);
    setCurrentPlayerIndex(0);
    setLog([]);
  };

  const resetGame = () => {
    setPhase("lobby");
    setRound(1);
    setCurrentPlayerIndex(0);
    setPlayers([]);
    setMessage("Join up to 4 players and press Start.");
    setLog([]);
  };

  const availableKeys = useMemo(() => {
    // Keys that are not already assigned
    const used = new Set<string>();
    players.forEach(p => p.keys.forEach(k => used.add(k)));
    return ALL_KEYS.filter(k => !used.has(k));
  }, [players]);

  const assignNextKey = () => {
    // if (phase !== "playing") return;
    // if (activePlayers.length === 0) return;
    if (availableKeys.length === 0) {
      setMessage("No keys left to assign! 😅");
      return;
    }

    const rnd = Math.floor(Math.random() * availableKeys.length);
    const key = availableKeys[rnd];

    const target = activePlayers[currentPlayerIndex % activePlayers.length];

    setPlayers(prev => prev.map(p => (
      p.id === target.id ? { ...p, keys: [...p.keys, key] } : p
    )));

    // setRound(r => r + 1);
    setCurrentPlayerIndex(i => (i + 1) % activePlayers.length);
    setMessage(`${target.name}: Hold ${renderKeyLabel(key)} (now hold ${target.keys.length + 1} key${target.keys.length ? "s" : ""}).`);
    addLog(`Round ${round}: ${target.name} assigned ${key}`);
  };

  // --- UI helpers ---
  const ownerOf = (k: string) => {
    const pid = assignedOwner.get(k);
    if (pid === undefined) return null;
    return players.find(p => p.id === pid) || null;
  };

  const renderKeyLabel = (k: string) => (k === "SPACE" ? "Space" : k);

//   const currentlyHeldKeys = useMemo(() => Array.from(pressed).sort(), [pressed]);

  // --- Styles ---
  const tileBase =
    "select-none rounded-2xl shadow-sm border text-center font-semibold py-3 px-4 transition-transform duration-75 active:scale-95";

  return (
    <div className={skin.page}>
      <header className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold">Keyboard Twister</h1>
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={() => setTheme(t => (t === 'light' ? 'dark' : 'light'))}
            className="px-3 py-2 rounded-xl border font-semibold hover:opacity-90"
            style={{
              background: skin.btnGhost.bg,
              color: skin.btnGhost.text,
              borderColor: skin.btnGhost.border,
            }}
            title="Toggle light/dark"
          >
            {theme === 'dark' ? '🌙 Dark' : '☀️ Light'}
          </button>

          {phase === "lobby" && (
            <button onClick={startGame} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-semibold">Start</button>
          )}
          {phase === "playing" && (
            <>
              <button onClick={assignNextKey} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl font-semibold">Next Round</button>
              <button onClick={resetGame} className={`${skin.btnReset} px-4 py-2 rounded-xl font-semibold`}>Reset</button>
            </>
          )}
          {phase === "finished" && (
            <button onClick={resetGame} className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-xl font-semibold">New Game</button>
          )}
        </div>
      </header>

      {/* Status Bar */}
      <div className={`${skin.panel} flex flex-col md:flex-row md:items-center md:justify-between gap-3`}>
        <div className="text-lg">{message}</div>
        <div className="flex items-center gap-4">
          <div className={`text-sm ${skin.muted}`}>Round: <span className="font-bold">{round}</span></div>
          {phase === "playing" && activePlayers.length > 0 && (
            <div className={`text-sm ${skin.muted}`}>Turn: <span className="font-bold">{activePlayers[currentPlayerIndex % activePlayers.length].name}</span></div>
          )}
        </div>
      </div>

      {/* N-Key Rollover Checker */}
      <section className={`${skin.panel} flex flex-col gap-3`}>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="text-sm">Currently held: <span className="font-bold">{pressed.size}</span></div>
            <div className="text-sm">Max held at once: <span className="font-bold">{maxSimultaneous}</span></div>
            {/* <button
              onClick={() => setMaxSimultaneous(0)}
              className="px-3 py-1 rounded-lg border font-semibold hover:opacity-90"
              style={{
                background: skin.btnGhost.bg,
                color: skin.btnGhost.text,
                borderColor: skin.btnGhost.border,
              }}
            >Reset Max</button> */}
          </div>
          <div className={`text-sm ${skin.muted}`}>Tip: Press multiple keys together to test your keyboard&apos;s rollover. Many office keyboards cap at 5-6; gaming boards may be full NKRO.</div>
        </div>
        {/* {currentlyHeldKeys.length > 0 && (
          <div className="text-sm">
            Held keys: <span className="font-semibold">{currentlyHeldKeys.map(k => k === 'SPACE' ? 'Space' : k).join(', ')}</span>
          </div>
        )} */}
      </section>

      {/* Players Panel */}
      <section className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLAYER_COLORS.map((pc, i) => {
          const p = players.find(pp => pp.id === i);
          const joined = !!p;
          const alive = p?.alive;
          const displayName = joined ? p!.name : slotNames[i];
          return (
            <div key={i} className={skin.panel + " flex flex-col gap-3"}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: pc.color }} />
                  {editingSlot === i ? (
                    <input
                      autoFocus
                      defaultValue={displayName}
                      onBlur={(e) => {
                        const trimmed = e.currentTarget.value.trim() || `Player ${i + 1}`;
                        setSlotNames(prev => prev.map((n, idx) => (idx === i ? trimmed : n)));
                        setPlayers(prev => prev.map(pl => (pl.id === i ? { ...pl, name: trimmed } : pl)));
                        setEditingSlot(null);
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation(); // don't feed the global key tracker
                        if (e.key === 'Enter') {
                          (e.currentTarget as HTMLInputElement).blur();
                        } else if (e.key === 'Escape') {
                          setEditingSlot(null);
                        }
                      }}
                      className="bg-white border border-gray-300 rounded-lg px-2 py-1 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  ) : (
                    <button
                      className="font-bold hover:underline"
                      onClick={() => setEditingSlot(i)}
                      title="Click to rename"
                    >
                      {displayName}
                    </button>
                  )}
                </div>
                {phase === "lobby" && (
                  joined ? (
                    <button onClick={() => leavePlayer(i)} className="text-xs px-2 py-1 rounded-lg border bg-transparent hover:bg-black/5" style={{ borderColor: theme==='dark'? '#1f2937':'#d1d5db' }}>Leave</button>
                  ) : (
                    <button onClick={() => joinPlayer(i)} className="text-xs px-2 py-1 rounded-lg border bg-transparent hover:bg-black/5" style={{ borderColor: theme==='dark'? '#1f2937':'#d1d5db' }}>Join</button>
                  )
                )}
              </div>
              <div className="text-sm">
                Status: {joined ? (alive ? <span className={`${skin.statusAlive} font-semibold`}>Alive</span> : <span className={`${skin.statusOut} font-semibold`}>Out</span>) : <span className={skin.muted}>Not joined</span>}
              </div>
              <div className="text-sm">
                Keys: {p && p.keys.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {p.keys.map(k => (
                      <span key={k} className={`px-2 py-1 rounded-lg ${skin.chipBg}`} style={{ boxShadow: pressed.has(k) ? `0 0 0 2px ${pc.color}` : undefined }}>{k === 'SPACE' ? 'Space' : k}</span>
                    ))}
                  </div>
                ) : (
                  <span className={skin.muted}>—</span>
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* Keyboard Grid */}
      <section className={skin.softPanel}>
        <h3 className="font-bold mb-3">Keyboard</h3>
        <div className="flex flex-col gap-2">
          {KEY_ROWS.map((row, ri) => (
            <div key={ri} className="flex gap-2 justify-center">
              {row.map((k) => {
                const owner = ownerOf(k);
                const isDown = pressed.has(k);
                const bg = owner ? owner.color : isDown ? skin.keyPressed : skin.keyUnowned;
                const border = isDown ? skin.keyPressedBorder : skin.keyBorder;
                const w = k === "SPACE" ? "w-3/4" : "w-12";
                return (
                  <div key={k}
                       className={`${tileBase} ${w}`}
                       style={{ background: bg, border, color: owner ? skin.ownerKeyText : undefined }}>
                    {k === "SPACE" ? "Space" : k}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className={`mt-3 text-sm ${skin.muted}`}>Tip: Assigned keys are tinted with the owner&apos;s color. A bold border indicates the key is currently pressed.</p>
      </section>

      {/* Log */}
      {/* <section className={skin.panel}>
        <h3 className="font-bold mb-2">Game Log</h3>
        <div className="text-sm max-h-48 overflow-auto space-y-1">
          {log.length === 0 && <div className={skin.muted}>—</div>}
          {log.map((l, idx) => (
            <div key={idx}>{l}</div>
          ))}
        </div>
      </section> */}

      <footer className={`text-center ${skin.muted} text-xs`}>Hold all your assigned keys. Release one and you&apos;re out. Last player standing wins.</footer>
    </div>
  );
}
