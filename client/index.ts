const io = require("socket.io-client")

/// CONSTANTS ///
const GAME_WIDTH = 1280
const GAME_HEIGHT = 720

const TILE_SIZE = 160

const ANIM_FRAMERATE = 0.041

const INTERACT_DISTANCE = 256
const PLAYER_SPEED = 512  

const PLAYER_WIDTH = 96
const PLAYER_HEIGHT = 128
const PLAYER_COLLIDER_SIZE = 64
const PLAYER_COLLIDER_OFFSET = 16

const MAX_DISTANCE_RECONCILIATION = 128
/////////////////

/// utility functions ///

/** linear interpolate (ease) towards position */
const lerp = (a: number, b: number, alpha: number) => a + alpha * (b - a)

/** 2d vector distance method */
const dist = (a: { x: number, y: number }, b: { x: number, y: number }) => {
    const v0 = a.x - b.x
    const v1 = a.y - b.y
    return Math.sqrt((v0 * v0) + (v1 * v1))
}

/////////////////////////

class SocketManager {
    private static _instance: SocketManager
    public static get instance() {
        return this._instance || (this._instance = new this())
    }

    public socket//: Socket<ServerToClientEvents, ClientToServerEvents>

    public get socketId() {
        return this.socket.id
    }

    public init(name: string) {
        this.socket = io()

        // connect to lobby
        this.socket.on('connect', () => {
            // add self to entity manager and
            // emit 'join' socket event
            this.socket.emit('join', { name })
        })

        this.socket.on('returnPlayer', (player) => {
            const { name, role, socketId, alive } = player
            EntityManager.instance.addEntity(
                socketId,
                new Player(name, role, socketId, true, alive)
            )

            // if the returned player has a spectator role,
            // we can assume the game has already started
            if (role === Role.SPEC) {
                GameManager.instance.state = GameState.PLAYING

                const level = new Level("maps/game.json")
                EntityManager.instance.setLevel(level)
            }
        })

        // get latest players in lobby
        this.socket.on('updateLobby', (players) => {
            const updatedPlayers: { [socketId: string]: boolean } = {}

            for (let id in players) {
                const { name, role, alive } = players[id]

                // add new players to entity manager
                if (!(id in EntityManager.instance.entities) && id !== this.socketId) {
                    EntityManager.instance.addEntity(
                        id,
                        new Player(name, role, id, false, alive)
                    )
                } else if (id in EntityManager.instance.entities) {
                    EntityManager.instance.entities[id].username = name
                    EntityManager.instance.entities[id].role = role

                    if (EntityManager.instance.entities[id].alive && !alive)
                        EntityManager.instance.entities[id].kill()
                    
                    EntityManager.instance.entities[id].alive = alive
                }

                updatedPlayers[id] = true
            }

            // remove disconnected players
            for (let id in EntityManager.instance.entities) {
                if (!(id in updatedPlayers))
                    EntityManager.instance.removeEntity(id)
            }
        })

        // get player inputs from server to
        // simulate smooth client side movement
        this.socket.on('updateInputs', (inputs) => {
            for (let id in inputs) {
                if (id in EntityManager.instance.entities) {
                    EntityManager.instance.entities[id].keys = inputs[id]
                }
            }
        })

        // get position calculated from server to
        // keep players synced and server authoritative
        this.socket.on('updatePositions', (positions) => {
            for (let id in positions) {
                if (id in EntityManager.instance.entities) {
                    const player = EntityManager.instance.entities[id]
                    const { x: oldX, y: oldY } = player
                    const { x: newX, y: newY } = positions[id]

                    // if distance between client side pos and
                    // server side calculated pos is larger than
                    // acceptable threshold, just jump
                    const distance = dist({ x: newX, y: newY }, { x: oldX, y: oldY })
                    if (distance > MAX_DISTANCE_RECONCILIATION) {
                        player.x = newX
                        player.y = newY
                    } else {
                        // lerp towards the correct position (so we don't stutter/jump)
                        player.x = lerp(oldX, newX, 0.2)
                        player.y = lerp(oldY, newY, 0.2)
                    }
                }
            }
        })

        this.socket.on('starting', () => {
            GameManager.instance.state = GameState.LOADING
        })

        this.socket.on('gameStarted', () => {
            setTimeout(() => GameManager.instance.state = GameState.PLAYING, 1000)

            const level = new Level("maps/game.json")
            EntityManager.instance.setLevel(level)
        })

        this.socket.on('gameEnded', (data) => {
            const { won } = data

            EntityManager.instance.setLevel(null)

            GameManager.instance.state = GameState.RESULTS
            GameManager.instance.winner = won ? "hide" : "seek"
        })

        this.socket.on('gameRestart', () => {
            const level = new Level("maps/lobby.json")
            EntityManager.instance.setLevel(level)

            GameManager.instance.state = GameState.LOADING
            setTimeout(() => GameManager.instance.state = GameState.PREGAME, 1000)
        })
    }
}

/**
 * gore game loop to call update and draw methods
 * on a fixed 60fps timstep
 */
abstract class Game {
    protected gfx: Renderer

    private static readonly TIMESTEP = 1000 / 60
    private previousTime = 0
    private accumulatedTime = 0

