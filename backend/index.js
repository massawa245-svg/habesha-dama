const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:5174"],
    methods: ["GET", "POST"]
  }
});

// Wartende Spieler für Matchmaking
let wartendeSpieler = null;

// Räume für Freunde
const aktiveRaeume = {};

io.on('connection', (socket) => {
  console.log('✅ Spieler verbunden:', socket.id);

  // --- MATCHMAKING (Gegner suchen) ---
  socket.on('spielSuchen', () => {
    console.log('Spieler sucht Gegner:', socket.id);
    
    if (wartendeSpieler && wartendeSpieler !== socket.id) {
      const spieler1 = wartendeSpieler;
      const spieler2 = socket.id;
      
      console.log(`✅ Gegner gefunden: ${spieler1} vs ${spieler2}`);
      
      io.to(spieler1).emit('spielerZugewiesen', 'schwarz');
      io.to(spieler2).emit('spielerZugewiesen', 'weiss');
      
      io.to(spieler1).emit('spielGestartet');
      io.to(spieler2).emit('spielGestartet');
      
      wartendeSpieler = null;
    } 
    else if (wartendeSpieler === socket.id) {
      console.log('⚠️ Gleicher Spieler klickt erneut, ignoriere');
    }
    else {
      wartendeSpieler = socket.id;
      console.log('⏳ Spieler wartet:', socket.id);
    }
  });

  // --- RAUM ERSTELLEN (für Freunde) ---
  socket.on('raumErstellen', () => {
    const raumId = Math.random().toString(36).substring(2, 8).toUpperCase();
    aktiveRaeume[raumId] = {
      ersteller: socket.id,
      spieler: [socket.id]
    };
    
    socket.join(`raum-${raumId}`);
    socket.emit('raumErstellt', raumId);
    console.log(`🏠 Raum erstellt: ${raumId} von ${socket.id}`);
  });

  // --- RAUM BEITRETEN ---
  socket.on('raumBetreten', (raumId) => {
    console.log(`🚪 Spieler ${socket.id} betritt Raum ${raumId}`);
    
    const raum = aktiveRaeume[raumId];
    
    if (!raum) {
      socket.emit('fehler', 'Raum existiert nicht');
      return;
    }
    
    if (raum.spieler.length >= 2) {
      socket.emit('fehler', 'Raum ist bereits voll');
      return;
    }
    
    // Spieler zum Raum hinzufügen
    raum.spieler.push(socket.id);
    socket.join(`raum-${raumId}`);
    
    // Spiel starten!
    const spieler1 = raum.spieler[0];
    const spieler2 = raum.spieler[1];
    
    io.to(spieler1).emit('spielerZugewiesen', 'schwarz');
    io.to(spieler2).emit('spielerZugewiesen', 'weiss');
    
    io.to(spieler1).emit('spielGestartet');
    io.to(spieler2).emit('spielGestartet');
    
    console.log(`🎮 Spiel gestartet in Raum ${raumId}: ${spieler1} (schwarz) vs ${spieler2} (weiss)`);
    
    // Raum löschen
    delete aktiveRaeume[raumId];
  });

  // --- ZUG ---
  socket.on('zug', (zug) => {
    console.log('🎯 Zug erhalten:', zug);
    socket.broadcast.emit('gegnerZug', zug);
  });

  socket.on('disconnect', () => {
    console.log('❌ Spieler getrennt:', socket.id);
    if (wartendeSpieler === socket.id) {
      wartendeSpieler = null;
    }
    
    // Aus Räumen entfernen
    for (const raumId in aktiveRaeume) {
      if (aktiveRaeume[raumId].spieler.includes(socket.id)) {
        delete aktiveRaeume[raumId];
        console.log(`🚫 Raum ${raumId} gelöscht (Spieler getrennt)`);
      }
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server läuft auf http://localhost:${PORT}`);
});