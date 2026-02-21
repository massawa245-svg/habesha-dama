import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:5173',
      'https://massawa245-svg.github.io',
      'https://habesha-dama.onrender.com'
    ],
    methods: ['GET', 'POST']
  }
});

let wartendeSpieler = null;
const aktiveRaeume = {};

io.on('connection', (socket) => {
  console.log('✅ Spieler verbunden:', socket.id);

  socket.on('spielSuchen', () => {
    console.log('Spieler sucht Gegner:', socket.id);
    
    if (wartendeSpieler && wartendeSpieler !== socket.id) {
      const spieler1 = wartendeSpieler;
      const spieler2 = socket.id;
      
      io.to(spieler1).emit('spielerZugewiesen', 'schwarz');
      io.to(spieler2).emit('spielerZugewiesen', 'weiss');
      
      io.to(spieler1).emit('spielGestartet');
      io.to(spieler2).emit('spielGestartet');
      
      wartendeSpieler = null;
    } 
    else if (wartendeSpieler === socket.id) {
      console.log('⚠️ Gleicher Spieler klickt erneut');
    }
    else {
      wartendeSpieler = socket.id;
      console.log('⏳ Spieler wartet:', socket.id);
    }
  });

  socket.on('raumErstellen', () => {
    const raumId = Math.random().toString(36).substring(2, 8).toUpperCase();
    aktiveRaeume[raumId] = {
      ersteller: socket.id,
      spieler: [socket.id]
    };
    socket.join(`raum-${raumId}`);
    socket.emit('raumErstellt', raumId);
  });

  socket.on('raumBetreten', (raumId) => {
    const raum = aktiveRaeume[raumId];
    if (!raum || raum.spieler.length >= 2) {
      socket.emit('fehler', 'Raum nicht verfügbar');
      return;
    }
    
    raum.spieler.push(socket.id);
    socket.join(`raum-${raumId}`);
    
    const [spieler1, spieler2] = raum.spieler;
    io.to(spieler1).emit('spielerZugewiesen', 'schwarz');
    io.to(spieler2).emit('spielerZugewiesen', 'weiss');
    io.to(spieler1).emit('spielGestartet');
    io.to(spieler2).emit('spielGestartet');
    
    delete aktiveRaeume[raumId];
  });

  socket.on('zug', (zug) => {
    socket.broadcast.emit('gegnerZug', zug);
  });

  socket.on('disconnect', () => {
    console.log('❌ Spieler getrennt:', socket.id);
    if (wartendeSpieler === socket.id) {
      wartendeSpieler = null;
    }
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`🚀 Server läuft auf Port ${PORT}`);
});