    constructor(ctx: CanvasRenderingContext2D) {
        this.gfx = new Renderer(ctx)
    }

    
    /** call to begin the game loop */
    public run(currentTime: number = performance.now()) {
        this.accumulatedTime += (currentTime - this.previousTime)
        this.previousTime = currentTime
        
        while (this.accumulatedTime >= Game.TIMESTEP) {
            this.update(Game.TIMESTEP * .001)
            this.accumulatedTime -= Game.TIMESTEP
        }
        
        this.draw(this.gfx)
        requestAnimationFrame(this.run.bind(this, performance.now()))
    }
    
    /** initialize game */
    public abstract start()

    /**
     * updates game logic once per frame
     * @param dt delta time
     */
     protected abstract update(dt: number)
    /**
     * renders current game state
     * @param gfx canvas rendering context
     */
     protected abstract draw(gfx: Renderer)
}

class Renderer {
    public ctx: CanvasRenderingContext2D
  
    constructor(ctx: CanvasRenderingContext2D) {
        this.ctx = ctx
    }
  
    public clearScreen() {
        this.ctx.clearRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    }
  
    public rectangle(x: number, y: number, w: number, h: number, color = "red") {
        this.ctx.save()
  
        this.ctx.beginPath()
        this.ctx.rect(x, y, w, h)
        this.ctx.fillStyle = color
        this.ctx.fill()
  
        this.ctx.restore()
    }
  
    public emptyRectangle(x: number, y: number, w: number, h: number, lineWidth = 2, color = "red") {
        this.ctx.save()
        
        this.ctx.strokeStyle = color
        this.ctx.lineWidth = lineWidth
        
        this.ctx.beginPath()
        this.ctx.strokeRect(x, y, w, h)
        this.ctx.stroke()
        
        this.ctx.restore()
    }
  
    public line(x0: number, x1: number, y0: number, y1: number, lineWidth = 4, color = "red") {
        this.ctx.save()
        
        this.ctx.strokeStyle = color
        this.ctx.lineWidth = lineWidth
        
        this.ctx.beginPath()
        this.ctx.moveTo(x0, y0)
        this.ctx.lineTo(x1, y1)
        this.ctx.stroke()
        
        this.ctx.restore()
    }
  
    public text(
        text: string,
        x: number,
        y: number,
        color = "white",
        align = "center",
        size = 16,
        font: Font | null = null
    ) {        
        if (font != null)
          this.ctx.font = font.name
        
        this.fontSize(this.ctx.font, size)
        
        this.ctx.textAlign = align as CanvasTextAlign
        this.ctx.fillStyle = color
        this.ctx.fillText(text, x, y)        
    }

    public textOutline(
        text: string,
        x: number,
        y: number,
        color = "white",
        outline = "black",
        align = "center",
        size = 16,
        thickness = 8,
        font: Font | null = null
    ) {        
        if (font != null)
          this.ctx.font = font.name
        
        this.fontSize(this.ctx.font, size)
        
        this.ctx.textAlign = align as CanvasTextAlign

        this.ctx.strokeStyle = outline
        this.ctx.lineWidth = thickness
        this.ctx.strokeText(text, x, y)
        
        this.ctx.fillStyle = color
        this.ctx.fillText(text, x, y)        
    }
  
    public fontSize(font: string, size: number) {
        this.ctx.font = font.replace(/\d+px/, `${size}px`)
    }
  
    public measureText(text: string, size = 16, font: Font = null) {
        this.ctx.save()
        if (font != null)
          this.ctx.font = font.name
        this.fontSize(this.ctx.font, size)
        const metrics = this.ctx.measureText(text)
        this.ctx.restore()
        return { w: metrics.width, h: metrics.fontBoundingBoxAscent + metrics.fontBoundingBoxDescent }
    }
}

enum GameState {
    PREGAME = "pregame",
    LOADING = "loading",
    PLAYING = "playing",
    RESULTS = "results",
}

class GameManager {
    private static _instance: GameManager
    public static get instance() {
        return this._instance || (this._instance = new this())
    }

    public get started() {
        return this.state === GameState.PLAYING
    }

    public state: GameState = GameState.PREGAME
    public winner: "hide" | "seek" | null = null
    public transitionAlpha: number = 0
    public debug: boolean = true
}  

/** base asset class to handle file loading */
abstract class Asset {
    protected filePath: string
    public fileName: string
  
    constructor(filePath: string) {
        this.filePath = `./public/${filePath}`
  
        const directories = filePath.split('/')
        this.fileName = directories[directories.length - 1] ?? filePath
    }
}

/** image asset */
class Sprite extends Asset {
    public image: HTMLImageElement
    public loaded: boolean = false
  
    constructor(filePath: string) {
        super(filePath)
    
        const image = new Image()
        image.src = this.filePath
        image.onload = () => {
            this.loaded = true
        }
    
        this.image = image
    }
}   

type Animations = { [key: string]: Sprite[] }

/** collection of sprites */
class Animator {
    public animations: Animations
    private animation: keyof Animations

    public frame: number
    private time: number

    public get currentSprite() {
        return this.animations[this.animation][this.frame]
    }

    constructor(animation: keyof Animations, animations: Animations) {
        this.animations = animations
        this.animation = animation

        this.frame = 0
        this.time = 0
    }

    public update(dt: number) {
        this.time += dt
        if (this.time >= ANIM_FRAMERATE) {
            this.time = 0
            this.frame++
            this.frame = this.frame % this.animations[this.animation].length
        }
    }

