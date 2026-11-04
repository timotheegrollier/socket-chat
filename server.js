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


io.on("connection", (socket) => {
    console.log("Client connected");
    userCount++
    io.emit("count", userCount)
    socket.on("disconnect", () => {
        console.log("Client disconnected");
        userCount--
        io.emit("count", userCount)

    });
    socket.on('npmStop', () => {
        process.exit(0);
    });

    socket.on('newMsg', () => {
        io.emit('newMsg')
    })

    socket.on('typing', (name) => {
        const clean = typeof name === 'string' ? name.slice(0, 12) : ''
        socket.broadcast.emit('typing', { name: clean })
    })

    socket.on('stopTyping', () => {
        socket.broadcast.emit('stopTyping')
    })

    socket.on('resetTchat', () => {
        io.emit('reset')
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