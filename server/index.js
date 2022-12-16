const express = require('express')
const app = express()
const fs = require('fs')
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

const SEEK_SPEED = 480
const HIDE_SPEED = 512  

const PLAYER_COLLIDER_SIZE = 64
const PLAYER_COLLIDER_OFFSET = 16

class Player {
    constructor(name, role = null) {
        this.name = name
        this.role = role
    }
}

class Position {
    constructor(x, y) {
        this.x = x
        this.y = y
    }
}

const LEFT    = 1
const RIGHT   = 2
const UP      = 4
const DOWN    = 8

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

/// level data ///////////////

const TILE_SIZE = 160

class Level {
    constructor(title, width, height, startX, startY, blocks) {
        this.title = title

        this.width = width
        this.height = height

        this.startX = startX
        this.startY = startY

        this.blocks = blocks.map((b) => !!b)
    }

    check(x, y) {
        const rows = ~~(this.width / TILE_SIZE)
        return this.blocks[x + y * rows]
    }
}

let level = null

function loadLevel(name) {
    const data = fs.readFileSync(path.join(__dirname, '../public/maps/' + name))
    const { title, width, height, startX, startY, blocks } = JSON.parse(data)

    level = new Level(title, width, height, startX, startY, blocks)
    serverMessage(`loaded level "${name}"`, "success")
}

loadLevel("lvl0.json")

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
            color = "\x1b[0m"
            break
    }
    console.log(color + `[*:${PORT}] ${message}`)
}

/// socket.io ////////////////

const { Server } = require("socket.io")
const io = new Server(server)

io.on('connection', (socket) => {
    serverMessage(`user "${socket.id}" has connected`)

    /** new user joins the lobby, added to server players */
    socket.on('join', (data) => {
        const { name, x, y } = data

        players[socket.id] = new Player(name)
        playersInputs[socket.id] = 0
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

        playersInputs[socket.id] = input
        socket.broadcast.emit('updateInputs', playersInputs)
    })
})

//////////////////////////////

/// server side game logic ///

const TIMESTEP = 1000 / 60

setInterval(stepPhysics, TIMESTEP)
function stepPhysics() {
    for (let id in players) {
        if (playerExists(id)) {
            const input = playersInputs[id]
            const position = playersPositions[id]

            const dir = { x: 0, y: 0 }
            dir.x = (-(!!(input & LEFT)) + +(!!(input & RIGHT)))
            dir.y = (-(!!(input & UP)) + +(!!(input & DOWN)))

            if (+dir.x && +dir.y) {
                const dirLength = Math.sqrt(dir.x * dir.x + dir.y * dir.y)
                dir.x /= dirLength
                dir.y /= dirLength
            }

            const dX = dir.x * HIDE_SPEED * TIMESTEP * .001
            const dY = dir.y * HIDE_SPEED * TIMESTEP * .001

            // if a valid level was loaded
            if (level) {
                // horizontal collision resolution
                if (Math.abs(dX) > 0)
                {
                    const collider = {
                        x: position.x + PLAYER_COLLIDER_OFFSET + dX,
                        y: position.y + PLAYER_COLLIDER_SIZE,
                        w: PLAYER_COLLIDER_SIZE,
                        h: PLAYER_COLLIDER_SIZE
                    }

                    const topLeft  = { x: ~~( collider.x                / TILE_SIZE), y: ~~( collider.y                / TILE_SIZE) }
                    const topRight = { x: ~~((collider.x + collider.w)  / TILE_SIZE), y: ~~( collider.y                / TILE_SIZE) }
                    const botLeft  = { x: ~~( collider.x                / TILE_SIZE), y: ~~((collider.y + collider.h) / TILE_SIZE) }
                    const botRight = { x: ~~((collider.x + collider.w)  / TILE_SIZE), y: ~~((collider.y + collider.h) / TILE_SIZE) }

                    const colliding = (
                        level.check(topLeft.x, topLeft.y) ||
                        level.check(topRight.x, topRight.y) || 
                        level.check(botLeft.x, botLeft.y) || 
                        level.check(botRight.x, botRight.y)
                    )

                    if (colliding) {
                        if (Math.sign(dX) === 1) position.x = topLeft.x * TILE_SIZE + collider.w + PLAYER_COLLIDER_OFFSET - 1
                        else position.x = topRight.x * TILE_SIZE - PLAYER_COLLIDER_OFFSET
                    } else position.x += dX
                }
                
                // vertical collision resolution
                if (Math.abs(dY) > 0)
                {
                    const collider = {
                        x: position.x + PLAYER_COLLIDER_OFFSET,
                        y: position.y + PLAYER_COLLIDER_SIZE + dY,
                        w: PLAYER_COLLIDER_SIZE,
                        h: PLAYER_COLLIDER_SIZE
                    }

                    const topLeft  = { x: ~~( collider.x                / TILE_SIZE), y: ~~( collider.y                / TILE_SIZE) }
                    const topRight = { x: ~~((collider.x + collider.w)  / TILE_SIZE), y: ~~( collider.y                / TILE_SIZE) }
                    const botLeft  = { x: ~~( collider.x                / TILE_SIZE), y: ~~((collider.y + collider.h) / TILE_SIZE) }
                    const botRight = { x: ~~((collider.x + collider.w)  / TILE_SIZE), y: ~~((collider.y + collider.h) / TILE_SIZE) }

                    const colliding = (
                        level.check(topLeft.x, topLeft.y) ||
                        level.check(topRight.x, topRight.y) || 
                        level.check(botLeft.x, botLeft.y) || 
                        level.check(botRight.x, botRight.y)
                    )

                    if (colliding) {
                        if (Math.sign(dY) === 1) position.y = topLeft.y * TILE_SIZE + PLAYER_COLLIDER_SIZE / 2 - 1
                        else position.y = botLeft.y * TILE_SIZE - PLAYER_COLLIDER_SIZE
                    } else position.y += dY
                }
            } else {
                position.x += dX
                position.y += dY
            }
        }
    }
    io.emit("updatePositions", playersPositions)
}

//////////////////////////////

/** open server to listen on port */
server.listen(PORT, () => {
    serverMessage("listening", "success")
})