    public setAnimation(animation: keyof Animations) {
        if (this.animation === animation) return
        this.animation = animation
        this.frame = 0
        this.time = 0
    }
}

/** font asset loaded as fontface rather than from css */
class Font extends Asset {
    private font: FontFace
    public name: string = ''
    public loaded: boolean = false
  
    constructor(name: string, path: string) {
        super(path)
        
        this.font = new FontFace(name, `url(${this.filePath})`)
        this.font.load().then((font) => {
            document.fonts.add(font)
            this.name = '12px ' + name
            this.loaded = true
        })
    }
}

type LevelData = {
    title: string
    bg: string
    width: number
    height: number
    startX: number
    startY: number
    blocks: number[]
}

class Level extends Asset {
    public title: string = 'undefined_level'

    public width: number = 0
    public height: number = 0

    public get rows() {
        return ~~(this.width / TILE_SIZE)
    }

    public get cols() {
       return (this.height / TILE_SIZE)
    }

    public startX: number = 0
    public startY: number = 0

    public blocks: boolean[] = []

    private sprite: Sprite
    public loaded: boolean = false

    constructor(filePath: string) {
        super(filePath)

        fetch(this.filePath)
            .then((res) => res.json())
            .then((data: LevelData) => {
                const { title, bg, width, height, startX, startY, blocks } = data

                this.title = title
                
                this.width = width
                this.height = height

                this.startX = startX
                this.startY = startY
        
                this.blocks = blocks.map((b) => !!b)

                this.sprite = new Sprite(bg)
                this.loaded = true
            })
    }
    
    public draw(gfx: Renderer, xView: number, yView: number) {
        // render background image
        if (this.sprite?.loaded)
        {
            if (!this.sprite.loaded) return
            
            let w = GAME_WIDTH
            let h = GAME_HEIGHT
            
            if (this.sprite.image.width - xView < w)
            w = this.sprite.image.width - xView
            if (this.sprite.image.height - yView < h)
            h = this.sprite.image.height - yView
            
            gfx.ctx.drawImage(this.sprite.image, xView, yView, w, h, 0, 0, w, h)
        }
        
        // render individual blocks
        if (this.loaded)
        {
            let w = GAME_WIDTH
            let h = GAME_HEIGHT

            if (this.width * TILE_SIZE - xView < w)
                w = this.width * TILE_SIZE - xView
            if (this.height * TILE_SIZE - yView < h)
                h = this.height * TILE_SIZE - yView

            const startX = Math.max(0, ~~(xView / TILE_SIZE))
            const startY = Math.max(0, ~~(yView / TILE_SIZE))
            
            const endX = Math.min(this.rows, startX + w / TILE_SIZE + 1)
            const endY = Math.min(this.cols, startY + h / TILE_SIZE + 1)

            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    const block = this.blocks[x + y * this.rows]

                    if (block) {
                        gfx.ctx.save()
                        gfx.ctx.fillStyle = "blue"
                        gfx.ctx.strokeStyle = "blue"
                        gfx.ctx.lineWidth = 1
                        gfx.ctx.beginPath()
                        gfx.ctx.rect(
                            x * TILE_SIZE - xView,
                            y * TILE_SIZE - yView,
                            1 * TILE_SIZE,
                            1 * TILE_SIZE
                        )
                        gfx.ctx.fill()
                        gfx.ctx.stroke()
                        gfx.ctx.restore()
                    }
                }
            }
        }
    }

    public drawDebug(gfx: Renderer, xView: number, yView: number) {
        if (this.loaded)
        {
            let w = GAME_WIDTH
            let h = GAME_HEIGHT

            if (this.width * TILE_SIZE - xView < w)
                w = this.width * TILE_SIZE - xView
            if (this.height * TILE_SIZE - yView < h)
                h = this.height * TILE_SIZE - yView

            const startX = Math.max(0, ~~(xView / TILE_SIZE))
            const startY = Math.max(0, ~~(yView / TILE_SIZE))
            
            const endX = Math.min(this.rows, startX + w / TILE_SIZE + 1)
            const endY = Math.min(this.cols, startY + h / TILE_SIZE + 1)

            for (let y = startY; y < endY; y++) {
                for (let x = startX; x < endX; x++) {
                    const block = this.blocks[x + y * this.rows]

                    if (block) {
                        gfx.ctx.save()
                        gfx.ctx.strokeStyle = "red"
                        gfx.ctx.lineWidth = 1
                        gfx.ctx.beginPath()
                        gfx.ctx.rect(
                            x * TILE_SIZE - xView,
                            y * TILE_SIZE - yView,
                            1 * TILE_SIZE,
                            1 * TILE_SIZE
                        )
                        gfx.ctx.stroke()
                        gfx.ctx.restore()
                    }
                }
            }
        }  
    }

    public check(x: number, y: number) {
        return this.blocks[x + y * this.rows]
    }
}

/** basic 2d camera to define viewport bounds */
class Camera {
    private static _instance: Camera
    public static get instance() {
        return this._instance || (this._instance = new this())
    }

    public xView: number = 0
    public yView: number = 0

    // center the camera viewport on a position
    public lookAt(x: number, y: number, ease: number = 0.1) {
        this.xView = lerp(this.xView, x - GAME_WIDTH / 2, ease)
        this.yView = lerp(this.yView, y - GAME_HEIGHT / 2, ease)

        const level = EntityManager.instance.level
        if (level)
            this.clamp(level)
    }

