const https = require('https');
const app = require('./app');
const http = require('http')
// NE PAS OUBLIER DE RENEW LES CERTS SINON PASSER SUR HTTP MODIFIER AUSSI LE config.json dans React qui sert de .env

const fs = require('fs');


const normalizePort = val => {
    const port = parseInt(val, 10);

    if (isNaN(port)) {
        return val;
    }
    if (port >= 0) {
        return port;
    }
    return false;
};
const port = normalizePort(process.env.PORT || '3001');
const sslPort = normalizePort(process.env.SSL_PORT || '3002');
app.set('port', port);
app.set('sslPort', sslPort);


const errorHandler = error => {
    if (error.syscall !== 'listen') {
        throw error;
    }
    const address = server.address();
    const bind = typeof address === 'string' ? 'pipe ' + address : 'port: ' + port;
    switch (error.code) {
        case 'EACCES':
            console.error(bind + ' requires elevated privileges.');
            process.exit(1);
            break;
        case 'EADDRINUSE':
            console.error(bind + ' is already in use.');
            process.exit(1);
            break;
        default:
            throw error;
    }
};

const server = http.createServer(app);
const sslServer = https.createServer({key: fs.readFileSync('./privkey.pem'),    cert: fs.readFileSync('./cert.pem')},app);


// SOCKET
var io = require('socket.io')(server);
let userCount = 0
const presence = new Map()

const broadcastPresence = () => {
    io.emit('presence', Array.from(presence, ([id, name]) => ({ id, name })))
}

const readChannel = (payload) => {
    const raw = typeof payload === 'string'
        ? payload
        : (payload && typeof payload === 'object' ? payload.channel : '')
    if (typeof raw !== 'string') return ''
    const name = raw.trim().toLowerCase().replace(/^#/, '')
    return /^[a-z0-9][a-z0-9-]{0,23}$/.test(name) ? name : ''
}


io.on("connection", (socket) => {
    console.log("Client connected");
    userCount++
    presence.set(socket.id, 'Anonymous')
    io.emit("count", userCount)
    broadcastPresence()
    socket.on("disconnect", () => {
        console.log("Client disconnected");
        userCount--
        presence.delete(socket.id)
        io.emit("count", userCount)
        broadcastPresence()

    });
    socket.on('join', (name) => {
        const clean = typeof name === 'string' ? name.trim().slice(0, 12) : ''
        presence.set(socket.id, clean || 'Anonymous')
        broadcastPresence()
    });
    socket.on('npmStop', () => {
        process.exit(0);
    });

    socket.on('newMsg', (payload) => {
        const channel = readChannel(payload)
        io.emit('newMsg', channel ? { channel } : {})
    })

    socket.on('channelsChanged', () => {
        io.emit('channelsChanged')
    })

    socket.on('channelDeleted', (payload) => {
        const channel = readChannel(payload)
        io.emit('channelDeleted', channel ? { channel } : {})
    })

    socket.on('typing', (payload) => {
        const name = typeof payload === 'string'
            ? payload
            : (payload && typeof payload.name === 'string' ? payload.name : '')
        const clean = name.slice(0, 12)
        const channel = readChannel(payload)
        socket.broadcast.emit('typing', channel ? { name: clean, channel } : { name: clean })
    })

    socket.on('stopTyping', (payload) => {
        const channel = readChannel(payload)
        socket.broadcast.emit('stopTyping', channel ? { channel } : {})
    })

    socket.on('resetTchat', (payload) => {
        const channel = readChannel(payload)
        io.emit('reset', channel ? { channel } : {})
    })

    socket.on('count', (count) => {
        io.emit('refreshCount', count)
    })

})

// SERVER

server.on('error', errorHandler);
server.on('listening', () => {
    const address = server.address();
    const bind = typeof address === 'string' ? 'pipe ' + address : 'port ' + port;
    console.log('Listening on ' + bind);
});

server.listen(port);

sslServer.on('error', errorHandler);
sslServer.on('listening', () => {
    const address = sslServer.address();
    const bind = typeof address === 'string' ? 'pipe ' + address : 'port ' + sslPort;
    console.log('Listening on ' + bind);
});

sslServer.listen(sslPort);