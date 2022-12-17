const io = require("socket.io-client")

/// CONSTANTS ///
const GAME_WIDTH = 1280
const GAME_HEIGHT = 720

const WORLD_WIDTH = 7680
const WORLD_HEIGHT = 4320

const TILE_SIZE = 160

const ANIM_FRAMERATE = 0.041

const INTERACT_DISTANCE = 256
const PLAYER_SPEED = 512  

const PLAYER_WIDTH = 96
const PLAYER_HEIGHT = 128
const PLAYER_COLLIDER_SIZE = 64
const PLAYER_COLLIDER_OFFSET = 16
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
            const x = 256 + Math.random() * 256
            const y = 256 + Math.random() * 256
            this.socket.emit('join', { name, x, y })
        })

        this.socket.on('returnPlayer', (player) => {
            const { name, role, socketId, alive } = player
            EntityManager.instance.addEntity(
                socketId,
                new Player(name, role, socketId, true, alive)
            )

            // if the returned player has a spectator role,
            // we can assume the game has already started
            if (role === Role.SPEC)
                GameManager.instance.state = GameState.PLAYING
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
                    const { x, y } = positions[id]
                    const player = EntityManager.instance.entities[id]

                    // lerp towards the correct position (so we don't stutter/jump)
                    player.x = lerp(player.x, x, 0.2)
                    player.y = lerp(player.y, y, 0.2)
                }
            }
        })

        this.socket.on('starting', () => {
            GameManager.instance.state = GameState.LOADING
        })

        this.socket.on('gameStarted', () => {
            setTimeout(() => GameManager.instance.state = GameState.PLAYING, 1000)

            const level = new Level("maps/lvl0.json")
            EntityManager.instance.setLevel(level)
        })

        this.socket.on('gameEnded', (data) => {
            const { won } = data

            EntityManager.instance.setLevel(null)

            GameManager.instance.state = GameState.RESULTS
            GameManager.instance.winner = won ? "hide" : "seek"
        })

        this.socket.on('gameRestart', () => {
            GameManager.instance.state = GameState.PREGAME
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

class Background {
    private sprite: Sprite

    constructor() {
        this.sprite = new Sprite('sprites/map.jpeg')
    }

    public draw(gfx: Renderer, xView: number, yView: number) {
        if (!this.sprite.loaded) return

        let w = GAME_WIDTH
	    let h = GAME_HEIGHT

	    if (this.sprite.image.width - xView < w)
	        w = this.sprite.image.width - xView
	    if (this.sprite.image.height - yView < h)
	        h = this.sprite.image.height - yView

	    gfx.ctx.drawImage(this.sprite.image, xView, yView, w, h, 0, 0, w, h)
    }
}

type LevelData = {
    title: string
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

    public loaded: boolean = false

    constructor(filePath: string) {
        super(filePath)

        fetch(this.filePath)
            .then((res) => res.json())
            .then((data: LevelData) => {
                const { title, width, height, startX, startY, blocks } = data

                this.title = title
                
                this.width = width
                this.height = height

                this.startX = startX
                this.startY = startY
        
                this.blocks = blocks.map((b) => !!b)

                this.loaded = true
            })
    }

    public draw(gfx: Renderer, xView: number, yView: number) {
        if (!this.loaded) return

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

        this.clamp()
    }

    // restrict within game bounds (between origin and total area)
    private clamp() {
        this.xView = Math.min(this.xView, WORLD_WIDTH - GAME_WIDTH)
        this.xView = Math.max(this.xView, 0)

        this.yView = Math.min(this.yView, WORLD_HEIGHT - GAME_HEIGHT)
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
        return [this.x + this.w / 2, this.y + this.h / 2]
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
                            const [x, y] = e.center

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
            const [pX, pY] = this.center
            const [tX, tY] = this.target.center
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

window.onload = function () {
    const form = document.createElement('form')

    const label = document.createElement('label')
    label.setAttribute('for', 'username')
    label.innerText = 'Enter Name'
    
    const input = document.createElement('input')
    input.setAttribute('id', 'username')

    const button = document.createElement('button')
    button.setAttribute('type', 'submit')
    button.innerText = 'ENTER'

    form.append(label, input, button)
    document.body.appendChild(form)

    form.onsubmit = (e) => {
        e.preventDefault()
        form.remove()

        // const canvas = document.getElementById('canvas') as HTMLCanvasElement
        const canvas = document.createElement("canvas")
        canvas.width = GAME_WIDTH
        canvas.height = GAME_HEIGHT
        canvas.style.background = "black"
        canvas.style.width = "100%"
        document.body.appendChild(canvas)

        const ctx = canvas.getContext('2d')

        const bg = new Background()
        
        class Amogus extends Game {
            public start() {
                SocketManager.instance.init(input.value)
            }
            
            protected update(dt: number) {
                EntityManager.instance.update(dt)

                const player = EntityManager.instance.player
                if (player) {
                    const [pX, pY] = player.center
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

                bg.draw(gfx, Camera.instance.xView, Camera.instance.yView)
                
                EntityManager.instance.level?.draw(gfx, Camera.instance.xView, Camera.instance.yView)
                EntityManager.instance.draw(gfx, Camera.instance.xView, Camera.instance.yView)

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