    // restrict within game bounds (between origin and total area)
    private clamp(level: Level) {
        this.xView = Math.min(this.xView, level.width - GAME_WIDTH)
        this.xView = Math.max(this.xView, 0)

        this.yView = Math.min(this.yView, level.height - GAME_HEIGHT)
        this.yView = Math.max(this.yView, 0)
    }
}

class AABB {
    public x: number
    public y: number
    public w: number
    public h: number

    get top() {
        return this.y
    }

    get bottom() {
        return this.y + this.h
    }

    get left() {
        return this.x
    }

    get right() {
        return this.x + this.w
    }

    constructor(x: number, y: number, w: number, h: number) {
        this.x = x
        this.y = y
        this.w = w
        this.h = h
    }

    public check(aabb: AABB) {
        return (
            this.left < aabb.right &&
            this.right > aabb.left &&
            this.top < aabb.bottom &&
            this.bottom > aabb.top
        )
    }
    
    public translate(x: number, y: number): AABB {
        return new AABB(this.x + x, this.y + y, this.w, this.h)
    }
}

type Entities = { [socketId: string]: Player }

class EntityManager {
    private static _instance: EntityManager
    public static get instance() {
        return this._instance || (this._instance = new this())
    }
    
    public entities: Entities = {}

    public level: Level | null = null

    public get player(): Player | null {
        return this.entities[SocketManager.instance.socketId]
    }

    public update(dt: number) {
        Object.values(this.entities)
            .forEach((entity) => entity.update(dt))
    }
  
    public draw(gfx: Renderer, xView: number, yView: number) {
        Object.values(this.entities)
            .sort((a, b) => a.y - b.y)
            .forEach((entity) => entity.draw(gfx, xView, yView))
    }

    public drawDebug(gfx: Renderer, xView: number, yView: number) {
        Object.values(this.entities)
            .forEach((entity) => entity.drawDebug(gfx, xView, yView))
    }
  
    public addEntity(socketId: string, entity: Player) {
        this.entities[socketId] = entity
    }
  
    public removeEntity(socketId: string) {
        if (socketId in this.entities)
            delete this.entities[socketId]
    }

    public setLevel(level: Level | null) {
        this.level = level
    }
}

enum Role {
    NONE = "none",
    READY = "ready",
    HIDE = "hide",
    SEEK = "seek",
    SPEC = "spectate",
}

enum Inputs {
    LEFT    = 1,
    RIGHT   = 2,
    UP      = 4,
    DOWN    = 8,
}

class Player {
    // online
    public socketId: string
    public username: string
    
    // status
    public player: boolean
    public role: Role
    public alive: boolean

    // keyboard events
    public keys: number = 0
    private actionDown: boolean = false
    private hasPressedKey: boolean = false
    private hasPressedAction: boolean = false

    // animation
    private animator: Animator
    private facing: boolean = true

    // transform
    public x: number
    public y: number
    public w: number
    public h: number

    private deadX: number = -1000
    private deadY: number = -1000

    get center() {
        return { x: this.x + this.w / 2, y: this.y + this.h / 2 }
    }

    // collision
    get aabb() {
        return new AABB(this.x + PLAYER_COLLIDER_OFFSET, this.y + PLAYER_COLLIDER_SIZE, PLAYER_COLLIDER_SIZE, PLAYER_COLLIDER_SIZE)
    }

    // interact
    public target: Player | null = null

    constructor(username: string, role: Role, socketId: string, player: boolean, alive: boolean) {
        this.x = 0
        this.y = 0
        this.w = PLAYER_WIDTH
        this.h = PLAYER_HEIGHT

        this.username = username
        this.socketId = socketId
        this.role = role

        this.player = player
        this.alive = alive

        if (this.player) {
            document.onkeydown = (e) => this.keyDown(e)
            document.onkeyup = (e) => this.keyUp(e)
        }

        this.animator = new Animator("idle", {
            idle: [new Sprite("sprites/idle.png")],
            walk: [
                new Sprite("sprites/Walk0001.png"),
                new Sprite("sprites/Walk0002.png"),
                new Sprite("sprites/Walk0003.png"),
                new Sprite("sprites/Walk0004.png"),
                new Sprite("sprites/Walk0005.png"),
                new Sprite("sprites/Walk0006.png"),
                new Sprite("sprites/Walk0007.png"),
                new Sprite("sprites/Walk0008.png"),
                new Sprite("sprites/Walk0009.png"),
                new Sprite("sprites/Walk0010.png"),
                new Sprite("sprites/Walk0011.png"),
                new Sprite("sprites/Walk0012.png"),
            ],
            ghost: [new Sprite("sprites/Ghost0001.png")],
            dead: [new Sprite("sprites/dead.png")],
        })
    }
    
