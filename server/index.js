const express = require('express')
const app = express()
const path = require('path')
const http = require('http')
const server = http.createServer(app)

const PORT = process.env.PORT || 8080

/** serve static content (aka build and public assets folder) */
app.use('/public', express.static(path.join(__dirname, '../public')))
app.use('/build', express.static(path.join(__dirname, '../build')))

/** serve the html */
app.get('/', (_, res) => {
    res.status(200).sendFile(path.join(__dirname, '../client/index.html'))
})

/// persistent player data ///

class Player {
    constructor(name, role = null) {
        this.name = name
        this.role = role
    }
}

class Inputs {
    constructor() {
        this.keys = {
            left: false,
            right: false,
            up: false,
            down: false,
            action: false,
        }
    }
}

class Position {
    constructor(x, y) {
        this.x = x
        this.y = y
    }
}

const players = {}
const playersInputs = {}
const playersPositions = {}

function playerExists(socketId) {
    return (
        socketId in players &&
        socketId in playersInputs &&
        socketId in playersPositions
    )
}

//////////////////////////////

function serverMessage(message, type = "") {
    let color = ""
    switch (type) {
        case "error":
            color = "\u001b[1;31m"
            break

        case "success":
            color = "\u001b[1;32m"
            break

        case "warn":
            color = "\u001b[1;33m"
            break

        default:
            break
    }
    console.log(color + `[*:${PORT}] ${message}`)
}

/// socket.io ///

const { Server } = require("socket.io")
const io = new Server(server)

io.on('connection', (socket) => {
    serverMessage(`user "${socket.id}" has conncted`)

    /** new user joins the lobby, added to server players */
    socket.on('join', (data) => {
        const { name, x, y } = data

        players[socket.id] = new Player(name)
        playersInputs[socket.id] = new Inputs()
        playersPositions[socket.id] = new Position(x, y)

        serverMessage(`player "${name}" has joined the lobby`, "success")

        // send updated lobby to all connected users
        io.sockets.emit('updateLobby', players)
    })

    /** user leaves lobby, deleted from server players */
    socket.on('disconnect', () => {
        if (playerExists(socket.id)) {
            delete players[socket.id]
            delete playersInputs[socket.id]
            delete playersPositions[socket.id]

            serverMessage(`player "${socket.id}" has disconnected`, "warn")

            // send updated lobby to all connected users
            io.sockets.emit('updateLobby', players)
        } else {
            serverMessage(`user "${socket.id}" disconnected without entering the lobby`, "error")
        }
    })

    socket.on('input', (input) => {
        if (!playerExists(socket.id)) return

        playersInputs[socket.id].keys = input
        socket.broadcast.emit('updateInputs', playersInputs)
    })
})

/////////////////

/// server side game logic ///

setInterval(stepPhysics, 1000 / 60)
function stepPhysics() {
    for (let id in players) {
        if (playerExists(id)) {
            const input = playersInputs[id]
            const position = playersPositions[id]

            const dir = { x: 0, y: 0 }
            dir.x = (-input.keys.left + +input.keys.right)
            dir.y = (-input.keys.up + +input.keys.down)

            if (+dir.x && +dir.y) {
                const dirLength = Math.sqrt(dir.x * dir.x + dir.y * dir.y)
                dir.x /= dirLength
                dir.y /= dirLength
            }

            position.x += dir.x * 512 * (1000 / 60) * .001 
            position.y += dir.y * 512 * (1000 / 60) * .001 
        }
    }
    io.emit("updatePositions", playersPositions)
}

//////////////////////////////

/** open server to listen on port */
server.listen(PORT, () => {
    serverMessage("listening", "success")
})
