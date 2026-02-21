import { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

type Position = { row: number; col: number };
type Player = 'schwarz' | 'weiss';
type Stein = { spieler: Player; istKoenig: boolean } | null;

function App() {
  const [brett, setBrett] = useState<Stein[][]>(() => {
    const neuesBrett: Stein[][] = Array(8).fill(null).map(() => Array(8).fill(null));
    
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 !== 0) {
          neuesBrett[row][col] = { spieler: 'schwarz', istKoenig: false };
        }
      }
    }
    
    for (let row = 5; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        if ((row + col) % 2 !== 0) {
          neuesBrett[row][col] = { spieler: 'weiss', istKoenig: false };
        }
      }
    }
    
    return neuesBrett;
  });

  const [selectedPos, setSelectedPos] = useState<Position | null>(null);
  const [aktuellerSpieler, setAktuellerSpieler] = useState<Player>('schwarz');
  const [meinSpieler, setMeinSpieler] = useState<Player | null>(null);
  const [warteAufGegner, setWarteAufGegner] = useState(true);
  const [verbunden, setVerbunden] = useState(false);
  const [raumModus, setRaumModus] = useState<'matchmaking' | 'raum' | null>(null);
  const [raumId, setRaumId] = useState<string | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  
  const [timer, setTimer] = useState<number>(60);
  const [timerAktiv, setTimerAktiv] = useState<boolean>(false);
  const [spielGewonnen, setSpielGewonnen] = useState<Player | null>(null);
  const [spielBeendet, setSpielBeendet] = useState<boolean>(false);

  // Sound-Referenzen
  const winSoundRef = useRef<HTMLAudioElement | null>(null);
  const loseSoundRef = useRef<HTMLAudioElement | null>(null);

  // Sound-Effekt bei Gewinn/Verlust
  useEffect(() => {
    if (spielBeendet && spielGewonnen) {
      if (spielGewonnen === meinSpieler) {
        // Gewonnen - Jubel-Sound
        if (winSoundRef.current) {
          winSoundRef.current.play().catch(e => console.log('Sound konnte nicht abgespielt werden', e));
        }
      } else {
        // Verloren - Trauer-Sound
        if (loseSoundRef.current) {
          loseSoundRef.current.play().catch(e => console.log('Sound konnte nicht abgespielt werden', e));
        }
      }
    }
  }, [spielBeendet, spielGewonnen, meinSpieler]);

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    socketRef.current = io('http://localhost:3001', {
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      transports: ['websocket']
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/raum/')) {
      const raumCode = path.split('/')[2];
      if (raumCode && socketRef.current) {
        setTimeout(() => {
          socketRef.current?.emit('raumBetreten', raumCode);
          setRaumModus('raum');
          setWarteAufGegner(true);
        }, 500);
      }
    }
  }, []);

  useEffect(() => {
    if (!socketRef.current) return;

    const socket = socketRef.current;

    socket.on('connect', () => {
      console.log('✅ Mit Server verbunden');
      setVerbunden(true);
    });

    socket.on('spielerZugewiesen', (spieler: Player) => {
      setMeinSpieler(spieler);
    });

    socket.on('spielGestartet', () => {
      setWarteAufGegner(false);
      setSpielBeendet(false);
      setSpielGewonnen(null);
    });

    socket.on('gegnerZug', (zug: { von: Position; nach: Position }) => {
      console.log('🔥 Gegner-Zug erhalten:', zug);
      
      setBrett(prevBrett => {
        const neuesBrett = prevBrett.map(row => [...row]);
        
        const stein = neuesBrett[zug.von.row][zug.von.col];
        if (!stein) return prevBrett;
        
        neuesBrett[zug.von.row][zug.von.col] = null;
        neuesBrett[zug.nach.row][zug.nach.col] = stein;
        
        const rowDiff = Math.abs(zug.nach.row - zug.von.row);
        const colDiff = Math.abs(zug.nach.col - zug.von.col);
        
        if (rowDiff === 2 && colDiff === 2) {
          const mittelRow = (zug.von.row + zug.nach.row) / 2;
          const mittelCol = (zug.von.col + zug.nach.col) / 2;
          neuesBrett[mittelRow][mittelCol] = null;
        }
        
        return neuesBrett;
      });
      
      setAktuellerSpieler(prev => prev === 'schwarz' ? 'weiss' : 'schwarz');
      setSelectedPos(null);
    });

    socket.on('raumErstellt', (id: string) => {
      setRaumId(id);
      setRaumModus('raum');
      setWarteAufGegner(true);
    });

    socket.on('fehler', (msg: string) => {
      setFehler(msg);
      setTimeout(() => setFehler(null), 3000);
    });

    return () => {
      socket.off('connect');
      socket.off('spielerZugewiesen');
      socket.off('spielGestartet');
      socket.off('gegnerZug');
      socket.off('raumErstellt');
      socket.off('fehler');
    };
  }, []);

  useEffect(() => {
    if (spielBeendet || warteAufGegner) return;
    
    let schwarz = 0;
    let weiss = 0;
    
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const s = brett[row][col];
        if (s) {
          if (s.spieler === 'schwarz') schwarz++;
          else weiss++;
        }
      }
    }
    
    if (schwarz === 0) {
      setSpielBeendet(true);
      setSpielGewonnen('weiss');
    } else if (weiss === 0) {
      setSpielBeendet(true);
      setSpielGewonnen('schwarz');
    }
  }, [brett, spielBeendet, warteAufGegner]);

  useEffect(() => {
    if (warteAufGegner || spielBeendet || meinSpieler === aktuellerSpieler) {
      setTimerAktiv(false);
      return;
    }

    setTimerAktiv(true);
    setTimer(60);
    
    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setTimerAktiv(false);
          setSpielBeendet(true);
          setSpielGewonnen(meinSpieler);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [aktuellerSpieler, meinSpieler, warteAufGegner, spielBeendet]);

  const spielSuchen = () => {
    socketRef.current?.emit('spielSuchen');
    setRaumModus('matchmaking');
    setWarteAufGegner(true);
  };

  const raumErstellen = () => {
    socketRef.current?.emit('raumErstellen');
    setRaumModus('raum');
  };

  const raumBetreten = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    const code = formData.get('raumCode') as string;
    if (code) {
      socketRef.current?.emit('raumBetreten', code.toUpperCase());
    }
  };

  const copyLink = () => {
    const link = `http://localhost:5173/raum/${raumId}`;
    navigator.clipboard.writeText(link);
    alert('Link kopiert!');
  };

  const istGueltigerZug = (
    von: Position, 
    nach: Position, 
    spieler: Player,
    istKoenig: boolean
  ): boolean => {
    const rowDiff = nach.row - von.row;
    const colDiff = Math.abs(nach.col - von.col);
    
    if (colDiff !== 1 || Math.abs(rowDiff) !== 1) return false;
    if (brett[nach.row][nach.col] !== null) return false;
    
    if (!istKoenig) {
      if (spieler === 'schwarz' && rowDiff <= 0) return false;
      if (spieler === 'weiss' && rowDiff >= 0) return false;
    }
    
    return true;
  };

  const kannFressen = (
    von: Position,
    nach: Position,
    spieler: Player,
    istKoenig: boolean
  ): boolean => {
    const rowDiff = nach.row - von.row;
    const colDiff = Math.abs(nach.col - von.col);
    
    if (colDiff !== 2 || Math.abs(rowDiff) !== 2) return false;
    if (brett[nach.row][nach.col] !== null) return false;
    
    const mittelRow = von.row + (rowDiff > 0 ? 1 : -1);
    const mittelCol = von.col + (nach.col > von.col ? 1 : -1);
    const gegner = brett[mittelRow]?.[mittelCol];
    
    if (!gegner || gegner.spieler === spieler) return false;
    
    if (!istKoenig) {
      if (spieler === 'schwarz' && rowDiff <= 0) return false;
      if (spieler === 'weiss' && rowDiff >= 0) return false;
    }
    
    return true;
  };

  const hatWeitereFresszuege = (pos: Position, spieler: Player, istKoenig: boolean): boolean => {
    const richtungen = [
      { row: -2, col: -2 }, { row: -2, col: 2 },
      { row: 2, col: -2 }, { row: 2, col: 2 }
    ];
    
    for (const dir of richtungen) {
      const nach = { row: pos.row + dir.row, col: pos.col + dir.col };
      
      if (nach.row < 0 || nach.row >= 8 || nach.col < 0 || nach.col >= 8) continue;
      
      const gegnerRow = pos.row + (dir.row > 0 ? 1 : -1);
      const gegnerCol = pos.col + (dir.col > 0 ? 1 : -1);
      const gegner = brett[gegnerRow]?.[gegnerCol];
      
      if (!gegner || gegner.spieler === spieler) continue;
      if (brett[nach.row][nach.col] !== null) continue;
      
      if (istKoenig) return true;
      if (spieler === 'schwarz' && dir.row > 0) return true;
      if (spieler === 'weiss' && dir.row < 0) return true;
    }
    return false;
  };

  const handleFeldKlick = (row: number, col: number) => {
    if (warteAufGegner || meinSpieler !== aktuellerSpieler || spielBeendet) return;
    
    const stein = brett[row][col];
    
    if (selectedPos) {
      const von = selectedPos;
      const nach = { row, col };
      const ausgewaehlterStein = brett[von.row][von.col];
      
      if (!ausgewaehlterStein) return;
      
      const istFressen = kannFressen(von, nach, meinSpieler!, ausgewaehlterStein.istKoenig);
      const istNormalerZug = istGueltigerZug(von, nach, meinSpieler!, ausgewaehlterStein.istKoenig);
      
      if (istFressen || istNormalerZug) {
        const neuesBrett = brett.map(row => [...row]);
        
        if (istFressen) {
          const mittelRow = von.row + (nach.row > von.row ? 1 : -1);
          const mittelCol = von.col + (nach.col > von.col ? 1 : -1);
          neuesBrett[mittelRow][mittelCol] = null;
        }
        
        neuesBrett[nach.row][nach.col] = neuesBrett[von.row][von.col];
        neuesBrett[von.row][von.col] = null;
        
        if (!ausgewaehlterStein.istKoenig) {
          if (meinSpieler === 'schwarz' && nach.row === 7) {
            neuesBrett[nach.row][nach.col] = { ...ausgewaehlterStein, istKoenig: true };
          } else if (meinSpieler === 'weiss' && nach.row === 0) {
            neuesBrett[nach.row][nach.col] = { ...ausgewaehlterStein, istKoenig: true };
          }
        }
        
        setBrett(neuesBrett);
        socketRef.current?.emit('zug', { von, nach });
        
        if (istFressen && hatWeitereFresszuege(nach, meinSpieler!, ausgewaehlterStein.istKoenig)) {
          setSelectedPos(nach);
        } else {
          setSelectedPos(null);
          setAktuellerSpieler(aktuellerSpieler === 'schwarz' ? 'weiss' : 'schwarz');
        }
      } else {
        alert('Ungültiger Zug!');
        setSelectedPos(null);
      }
    } else if (stein && stein.spieler === meinSpieler) {
      setSelectedPos({ row, col });
    }
  };

  const istDunklesFeld = (row: number, col: number) => (row + col) % 2 !== 0;

  if (!verbunden) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-900 to-amber-950 flex items-center justify-center">
        <div className="bg-black/30 backdrop-blur-md p-8 rounded-2xl shadow-2xl">
          <p className="text-white text-2xl animate-pulse">Verbinde zu Server...</p>
        </div>
      </div>
    );
  }

  if (spielBeendet && spielGewonnen) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-900 to-amber-950 flex flex-col items-center justify-center p-4">
        {/* Sound-Elemente (unsichtbar) */}
        <audio
          ref={winSoundRef}
          src="https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3"
          preload="auto"
        />
        <audio
          ref={loseSoundRef}
          src="https://www.soundjay.com/misc/sounds/fail-buzzer-01.mp3"
          preload="auto"
        />
        
        <div className="bg-black/40 backdrop-blur-md p-12 rounded-3xl shadow-2xl text-center border border-amber-500/30">
          <h1 className="text-6xl text-white mb-8 font-bold drop-shadow-lg">Habesha Dama 🇪🇹</h1>
          <div className={`text-8xl mb-6 ${spielGewonnen === meinSpieler ? 'animate-bounce' : 'animate-pulse'}`}>
            {spielGewonnen === meinSpieler ? '🏆' : '😢'}
          </div>
          <p className="text-5xl text-white mb-4 font-bold drop-shadow-lg">
            {spielGewonnen === meinSpieler ? 'DU HAST GEWONNEN!' : 'Du hast verloren...'}
          </p>
          <p className="text-2xl text-amber-300 mb-8">
            {spielGewonnen === meinSpieler 
              ? '🎉 Glückwunsch zum Sieg! 🎉' 
              : '👑 Beim nächsten Mal klappt es!'}
          </p>
          <button 
            onClick={() => {
              setSpielBeendet(false);
              setSpielGewonnen(null);
              setWarteAufGegner(true);
              setRaumModus(null);
              setRaumId(null);
              setBrett(prev => {
                const neuesBrett = Array(8).fill(null).map(() => Array(8).fill(null));
                for (let row = 0; row < 3; row++) {
                  for (let col = 0; col < 8; col++) {
                    if ((row + col) % 2 !== 0) {
                      neuesBrett[row][col] = { spieler: 'schwarz', istKoenig: false };
                    }
                  }
                }
                for (let row = 5; row < 8; row++) {
                  for (let col = 0; col < 8; col++) {
                    if ((row + col) % 2 !== 0) {
                      neuesBrett[row][col] = { spieler: 'weiss', istKoenig: false };
                    }
                  }
                }
                return neuesBrett;
              });
            }}
            className="bg-gradient-to-r from-green-600 to-green-500 text-white px-10 py-5 rounded-xl text-2xl font-bold hover:from-green-500 hover:to-green-400 transition-all transform hover:scale-105 shadow-xl"
          >
            ⚔️ Neues Spiel ⚔️
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-900 via-amber-800 to-amber-950 flex flex-col items-center justify-center p-4">
      {/* Sound-Elemente für den Spielbildschirm (auch hier für den Fall) */}
      <audio
        ref={winSoundRef}
        src="https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3"
        preload="auto"
      />
      <audio
        ref={loseSoundRef}
        src="https://www.soundjay.com/misc/sounds/fail-buzzer-01.mp3"
        preload="auto"
      />
      
      {/* Hintergrund Muster */}
      <div className="fixed inset-0 opacity-5 pointer-events-none">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 1px)',
          backgroundSize: '40px 40px'
        }} />
      </div>
      
      {/* Header mit Glas-Effekt */}
      <div className="relative z-10 bg-black/20 backdrop-blur-sm px-8 py-4 rounded-2xl mb-6 border border-amber-500/30 shadow-2xl">
        <h1 className="text-6xl text-white font-bold drop-shadow-lg tracking-wider">
          Habesha Dama 🇪🇹
        </h1>
      </div>
      
      {warteAufGegner ? (
        <div className="bg-black/40 backdrop-blur-md p-8 rounded-3xl shadow-2xl w-full max-w-md border border-amber-500/30">
          <h2 className="text-3xl text-white text-center mb-6 font-bold">Willkommen zurück!</h2>
          
          {!raumModus && (
            <div className="space-y-4">
              <button 
                onClick={spielSuchen}
                className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white px-6 py-5 rounded-xl text-xl font-bold hover:from-green-500 hover:to-green-400 transition-all transform hover:scale-105 shadow-xl flex items-center justify-center gap-3"
              >
                <span className="text-2xl">🔍</span> Gegner suchen
              </button>
              
              <button 
                onClick={raumErstellen}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white px-6 py-5 rounded-xl text-xl font-bold hover:from-blue-500 hover:to-blue-400 transition-all transform hover:scale-105 shadow-xl flex items-center justify-center gap-3"
              >
                <span className="text-2xl">🏠</span> Raum erstellen
              </button>
            </div>
          )}
          
          {raumModus === 'matchmaking' && (
            <div className="bg-amber-800/50 p-6 rounded-xl text-center">
              <p className="text-white text-xl">Suche Gegner...</p>
              <div className="mt-6">
                <div className="animate-spin text-5xl">⏳</div>
              </div>
              <button 
                onClick={() => {
                  setRaumModus(null);
                  setWarteAufGegner(true);
                }}
                className="mt-6 bg-amber-700/50 text-white px-4 py-2 rounded-lg hover:bg-amber-700 transition-colors"
              >
                Zurück
              </button>
            </div>
          )}
          
          {raumModus === 'raum' && raumId && (
            <div className="bg-amber-800/50 p-6 rounded-xl">
              <p className="text-white text-xl mb-4">Dein Raum-Code:</p>
              <div className="bg-amber-900 p-6 rounded-xl mb-6">
                <p className="text-6xl font-mono text-center text-white tracking-widest">{raumId}</p>
              </div>
              <p className="text-amber-300 mb-3">Teile diesen Link:</p>
              <div className="bg-amber-900/80 p-4 rounded-xl mb-4 text-amber-200 text-sm break-all font-mono border border-amber-500/30">
                http://localhost:5173/raum/{raumId}
              </div>
              <button 
                onClick={copyLink}
                className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white px-6 py-4 rounded-xl text-lg font-bold hover:from-green-500 hover:to-green-400 transition-all mb-4 flex items-center justify-center gap-2"
              >
                <span className="text-xl">📋</span> Link kopieren
              </button>
              <div className="flex items-center justify-center gap-2 text-amber-300">
                <span className="animate-pulse">⏳</span>
                <span>Warte auf Gegner...</span>
              </div>
            </div>
          )}
          
          {fehler && (
            <div className="bg-red-600/90 backdrop-blur-sm text-white p-4 rounded-xl mt-4 border border-red-400 animate-shake">
              ❌ {fehler}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Spieler-Info mit Glas-Effekt */}
          <div className="bg-black/30 backdrop-blur-sm p-4 rounded-xl mb-4 w-full max-w-2xl border border-amber-500/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full ${meinSpieler === 'schwarz' ? 'bg-gradient-to-br from-gray-800 to-black' : 'bg-gradient-to-br from-gray-100 to-white'} border-2 border-amber-500 shadow-xl`} />
                <div>
                  <p className="text-amber-300 text-sm">Du bist</p>
                  <p className={`text-2xl font-bold ${meinSpieler === 'schwarz' ? 'text-white' : 'text-gray-200'}`}>
                    {meinSpieler === 'schwarz' ? '⚫ SCHWARZ' : '⚪ WEISS'}
                  </p>
                </div>
              </div>
              
              <div className="text-right">
                <p className="text-amber-300 text-sm">Aktueller Spieler</p>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${aktuellerSpieler === 'schwarz' ? 'bg-black' : 'bg-white'} border border-amber-500 animate-pulse`} />
                  <span className={`text-2xl font-bold ${aktuellerSpieler === 'schwarz' ? 'text-white' : 'text-gray-200'}`}>
                    {aktuellerSpieler === 'schwarz' ? '⚫ SCHWARZ' : '⚪ WEISS'}
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          {/* Timer und Zug-Anzeige */}
          <div className="flex items-center justify-between w-full max-w-2xl mb-4">
            <div className={`text-xl font-bold px-6 py-3 rounded-xl backdrop-blur-sm border ${
              meinSpieler === aktuellerSpieler 
                ? 'bg-green-600/30 border-green-400 text-green-300' 
                : 'bg-amber-600/30 border-amber-400 text-amber-300'
            }`}>
              {meinSpieler === aktuellerSpieler ? '👆 Dein Zug' : '⏳ Gegner zieht'}
            </div>
            
            {timerAktiv && (
              <div className={`text-4xl font-bold px-6 py-3 rounded-xl backdrop-blur-sm border ${
                timer <= 10 
                  ? 'bg-red-600/30 border-red-400 text-red-300 animate-pulse' 
                  : 'bg-yellow-600/30 border-yellow-400 text-yellow-300'
              }`}>
                ⏳ {timer}s
              </div>
            )}
          </div>
          
          {/* Brett mit 3D-Effekt */}
          <div className="relative">
            {/* Schatten */}
            <div className="absolute -inset-4 bg-gradient-to-r from-amber-700/50 to-amber-900/50 rounded-3xl blur-2xl" />
            
            {/* Brett */}
            <div className="relative bg-gradient-to-br from-amber-800 to-amber-950 p-6 rounded-3xl shadow-2xl border border-amber-500/30">
              <div className="grid grid-cols-8 gap-0" style={{ width: '640px', height: '640px' }}>
                {brett.map((reihe, rowIndex) => 
                  reihe.map((stein, colIndex) => {
                    const istDunkel = istDunklesFeld(rowIndex, colIndex);
                    const istSelektiert = selectedPos?.row === rowIndex && selectedPos?.col === colIndex;
                    
                    let bgColor = istDunkel 
                      ? 'bg-gradient-to-br from-amber-950 to-amber-900' 
                      : 'bg-gradient-to-br from-amber-100 to-amber-50';
                    
                    if (istSelektiert) {
                      bgColor = 'bg-gradient-to-br from-blue-600 to-blue-500';
                    }
                    
                    return (
                      <div
                        key={`${rowIndex}-${colIndex}`}
                        className={`
                          ${bgColor}
                          flex items-center justify-center
                          cursor-pointer transition-all duration-200
                          hover:brightness-110 hover:scale-[1.02] hover:z-10
                          border border-amber-950/50
                          ${meinSpieler !== aktuellerSpieler ? 'opacity-90' : ''}
                          ${spielBeendet ? 'opacity-50 pointer-events-none' : ''}
                          relative
                        `}
                        style={{ width: '80px', height: '80px' }}
                        onClick={() => handleFeldKlick(rowIndex, colIndex)}
                      >
                        {stein && (
                          <div className={`
                            w-14 h-14 rounded-full 
                            ${stein.spieler === 'schwarz' 
                              ? 'bg-gradient-to-br from-gray-800 to-black border-2 border-gray-600' 
                              : 'bg-gradient-to-br from-gray-100 to-white border-2 border-gray-400'
                            }
                            shadow-2xl
                            ${stein.istKoenig ? 'ring-4 ring-yellow-400 ring-offset-2 ring-offset-amber-800' : ''}
                            flex items-center justify-center
                            transition-all duration-200
                            hover:scale-105
                          `}>
                            {stein.istKoenig && (
                              <span className="text-yellow-400 text-3xl drop-shadow-2xl animate-pulse">👑</span>
                            )}
                          </div>
                        )}
                        
                        {/* Kleiner Glanz-Effekt */}
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none" />
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
          
          {/* Footer */}
          <div className="mt-6 text-amber-300/70 text-sm">
            Habesha Dama - Das traditionelle Spiel, jetzt online 🇪🇹
          </div>
        </>
      )}
    </div>
  );
}

export default App;