    public update(dt: number) {
        // step animation state
        this.animator.update(dt)

        // move player
        const dir = { x: 0, y: 0 }
        dir.x = (-(!!(this.keys & Inputs.LEFT)) + +(!!(this.keys & Inputs.RIGHT)))
        dir.y = (-(!!(this.keys & Inputs.UP)) + +(!!(this.keys & Inputs.DOWN)))

        if (!!dir.x) this.facing = dir.x > 0

        if (this.alive) {
            if (!!dir.x || !!dir.y) this.animator.setAnimation("walk")
            else this.animator.setAnimation("idle")
        }

        if (+dir.x && +dir.y) {
            const dirLength = Math.sqrt(dir.x * dir.x + dir.y * dir.y)
            dir.x /= dirLength
            dir.y /= dirLength
        }

        const dX = dir.x * PLAYER_SPEED * dt 
        const dY = dir.y * PLAYER_SPEED * dt 

        const level = EntityManager.instance.level
        if (this.alive && level) {
            // horizontal collision resolution
            if (Math.abs(dX) > 0)
            {
                const collider = this.aabb.translate(dX, 0)

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
                    if (Math.sign(dX) === 1) this.x = topLeft.x * TILE_SIZE + collider.w + PLAYER_COLLIDER_OFFSET - 1
                    else this.x = topRight.x * TILE_SIZE - PLAYER_COLLIDER_OFFSET
                } else this.x += dX
            }
            
            // vertical collision resolution
            if (Math.abs(dY) > 0)
            {
                const collider = this.aabb.translate(0, dY)

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
                    if (Math.sign(dY) === 1) this.y = topLeft.y * TILE_SIZE + PLAYER_COLLIDER_SIZE / 2 - 1
                    else this.y = botLeft.y * TILE_SIZE - PLAYER_COLLIDER_SIZE
                } else this.y += dY
            }
        } else {
            this.x += dX
            this.y += dY
        }

        if (GameManager.instance.started) {
            // check for closest nearby interactive entity
            if (this.player && this.role === Role.SEEK) {
                this.target = null
                let min = INTERACT_DISTANCE
                Object.keys(EntityManager.instance.entities).forEach((id) => {
                    if (id !== this.socketId) {
                        const e = EntityManager.instance.entities[id]

                        // skip players who are already dead
                        if (e.role !== Role.SPEC) {
                            const { x, y } = e.center

                            const distance = dist({ x: this.x, y: this.y }, { x, y })

                            if (distance < min) {
                                min = distance
                                this.target = e
                            }
                        }
                    }
                })
                
                if (!!this.target && this.hasPressedAction) {
                    this.hasPressedAction = false

                    this.target.interact()
                    this.target = null
                }
            }
        } else {
            if (this.hasPressedAction) {
                this.hasPressedAction = false
                this.role = this.role === Role.READY ? Role.NONE : Role.READY

                SocketManager.instance.socket.emit('ready', { socketId: this.socketId, ready: this.role === Role.READY })
            }
        }
    }

    public draw(gfx: Renderer, xView: number, yView: number) {
        const sprite = this.animator.currentSprite
        if (sprite.loaded) {
            gfx.ctx.save()

            if (!this.facing) {
                // gfx.ctx.translate(GAME_WIDTH, 0)
                // gfx.ctx.scale(-1, 1)
            }

            gfx.textOutline(
                this.username,
                (this.alive ? this.x : this.deadX) + this.w / 2 - xView,
                (this.alive ? this.y : this.deadY) - yView,
                this.alive ? "white" : "red",
                "black",
                "center",
                24,
                4
            )

            gfx.ctx.drawImage(
                sprite.image,
                0,
                0,
                sprite.image.width,
                sprite.image.height,
                (this.alive ? this.x : this.deadX) - xView,
                (this.alive ? this.y : this.deadY) - yView,
                this.w,
                this.h
            )

            gfx.ctx.restore()

            if (!this.alive && !EntityManager.instance.player.alive) {
                gfx.ctx.save()
                gfx.ctx.globalAlpha = 0.6
                const sprite = this.animator.animations['ghost'][0]
                if (sprite.loaded) {
                    gfx.ctx.drawImage(
                        sprite.image,
                        0,
                        0,
                        sprite.image.width,
                        sprite.image.height,
                        this.x - xView,
                        this.y - yView,
                        this.w,
                        this.h
                    )
                }
                gfx.ctx.restore()
            }
        }
    }

    public drawDebug(gfx: Renderer, xView: number, yView: number) {
        if (!this.player) return

        if (this.target) {
            const { x: pX, y: pY } = this.center
            const { x: tX, y: tY } = this.target.center
            gfx.line(
                pX - xView,
                tX - xView,
                pY  - yView,
                tY - yView,
                2,
                "#00ff00"
            )
        }

        gfx.emptyRectangle(
            this.x - xView,
            this.y - yView,
            this.w,
            this.h,
            1,
            "yellow"
        )

        gfx.emptyRectangle(
            this.aabb.x - xView,
            this.aabb.y - yView,
            this.aabb.w,
            this.aabb.h,
            2,
            "#ff0000"
        )
    }

    private keyDown(e: KeyboardEvent) {
        // e.preventDefault()

        switch (e.key) {
            case 'a':
            case 'ArrowLeft':
                if (!(this.keys & Inputs.LEFT)) this.hasPressedKey = true
                this.keys |= Inputs.LEFT
                break

            case 'd':
            case 'ArrowRight':
                if (!(this.keys & Inputs.RIGHT)) this.hasPressedKey = true
                this.keys |= Inputs.RIGHT
                break

            case 'w':
            case 'ArrowUp':
                if (!(this.keys & Inputs.UP)) this.hasPressedKey = true
                this.keys |= Inputs.UP
                break

            case 's':
            case 'ArrowDown':
                if (!(this.keys & Inputs.DOWN)) this.hasPressedKey = true
                this.keys |= Inputs.DOWN
                break

            case ' ':
            case 'e':
                if (!this.actionDown) this.hasPressedAction = true
                this.actionDown = true
                break

            case 'r':
                this.role = Role.SEEK
                break
        }

        if (this.hasPressedKey) {
            SocketManager.instance.socket.emit('input', this.keys)
            this.hasPressedKey = false
        }
    }

    private keyUp(e: KeyboardEvent) {
        switch (e.key) {
            case 'a':
            case 'ArrowLeft':
                this.keys &= ~Inputs.LEFT
                break

            case 'd':
            case 'ArrowRight':
                this.keys &= ~Inputs.RIGHT
                break

            case 'w':
            case 'ArrowUp':
                this.keys &= ~Inputs.UP
                break

            case 's':
            case 'ArrowDown':
                this.keys &= ~Inputs.DOWN
                break

            case ' ':
            case 'e':
                this.actionDown = false
                break

            case '`':
                GameManager.instance.debug = !GameManager.instance.debug
                break
        }

        SocketManager.instance.socket.emit('input', this.keys)
    }

    public interact() {
        SocketManager.instance.socket.emit('kill', { socketId: this.socketId })
    }

    public kill() {
        this.role = Role.SPEC
        this.alive = false
        
        this.deadX = this.x
        this.deadY = this.y
        
        this.animator.setAnimation('dead')
    }
}

