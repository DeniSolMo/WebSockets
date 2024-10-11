// index.js

import express from 'express';
import logger from 'morgan';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { Server } from 'socket.io';
import { createServer } from 'node:http';
import DBConnector from './dbconnector.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

(async () => {
    try {
        // Crear la tabla si no existe
        await DBConnector.query('CREATE TABLE IF NOT EXISTS messages (id INT AUTO_INCREMENT PRIMARY KEY, content TEXT, user TEXT)');
    } catch (e) {
        console.error('Error creating table:', e);
    }

    const port = process.env.PORT ?? 3000;

    const app = express();
    const server = createServer(app);
    const io = new Server(server, { connectionStateRecovery: {} });

    io.on('connection', (socket) => {
        console.log('A user connected!');

        socket.on('disconnect', () => {
            console.log('A user has disconnected');
        });

        socket.on('chat message', async (msg) => {
            const user = socket.handshake.auth.username ?? 'Anonimo';

            try {
                // Inserta el mensaje en la base de datos
                await DBConnector.query('INSERT INTO messages (content, user) VALUES (?, ?)', [msg, user]);
                console.log(`Message: ${msg} from: ${user}`);

                // Selecciona el último mensaje insertado
                const [latestMessage] = await DBConnector.query('SELECT * FROM messages ORDER BY id DESC LIMIT 1');

                // Emite el mensaje a todos los clientes
                io.emit('chat message', msg, latestMessage.id, user);
            } catch (e) {
                console.error('Error handling chat message:', e);
            }
        });

        if (!socket.recovered) {
            (async () => {
                try {
                    const serverOffset = socket.handshake.auth.serverOffset ?? 0;
                    const results = await DBConnector.query('SELECT id, content, user FROM messages WHERE id > ?', [serverOffset]);
                    results.forEach(result => {
                        socket.emit('chat message', result.content, result.id, result.user);
                    });
                } catch (e) {
                    console.error('Error sending previous messages:', e);
                }
            })();
        }
    });

    app.use(logger('dev'));

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, 'client', 'index.html'));
    });

    // Cambiar 'localhost' a '0.0.0.0' para escuchar en todas las interfaces de red
    server.listen(port, '0.0.0.0', () => {
        console.log(`Server is running on port ${port}`);
    });
})();