/** light code from https://ncase.me/sight-and-light/ */
function getIntersection(ray, segment){
	// RAY in parametric: Point + Delta*T1
	var r_px = ray.a.x
	var r_py = ray.a.y
	var r_dx = ray.b.x - ray.a.x
	var r_dy = ray.b.y - ray.a.y

	// SEGMENT in parametric: Point + Delta*T2
	var s_px = segment.a.x
	var s_py = segment.a.y
	var s_dx = segment.b.x - segment.a.x
	var s_dy = segment.b.y - segment.a.y

	// Are they parallel? If so, no intersect
	var r_mag = Math.sqrt(r_dx * r_dx + r_dy * r_dy)
	var s_mag = Math.sqrt(s_dx * s_dx + s_dy * s_dy)
	if (r_dx / r_mag == s_dx / s_mag && r_dy / r_mag == s_dy / s_mag) {
		// Unit vectors are the same.
		return null
	}

	// SOLVE FOR T1 & T2
	// r_px+r_dx*T1 = s_px+s_dx*T2 && r_py+r_dy*T1 = s_py+s_dy*T2
	// ==> T1 = (s_px+s_dx*T2-r_px)/r_dx = (s_py+s_dy*T2-r_py)/r_dy
	// ==> s_px*r_dy + s_dx*T2*r_dy - r_px*r_dy = s_py*r_dx + s_dy*T2*r_dx - r_py*r_dx
	// ==> T2 = (r_dx*(s_py-r_py) + r_dy*(r_px-s_px))/(s_dx*r_dy - s_dy*r_dx)
	var T2 = (r_dx * (s_py - r_py) + r_dy * (r_px - s_px)) / (s_dx * r_dy - s_dy * r_dx)
	var T1 = (s_px + s_dx * T2 - r_px) / r_dx

	// Must be within parametic whatevers for RAY/SEGMENT
	if (T1 < 0) return null
	if (T2 < 0 || T2>1) return null

	// Return the POINT OF INTERSECTION
	return {
		x: r_px + r_dx * T1,
		y: r_py + r_dy * T1,
		param: T1
	}
}

type LightsPolygon = {
    x: number,
    y: number,
    angle: number,
    param: number
}[]

function getSightPolygon(pX: number, pY: number, xView: number, yView: number, level: Level) {
    let w = GAME_WIDTH
    let h = GAME_HEIGHT

    if (level.width * TILE_SIZE - xView < w)
        w = level.width * TILE_SIZE - xView
    if (level.height * TILE_SIZE - yView < h)
        h = level.height * TILE_SIZE - yView

    const startX = Math.max(0, ~~(xView / TILE_SIZE))
    const startY = Math.max(0, ~~(yView / TILE_SIZE))
    
    const endX = Math.min(level.rows, startX + w / TILE_SIZE + 1)
    const endY = Math.min(level.cols, startY + h / TILE_SIZE + 1)

    const segments: {
        a: { x: number, y: number },
        b: { x: number, y: number }
    }[] = []

    for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
            if (level.blocks[x + y * level.rows]) {
                segments.push(
                    { a: { x: x * TILE_SIZE, y: y * TILE_SIZE }, b: { x: x * TILE_SIZE + TILE_SIZE, y: y * TILE_SIZE } },
                    { a: { x: x * TILE_SIZE + TILE_SIZE, y: y * TILE_SIZE }, b: { x: x * TILE_SIZE + TILE_SIZE, y: y * TILE_SIZE + TILE_SIZE } },
                    { a: { x: x * TILE_SIZE + TILE_SIZE, y: y * TILE_SIZE + TILE_SIZE }, b: { x: x * TILE_SIZE, y: y * TILE_SIZE + TILE_SIZE } },
                    { a: { x: x * TILE_SIZE, y: y * TILE_SIZE + TILE_SIZE }, b: { x: x * TILE_SIZE, y: y * TILE_SIZE } }
                )
            }
        }
    }

    // add screen border
    segments.push({ a: { x: xView, y: yView }, b: { x: xView + GAME_WIDTH, y: yView } })
    segments.push({ a: { x: xView + GAME_WIDTH, y: yView }, b: { x: xView + GAME_WIDTH, y: yView + GAME_HEIGHT } })
    segments.push({ a: { x: xView + GAME_WIDTH, y: yView + GAME_HEIGHT }, b: { x: xView, y: yView + GAME_HEIGHT } })
    segments.push({ a: { x: xView, y: yView + GAME_HEIGHT }, b: { x: xView, y: yView } })

    const points = new Set<{ x: number, y: number, angle: number }>()

    segments.forEach((segment) => {
        points.add({ ...segment.a, angle: 0 })
        points.add({ ...segment.b, angle: 0 })
    })

    const angles = new Set<number>()
    points.forEach((point) => {
        const angle = Math.atan2(point.y - pY, point.x - pX)
        point.angle = angle
        angles.add(angle - 0.00001)
        angles.add(angle)
        angles.add(angle + 0.00001)
    })

    let intersects: LightsPolygon = []
    for (let i = 0; i < angles.size; i++) {
        const angle = [...angles][i]

        const dx = Math.cos(angle)
		const dy = Math.sin(angle)

        const ray = {
			a:{ x: pX, y: pY },
			b:{ x: pX + dx, y: pY + dy }
		}

        let closestIntersect: any | null = null
        for (let j = 0; j < segments.length; j++) {
            const intersect = getIntersection(ray, segments[j])
            if (!intersect) continue
			if (!closestIntersect || intersect.param < closestIntersect.param)
				closestIntersect = intersect
        }

        if(!closestIntersect) continue
		closestIntersect.angle = angle

		// Add to list of intersects
		intersects.push(closestIntersect)
    }

    intersects = intersects.sort((a,b) => a.angle - b.angle)

    return intersects
}

function drawLightsPolygon(gfx: Renderer, polygon: LightsPolygon, fillStyle: string, xView: number, yView: number) {
    gfx.ctx.save()
	gfx.ctx.fillStyle = fillStyle
	gfx.ctx.beginPath()
    gfx.ctx.moveTo(polygon[0].x - xView, polygon[0].y - yView)
	for (let i = 1; i < polygon.length; i++) {
		const intersect = polygon[i]
		gfx.ctx.lineTo(intersect.x - xView, intersect.y - yView)
	}
	gfx.ctx.fill()
    gfx.ctx.restore()
}

function drawLights(gfx: Renderer, xView: number, yView: number) {
    const { player, level } = EntityManager.instance
    if (!player || !level) return

    const { x: pX, y: pY } = player.center
    const PLAYER_Y_OFFSET = PLAYER_COLLIDER_SIZE / 2

	const polygon = getSightPolygon(pX, pY + PLAYER_Y_OFFSET, xView, yView, level)
    drawLightsPolygon(gfx, polygon, "#fff", xView, yView)
}

function drawLightsDebug(gfx: Renderer, xView: number, yView: number) {
    const { player, level } = EntityManager.instance
    if (!player || !level) return

    const { x: pX, y: pY } = player.center
    const PLAYER_Y_OFFSET = PLAYER_COLLIDER_SIZE / 2

	const polygon = getSightPolygon(pX, pY + PLAYER_Y_OFFSET, xView, yView, level)

    gfx.ctx.save()
    gfx.ctx.strokeStyle = "#f55"
    for (let i = 0; i < polygon.length; i++) {
        const intersect = polygon[i]
        gfx.ctx.beginPath()
        gfx.ctx.moveTo(pX - xView, pY + PLAYER_Y_OFFSET - yView)
        gfx.ctx.lineTo(intersect.x - xView, intersect.y - yView)
        gfx.ctx.stroke()
    }
    gfx.ctx.restore()
}

function drawSpotlight(gfx: Renderer, xView: number, yView: number) {
    const player = EntityManager.instance.player
    if (!player) return
    const { x: pX, y: pY } = player.center

    const spotlight = gfx.ctx.createRadialGradient(
        pX - xView,
        pY - yView,
        PLAYER_COLLIDER_SIZE,
        pX - xView,
        pY - yView,
        PLAYER_COLLIDER_SIZE * 10
    )

    spotlight.addColorStop(player.role === Role.SEEK ? 0.1 : 0.2, 'transparent')
    spotlight.addColorStop(player.role === Role.SEEK ? 0.5 : 1.0, 'black')

    gfx.ctx.fillStyle = spotlight
    gfx.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
}

window.onload = function () {
    const form = document.createElement('form')

    const label = document.createElement('label')
    label.className = 'label'
    label.htmlFor = 'username'
    label.innerText = 'Enter Name'
    
    const input = document.createElement('input')
    input.className = 'input'
    input.id = 'username'
    input.required = true
    input.autocomplete = 'off'

    const button = document.createElement('button')
    button.className = 'button'
    button.type = 'submit'
    button.innerText = 'ENTER'

    form.append(label, input, button)
    document.body.appendChild(form)

    form.onsubmit = (e) => {
        if (input.value.length < 3 || input.value.length > 16) return

        e.preventDefault()
        form.remove()

        const canvas = document.createElement('canvas')
        const buffer = document.createElement('canvas')
        canvas.width  = buffer.width = GAME_WIDTH
        canvas.height = buffer.height = GAME_HEIGHT
        canvas.style.background = "black"
        canvas.style.width = "100%"
        document.body.appendChild(canvas)

        const ctx = canvas.getContext('2d')
        const bufferCtx = buffer.getContext('2d')
        const bufferGfx = new Renderer(bufferCtx)

        class Amogus extends Game {
            public start() {
                SocketManager.instance.init(input.value)

                const level = new Level("maps/lobby.json")
                EntityManager.instance.setLevel(level)
            }
            
            protected update(dt: number) {
                EntityManager.instance.update(dt)

                const player = EntityManager.instance.player
                if (player) {
                    const { x: pX, y: pY } = player.center
                    Camera.instance.lookAt(pX, pY)
                }

                // update transition alpha
                GameManager.instance.transitionAlpha = lerp(
                    GameManager.instance.transitionAlpha,
                    GameManager.instance.state === GameState.LOADING || GameManager.instance.state === GameState.RESULTS ? 1 : 0,
                    0.03
                )
            }
            
            protected draw(gfx: Renderer) {
                gfx.clearScreen()
                bufferGfx.clearScreen()
                
                // draw game onto buffer canvas
                EntityManager.instance.level?.draw(bufferGfx, Camera.instance.xView, Camera.instance.yView)
                EntityManager.instance.draw(bufferGfx, Camera.instance.xView, Camera.instance.yView)
                
                // draw shadow mask to hide the map/other players
                const shouldRenderShadows = GameManager.instance.started && EntityManager.instance.player?.alive
                if (shouldRenderShadows) {
                    drawLights(gfx, Camera.instance.xView, Camera.instance.yView)
                    gfx.ctx.globalCompositeOperation = "source-in"
                }
                
                // render buffer canvas as image
                gfx.ctx.drawImage(buffer, 0, 0)
                
                if (shouldRenderShadows) {
                    gfx.ctx.globalCompositeOperation = "source-over"
                    drawSpotlight(gfx, Camera.instance.xView, Camera.instance.yView)
                }

                // render transition state
                gfx.ctx.save()
                gfx.ctx.fillStyle = `rgba(0, 0, 0, ${GameManager.instance.transitionAlpha})`
                gfx.ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
                gfx.ctx.restore()

                // game status text
                switch (GameManager.instance.state) {
                    // num players ready
                    case GameState.PREGAME: {
                        const ready = Object.values(EntityManager.instance.entities).filter((e) => e.role === Role.READY).length
                        const total = Object.keys(EntityManager.instance.entities).length
                        const playersText = `${ready} / ${total} players ready`
                        const { h: playersTextH } = gfx.measureText(playersText, 32)
                        gfx.textOutline(playersText, GAME_WIDTH / 2, GAME_HEIGHT - 16, ready === total ? "#00ff00" : ready > 0 ? "yellow" : "red", "black", "center", 32, 4)

                        const instructionText = `Press SPACE or E to READY`
                        gfx.textOutline(instructionText, GAME_WIDTH / 2, GAME_HEIGHT - 16 - playersTextH, "white", "black", "center", 24, 4)
                        break
                    }

                    // num players alive
                    case GameState.PLAYING: {
                        const alive = Object.values(EntityManager.instance.entities).filter((e) => e.alive).length
                        const total = Object.keys(EntityManager.instance.entities).length
                        const playersText = `${alive} / ${total} players alive`
                        gfx.textOutline(playersText, GAME_WIDTH / 2, GAME_HEIGHT - 16, alive === total ? "#00ff00" : alive > 2 ? "yellow" : "red", "black", "center", 32, 4)
                        break
                    }

                    // winner
                    case GameState.RESULTS: {
                        const winText = `${GameManager.instance.winner} has won`
                        gfx.text(winText, GAME_WIDTH / 2, GAME_HEIGHT / 2, `rgba(255, 255, 255, ${GameManager.instance.transitionAlpha})`, "center", 48)
                        break
                    }
                }

                if (GameManager.instance.debug) this.drawDebug(gfx)
            }

            private drawDebug(gfx: Renderer) {
                // render shadow caster debug
                if (GameManager.instance.started && EntityManager.instance.player?.alive)
                    drawLightsDebug(gfx, Camera.instance.xView, Camera.instance.yView)

                EntityManager.instance.level?.drawDebug(gfx, Camera.instance.xView, Camera.instance.yView)
                EntityManager.instance.drawDebug(gfx, Camera.instance.xView, Camera.instance.yView)

                const player = EntityManager.instance.player
                if (!player) return

                // display player socket id
                const socketText = `socket id: ${player.socketId}`
                const { h: socketH } = gfx.measureText(socketText, 24)
                gfx.text(socketText, 8, socketH, "white", "left", 24)

                // display game state
                const gameText = `game state: ${GameManager.instance.state}`
                const { h: gameH } = gfx.measureText(gameText, 24)
                gfx.text(gameText, 8, socketH + gameH, "white", "left", 24)

                // display player role
                const roleText = `role: ${player.role}`
                const { h: roleH } = gfx.measureText(roleText, 24)
                gfx.text(roleText, 8, socketH + gameH + roleH, "white", "left", 24)
                
                // display player position
                const posText = `x: ${Math.round(player.x)}, y: ${Math.round(player.y)}`
                const { h: posH } = gfx.measureText(posText, 24)
                gfx.text(posText, 8, socketH + gameH + roleH + posH, "white", "left", 24)
            }
        }

        const game = new Amogus(ctx)
        game.start()
        game.run()
    }
}
